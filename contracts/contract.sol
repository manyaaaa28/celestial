// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title GasOptimizedScheduler
/// @notice Schedule ETH transactions to execute only when gas fees are low enough
/// @dev Beginner-friendly contract — no external oracles, uses tx.gasprice for checks

contract GasOptimizedScheduler {

    // ─────────────────────────────────────────────
    //  DATA STRUCTURES
    // ─────────────────────────────────────────────

    /// @notice Represents a single scheduled transaction
    struct ScheduledTx {
        address payable recipient;   // Who receives the ETH
        uint256 amount;              // How much ETH (in wei) to send
        uint256 maxGasPrice;         // Execute only when gas price <= this (in wei)
        uint256 expiry;              // Unix timestamp after which the tx can't run
        address owner;               // Who created this scheduled tx
        bool executed;               // Has it already been executed?
        bool cancelled;              // Was it cancelled by the owner?
    }

    // ─────────────────────────────────────────────
    //  STATE VARIABLES
    // ─────────────────────────────────────────────

    uint256 public txCounter;                          // Auto-incrementing ID
    mapping(uint256 => ScheduledTx) public scheduledTxs; // id → transaction

    // ─────────────────────────────────────────────
    //  EVENTS  (cheap on-chain logging)
    // ─────────────────────────────────────────────

    event TransactionScheduled(
        uint256 indexed txId,
        address indexed owner,
        address recipient,
        uint256 amount,
        uint256 maxGasPrice,
        uint256 expiry
    );

    event TransactionExecuted(
        uint256 indexed txId,
        address indexed executor,
        uint256 gasPrice
    );

    event TransactionCancelled(uint256 indexed txId, address indexed owner);

    // ─────────────────────────────────────────────
    //  ERRORS  (gas-efficient reverts in Solidity 0.8+)
    // ─────────────────────────────────────────────

    error NotOwner();
    error AlreadyExecuted();
    error AlreadyCancelled();
    error Expired();
    error GasTooHigh(uint256 current, uint256 maximum);
    error InsufficientFunds();
    error TransferFailed();
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidExpiry();

    // ─────────────────────────────────────────────
    //  MODIFIERS
    // ─────────────────────────────────────────────

    /// @dev Reverts if caller is not the transaction owner
    modifier onlyTxOwner(uint256 txId) {
        if (scheduledTxs[txId].owner != msg.sender) revert NotOwner();
        _;
    }

    // ═════════════════════════════════════════════
    //  FUNCTION 1 — scheduleTransaction
    // ═════════════════════════════════════════════

    /// @notice Create a new scheduled transaction.
    ///         The ETH you want to send must be attached (msg.value).
    ///
    /// @param recipient   The wallet that will receive the ETH
    /// @param maxGasPrice Max gas price (wei) at which this may execute
    /// @param expiry      Unix timestamp deadline (must be in the future)
    ///
    /// @return txId  The ID you use to manage this scheduled tx later
    function scheduleTransaction(
        address payable recipient,
        uint256 maxGasPrice,
        uint256 expiry
    ) external payable returns (uint256 txId) {

        // ── Input validation ───────────────────────
        if (recipient == address(0))       revert InvalidRecipient();
        if (msg.value == 0)                revert InvalidAmount();
        if (expiry <= block.timestamp)     revert InvalidExpiry();

        // ── Store the transaction ──────────────────
        txId = txCounter++;               // assign then increment

        scheduledTxs[txId] = ScheduledTx({
            recipient:   recipient,
            amount:      msg.value,       // ETH locked in this contract
            maxGasPrice: maxGasPrice,
            expiry:      expiry,
            owner:       msg.sender,
            executed:    false,
            cancelled:   false
        });

        emit TransactionScheduled(
            txId,
            msg.sender,
            recipient,
            msg.value,
            maxGasPrice,
            expiry
        );
    }

    // ═════════════════════════════════════════════
    //  FUNCTION 2 — checkCondition
    // ═════════════════════════════════════════════

    /// @notice Pure read — tells you whether a scheduled tx is ready to execute.
    ///         Does NOT change state; free to call off-chain.
    ///
    /// @param txId  The transaction to inspect
    ///
    /// @return ready        true if all conditions pass right now
    /// @return reason       Human-readable status string
    /// @return currentGas   Current gas price in wei for reference
    function checkCondition(uint256 txId)
        external
        view
        returns (bool ready, string memory reason, uint256 currentGas)
    {
        ScheduledTx storage t = scheduledTxs[txId];
        currentGas = tx.gasprice;

        if (t.executed)                        return (false, "Already executed",   currentGas);
        if (t.cancelled)                       return (false, "Cancelled by owner", currentGas);
        if (block.timestamp > t.expiry)        return (false, "Transaction expired", currentGas);
        if (tx.gasprice > t.maxGasPrice)       return (false, "Gas price too high",  currentGas);

        return (true, "Ready to execute", currentGas);
    }

    // ═════════════════════════════════════════════
    //  FUNCTION 3 — executeTransaction
    // ═════════════════════════════════════════════

    /// @notice Execute a scheduled transaction if its gas condition is met.
    ///         Anyone can call this — useful for keepers / bots.
    ///         The ETH is sent to the original recipient.
    ///
    /// @param txId  The transaction to execute
    function executeTransaction(uint256 txId) external {
        ScheduledTx storage t = scheduledTxs[txId];

        // ── Guard checks ───────────────────────────
        if (t.executed)                        revert AlreadyExecuted();
        if (t.cancelled)                       revert AlreadyCancelled();
        if (block.timestamp > t.expiry)        revert Expired();
        if (tx.gasprice > t.maxGasPrice)
            revert GasTooHigh(tx.gasprice, t.maxGasPrice);

        // ── Mark executed BEFORE transfer (re-entrancy guard) ──
        t.executed = true;

        // ── Send ETH ────────────────────────────────
        (bool success, ) = t.recipient.call{value: t.amount}("");
        if (!success) revert TransferFailed();

        emit TransactionExecuted(txId, msg.sender, tx.gasprice);
    }

    // ═════════════════════════════════════════════
    //  FUNCTION 4 — cancelTransaction
    // ═════════════════════════════════════════════

    /// @notice Cancel a pending transaction and refund the locked ETH.
    ///         Only the original owner may cancel.
    ///
    /// @param txId  The transaction to cancel
    function cancelTransaction(uint256 txId) external onlyTxOwner(txId) {
        ScheduledTx storage t = scheduledTxs[txId];

        if (t.executed)   revert AlreadyExecuted();
        if (t.cancelled)  revert AlreadyCancelled();

        t.cancelled = true;

        // Refund locked ETH to the owner
        (bool success, ) = payable(msg.sender).call{value: t.amount}("");
        if (!success) revert TransferFailed();

        emit TransactionCancelled(txId, msg.sender);
    }

    // ═════════════════════════════════════════════
    //  FUNCTION 5 — getTransaction
    // ═════════════════════════════════════════════

    /// @notice Read all details of a scheduled transaction.
    ///
    /// @param txId  The transaction ID to look up
    /// @return The full ScheduledTx struct
    function getTransaction(uint256 txId)
        external
        view
        returns (ScheduledTx memory)
    {
        return scheduledTxs[txId];
    }

    // ─────────────────────────────────────────────
    //  HELPERS
    // ─────────────────────────────────────────────

    /// @notice Returns the current gas price in wei and in Gwei for convenience
    function currentGasInfo()
        external
        view
        returns (uint256 gasPriceWei, uint256 gasPriceGwei)
    {
        gasPriceWei  = tx.gasprice;
        gasPriceGwei = tx.gasprice / 1 gwei;
    }

    /// @notice How much ETH is locked in this contract right now
    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
