const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "WIRE");

  // Deploy CricTrustEscrow with deployer as the umpire
  const CricTrustEscrow = await hre.ethers.getContractFactory("CricTrustEscrow");
  const escrow = await CricTrustEscrow.deploy(deployer.address);

  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("CricTrustEscrow deployed to:", address);
  console.log("Umpire address:", deployer.address);
  console.log("\nView on WireFluid Explorer:");
  console.log(`https://wirefluidscan.com/address/${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
