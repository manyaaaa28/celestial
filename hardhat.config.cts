import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";

const PRIVATE_KEY    = process.env.PRIVATE_KEY    || "";
const SEPOLIA_RPC    = process.env.SEPOLIA_RPC_URL || "";

export default {
  solidity: "0.8.20",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      url: SEPOLIA_RPC,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};