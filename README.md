# ⛽ GasGuard — Stop Overpaying for Ethereum Transactions

**Why pay $50 for a transaction when it could cost $5?**

Most people send transactions when they need to, but Ethereum gas prices fluctuate wildly throughout the day. If you aren't staring at a gas tracker 24/7, you're likely losing money. 

**GasGuard** is a smart automation tool that watches the market for you. It lets you schedule a transaction now and automatically executes it only when the network is quiet and prices are at their lowest.

---

## 😟 The Problem
- **Gas Spikes:** During NFT drops or market volatility, simple transfers can cost a fortune.
- **Bad Timing:** You might need to send a payment at 2 PM when gas is 80 Gwei, but it drops to 15 Gwei at 4 AM while you're asleep.
- **Manual Stress:** Nobody wants to keep refreshing Etherscan to save a few bucks.

## ✨ The Solution: Smart Scheduling
With GasGuard, you don't send transactions—you **delegate** them.

1. **Set Your Terms:** Choose your recipient and amount.
2. **Define Your Limit:** Tell the app the maximum gas price you're willing to pay.
3. **Set a Deadline:** Give the app a window (e.g., "within the next 24 hours").
4. **Relax:** Our "Smart Keeper" bot monitors the network. It uses historical data to predict the cheapest moment and triggers your transaction at the perfect time.

---

## 🧠 How It Works (The Simple Version)
- **Safe Custody:** Your ETH is locked in a secure smart contract, not held by a person.
- **Predictive Logic:** The bot doesn't just wait for a low price; it studies when gas *usually* drops (like late nights or weekends) to find the absolute bottom.
- **Emergency Exit:** You can cancel any scheduled transaction at any time before it executes and get your ETH back instantly.
- **Deadline Guarantee:** If your deadline is approaching and the price hasn't hit your target, the bot can be configured to prioritize completion so you don't miss your window.

---

## 🚀 Quick Start for Users

### 1. Connect
Open the [GasGuard Dashboard](index.html) and connect your MetaMask wallet.

### 2. Schedule
Enter the recipient's address and the amount. Select a time window (6 hours, 1 day, etc.) and hit **Smart Schedule**.

### 3. Monitor
Watch your transaction in the "Scheduled Transactions" table. You'll see an **Estimated Execution Time** based on our bot's market analysis.

---

## 🛠 For Developers
If you want to run your own keeper bot or deploy the contract locally:

```bash
# Install dependencies
npm install

# Run a local test network
npx hardhat node

# Deploy the contract
npx hardhat run scripts/deploy.cjs --network localhost

# Start the automated keeper
npm run keeper:local
```

---

## 🔒 Security
- **Non-Custodial:** Only you (the owner) can cancel or modify your transactions.
- **Transparent:** Every action is recorded on the blockchain for anyone to verify.
- **Open Source:** Built with industry-standard tools like Hardhat and OpenZeppelin.

---
*Save gas, sleep better. Powered by GasGuard.*
