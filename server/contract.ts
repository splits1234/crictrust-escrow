import { ethers } from "ethers";

const CONTRACT_ADDRESS = "0x1d15A28212aC0fDe56683D302bE5C131f775e203";
const RPC_URL = "https://evm.wirefluid.com";

const CONTRACT_ABI = [
  "function setComplexityScore(uint256 _id, uint8 _score) external",
  "function triggerScamDetection(uint256 _id) external",
  "function refundClientBadCode(uint256 _id) external",
  "function resolveDRS(uint256 _id, bool _favorBuilder) external",
  "function withdrawPlatformFees() external",
  "function getMatch(uint256 _id) external view returns (tuple(address client, address builder, uint96 bounty, uint40 createdAt, uint40 deadline, uint8 status, uint8 team, uint8 complexityScore, bool scamDetected, bool builderConfirmed, bool clientApproved))",
  "function platformEarnings() external view returns (uint256)",
];

function getUmpireWallet() {
  const key = process.env.UMPIRE_PRIVATE_KEY;
  if (!key) throw new Error("UMPIRE_PRIVATE_KEY not set");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  return new ethers.Wallet(key, provider);
}

function getContract() {
  const wallet = getUmpireWallet();
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
}

export async function contractSetScore(contractMatchId: number, score: number) {
  try {
    const contract = getContract();
    const tx = await contract.setComplexityScore(contractMatchId, score);
    await tx.wait();
    console.log(`[Contract] Set complexity score ${score} for match ${contractMatchId}`);
    return true;
  } catch (err: any) {
    console.error("[Contract] setComplexityScore failed:", err.reason || err.message);
    return false;
  }
}

export async function contractTriggerScam(contractMatchId: number) {
  try {
    const contract = getContract();
    const tx = await contract.triggerScamDetection(contractMatchId);
    await tx.wait();
    console.log(`[Contract] Scam detection triggered for match ${contractMatchId}`);
    return true;
  } catch (err: any) {
    console.error("[Contract] triggerScamDetection failed:", err.reason || err.message);
    return false;
  }
}

export async function contractRefundBadCode(contractMatchId: number) {
  try {
    const contract = getContract();
    const tx = await contract.refundClientBadCode(contractMatchId);
    await tx.wait();
    console.log(`[Contract] Refunded client for bad code, match ${contractMatchId}`);
    return true;
  } catch (err: any) {
    console.error("[Contract] refundClientBadCode failed:", err.reason || err.message);
    return false;
  }
}

export async function contractResolveDRS(contractMatchId: number, favorBuilder: boolean) {
  try {
    const contract = getContract();
    const tx = await contract.resolveDRS(contractMatchId, favorBuilder);
    await tx.wait();
    console.log(`[Contract] DRS resolved for match ${contractMatchId}, favor builder: ${favorBuilder}`);
    return true;
  } catch (err: any) {
    console.error("[Contract] resolveDRS failed:", err.reason || err.message);
    return false;
  }
}
