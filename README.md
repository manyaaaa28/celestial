# ⛽ GasGuard — Stop Overpaying for Ethereum Transactions

**Why pay $50 for a transaction when it could cost $5?**

Most people send transactions when they need to, but Ethereum gas prices fluctuate wildly throughout the day. If you aren't staring at a gas tracker 24/7, you're likely losing money. 

**GasGuard** is a smart automation tool that watches the market for you. It lets you schedule a transaction now and automatically executes it only when the network is quiet and prices are at their lowest.

---

## 😟 The Problem
Ethereum users often struggle to decide the right time to execute transactions, leading to inefficiencies and higher costs. This creates a clear need for a system that can handle such decisions more intelligently. 

Imagine you need to submit a stake for a hackathon—even a small amount like **0.001 ETH** translates to a noticeable cost in real-world currency. Timing becomes critical, but constantly checking gas fees is exhausting.

## ✨ The Solution: Smart Scheduling
GasGuard addresses this by allowing you to define intelligent conditions for your transactions. Instead of babysitting a gas tracker, you can set a deadline (say, within a week) and rely on the system to automatically schedule and execute your transaction at the most optimal time before that deadline hits.

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
Open the Dashboard and connect your MetaMask wallet.

### 2. Schedule
Enter the recipient's address and the amount. Select a time window (6 hours, 1 day, etc.) and hit **Smart Schedule**.

### 3. Monitor
Watch your transaction in the "Scheduled Transactions" table. You'll see an **Estimated Execution Time** based on our bot's market analysis.

---

## 🛠 For Developers
If you want to run your own keeper bot or deploy the contract locally:

```bash
# 1. Install dependencies
npm install

# 2. Compile the smart contract (Generates artifacts/ABI)
npx hardhat compile

# 3. Run a local test network (Keep this terminal open)
npx hardhat node

# 4. Deploy the contract to local network
npx hardhat run scripts/deploy.cjs --network localhost

# 5. Start the automated keeper bot
npm run keeper:local
```

---

*Save gas, sleep better. Powered by GasGuard.*
