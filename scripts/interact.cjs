const { ethers } = require("hardhat");

async function main() {
  const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const [owner, friend] = await ethers.getSigners();

  // 1. Get the contract instance
  const GasScheduler = await ethers.getContractAt("GasOptimizedScheduler", contractAddress);

  console.log("--- New Interaction ---");

  // 2. Set parameters and Schedule
  const recipient = friend.address;
  const maxGasPrice = ethers.parseUnits("50", "gwei"); // Increased to 50 to be safe
  const expiry = Math.floor(Date.now() / 1000) + 3600;

  console.log("Scheduling 1 ETH transfer...");
  const tx = await GasScheduler.scheduleTransaction(
    recipient,
    maxGasPrice,
    expiry,
    { value: ethers.parseEther("1.0") }
  );
  await tx.wait();
  
  const balance = await GasScheduler.contractBalance();
  console.log("✅ 1 ETH locked. Total Balance:", ethers.formatEther(balance), "ETH");

  // 3. Check if the transaction (ID 0) is ready to execute
  // Note: Since you ran this before, you might have multiple IDs now (0, 1, 2...)
  // Let's check the very first one (ID 0)
  console.log("\n--- Checking Condition for Tx ID: 0 ---");
  
  // In Ethers v6, we use an array-like access for multiple return values
  const result = await GasScheduler.checkCondition(0);
  const ready = result[0];
  const reason = result[1];
  const currentGas = result[2];
  
  console.log("Is ID 0 ready?", ready);
  console.log("Reason:", reason);
  console.log("Current Gas Price:", ethers.formatUnits(currentGas, "gwei"), "Gwei");

  if (ready) {
    console.log("🚀 Conditions met! Releasing the ETH for ID 0...");
    const executeTx = await GasScheduler.executeTransaction(0);
    await executeTx.wait();
    console.log("✅ ETH released to recipient!");
    
    const newBalance = await GasScheduler.contractBalance();
    console.log("Remaining Contract Balance:", ethers.formatEther(newBalance), "ETH");
  } else {
    console.log("❌ Not ready yet. Reason:", reason);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});