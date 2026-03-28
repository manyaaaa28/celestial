const { ethers } = require("hardhat");

async function main() {
  // Use the exact name from your "contract GasOptimizedScheduler" line
  const GasScheduler = await ethers.getContractFactory("GasOptimizedScheduler");

  console.log("Deploying GasOptimizedScheduler...");
  const contract = await GasScheduler.deploy();

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ Contract deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});