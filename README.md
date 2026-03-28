# ⛽ GasGuard — Smart Gas Scheduler

> **Schedule Ethereum transactions to auto-execute when gas prices are lowest**

A beginner-friendly blockchain project built with **Hardhat + Solidity + ethers.js**.

---

## 🧠 App Flow

```
User connects MetaMask
       │
       ├─► [Send Now]              → Instant ETH transfer
       │
       └─► [Schedule Transaction] → Locks ETH in contract
                                     Contract checks gas price
                                     Auto-executes when gas ≤ your limit ✅
```

## ✨ Features

- 🦊 **MetaMask wallet** connect (Sepolia testnet + Hardhat local)
- ⚡ **Send Now** — instant direct ETH transfer
- 🕐 **Schedule Transaction** — lock ETH, set a max gas price & deadline
- 📊 **Live stats** — wallet balance, contract balance, gas price, tx count
- ✅ **Execute / ❌ Cancel** scheduled transactions from the UI
- 📋 Full transaction history table with status badges

## 🗂 Project Structure

```
blockchain-project/
├── contracts/
│   └── contract.sol       # GasOptimizedScheduler smart contract
├── scripts/
│   ├── deploy.cjs         # Deploy script
│   └── interact.cjs       # Interaction demo
├── index.html             # Frontend UI (open in browser!)
├── hardhat.config.cts
└── package.json
```

## 🚀 Quick Start

### 1. Install & Compile

```bash
npm install
npx hardhat compile
```

### 2. Run locally (Hardhat node)

```bash
# Terminal 1 — start local blockchain
npx hardhat node

# Terminal 2 — deploy contract
npx hardhat run scripts/deploy.cjs --network localhost

# Terminal 2 — run interaction demo
npx hardhat run scripts/interact.cjs --network localhost
```

### 3. Open the frontend

Just open `index.html` in your browser — no build step needed!

- Paste the deployed contract address into the UI
- Connect MetaMask (point it to Hardhat localhost: `http://127.0.0.1:8545`, Chain ID `31337`)
- Use **Send Now** or **Schedule Transaction**

### 4. Deploy to Sepolia Testnet

```bash
# Add to hardhat.config.cts:
# networks: { sepolia: { url: "YOUR_RPC", accounts: ["YOUR_PRIVATE_KEY"] } }

npx hardhat run scripts/deploy.cjs --network sepolia
```

Get free Sepolia ETH: https://sepoliafaucet.com

## 📄 Contract Functions

| Function | What it does |
|---|---|
| `scheduleTransaction(recipient, maxGas, expiry)` | Lock ETH + set conditions |
| `checkCondition(txId)` | Is gas low enough right now? |
| `executeTransaction(txId)` | Release ETH if conditions met |
| `cancelTransaction(txId)` | Cancel & refund ETH to owner |
| `getTransaction(txId)` | Read all details of a scheduled tx |

## 🛠 Built With

- [Hardhat](https://hardhat.org) — Ethereum development framework
- [Solidity 0.8.20](https://soliditylang.org) — Smart contract language
- [ethers.js v5](https://docs.ethers.org) — Ethereum JS library
- [MetaMask](https://metamask.io) — Wallet & transaction signing
