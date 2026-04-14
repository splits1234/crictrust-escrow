import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import toast from "react-hot-toast";

const CONTRACT_ADDRESS = "0x1d15A28212aC0fDe56683D302bE5C131f775e203";

const WIREFLUID_CHAIN = {
  chainId: "0x16975",
  chainName: "Wirefluid",
  nativeCurrency: { name: "Wire", symbol: "WIRE", decimals: 18 },
  rpcUrls: ["https://evm.wirefluid.com"],
  blockExplorerUrls: ["https://wirefluidscan.com"],
};

const CONTRACT_ABI = [
  "function createMatch(string _title, string _desc, uint40 _deadline, uint8 _team) external payable returns (uint256)",
  "function acceptMatch(uint256 _id) external",
  "function confirmDelivery(uint256 _id) external",
  "function approveDelivery(uint256 _id) external",
  "function raiseDRS(uint256 _id) external",
  "function abandonMatch(uint256 _id) external",
  "function getMatch(uint256 _id) external view returns (tuple(address client, address builder, uint96 bounty, uint40 createdAt, uint40 deadline, uint8 status, uint8 team, uint8 complexityScore, bool scamDetected, bool builderConfirmed, bool clientApproved))",
  "function nextMatchId() external view returns (uint256)",
  "function PLATFORM_FEE_BPS() external view returns (uint256)",
  "event MatchCreated(uint256 indexed id, address indexed client, uint256 bounty, uint256 platformFee)",
  "event FundsReleased(uint256 indexed id, address indexed to, uint256 amount, uint256 platformFee)",
];

interface Web3ContextType {
  walletAddress: string | null;
  balance: string;
  connecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  contractCreateMatch: (title: string, desc: string, deadline: number, budgetWire: string) => Promise<number | null>;
  contractAcceptMatch: (matchId: number) => Promise<boolean>;
  contractConfirmDelivery: (matchId: number) => Promise<boolean>;
  contractApproveDelivery: (matchId: number) => Promise<boolean>;
  contractRaiseDRS: (matchId: number) => Promise<boolean>;
  contractAbandonMatch: (matchId: number) => Promise<boolean>;
  getContractMatch: (matchId: number) => Promise<any>;
  explorerUrl: (address: string) => string;
}

const Web3Context = createContext<Web3ContextType | null>(null);

export function useWeb3() {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error("useWeb3 must be inside Web3Provider");
  return ctx;
}

async function switchToWirefluid() {
  const ethereum = (window as any).ethereum;
  if (!ethereum) return;
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: WIREFLUID_CHAIN.chainId }] });
  } catch (err: any) {
    if (err.code === 4902) {
      await ethereum.request({ method: "wallet_addEthereumChain", params: [WIREFLUID_CHAIN] });
    }
  }
}

function getContract(providerOrSigner: any) {
  return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, providerOrSigner);
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState("0");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;
    ethereum.on("accountsChanged", (accounts: string[]) => {
      if (accounts.length === 0) { setWalletAddress(null); setBalance("0"); }
      else { setWalletAddress(accounts[0]); refreshBalance(accounts[0]); }
    });
    ethereum.on("chainChanged", () => window.location.reload());
    // Auto-reconnect
    ethereum.request({ method: "eth_accounts" }).then((accounts: string[]) => {
      if (accounts.length > 0) { setWalletAddress(accounts[0]); refreshBalance(accounts[0]); }
    });
  }, []);

  async function refreshBalance(address: string) {
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const bal = await provider.getBalance(address);
      setBalance(formatEther(bal));
    } catch { setBalance("0"); }
  }

  async function connectWallet() {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      toast.error("No wallet detected. Install MetaWallet or MetaMask.");
      return;
    }
    setConnecting(true);
    try {
      await switchToWirefluid();
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      setWalletAddress(accounts[0]);
      await refreshBalance(accounts[0]);
      toast.success("Wallet connected!");
    } catch (err: any) {
      toast.error(err.message || "Failed to connect wallet");
    }
    setConnecting(false);
  }

  function disconnectWallet() {
    setWalletAddress(null);
    setBalance("0");
  }

  async function contractCreateMatch(title: string, desc: string, deadline: number, budgetWire: string): Promise<number | null> {
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = getContract(signer);
      const tx = await contract.createMatch(title, desc, deadline, 0, { value: parseEther(budgetWire) });
      toast.loading("Transaction pending...", { id: "tx" });
      const receipt = await tx.wait();
      toast.dismiss("tx");

      // Extract match ID from MatchCreated event
      const event = receipt.logs.find((log: any) => {
        try { return contract.interface.parseLog(log)?.name === "MatchCreated"; } catch { return false; }
      });
      if (event) {
        const parsed = contract.interface.parseLog(event);
        const matchId = Number(parsed!.args[0]);
        toast.success(`Match created on-chain! ID: ${matchId}`);
        await refreshBalance(walletAddress!);
        return matchId;
      }
      toast.success("Match created on-chain!");
      await refreshBalance(walletAddress!);
      return null;
    } catch (err: any) {
      toast.dismiss("tx");
      toast.error(err.reason || err.message || "Transaction failed");
      return null;
    }
  }

  async function contractAcceptMatch(matchId: number): Promise<boolean> {
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = getContract(signer);
      const tx = await contract.acceptMatch(matchId);
      toast.loading("Accepting match on-chain...", { id: "tx" });
      await tx.wait();
      toast.dismiss("tx");
      toast.success("Match accepted on-chain!");
      return true;
    } catch (err: any) {
      toast.dismiss("tx");
      toast.error(err.reason || err.message || "Transaction failed");
      return false;
    }
  }

  async function contractConfirmDelivery(matchId: number): Promise<boolean> {
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = getContract(signer);
      const tx = await contract.confirmDelivery(matchId);
      toast.loading("Confirming delivery on-chain...", { id: "tx" });
      await tx.wait();
      toast.dismiss("tx");
      toast.success("Delivery confirmed on-chain!");
      return true;
    } catch (err: any) {
      toast.dismiss("tx");
      toast.error(err.reason || err.message || "Transaction failed");
      return false;
    }
  }

  async function contractApproveDelivery(matchId: number): Promise<boolean> {
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = getContract(signer);
      const tx = await contract.approveDelivery(matchId);
      toast.loading("Approving delivery on-chain...", { id: "tx" });
      await tx.wait();
      toast.dismiss("tx");
      toast.success("Delivery approved on-chain! Funds released.");
      await refreshBalance(walletAddress!);
      return true;
    } catch (err: any) {
      toast.dismiss("tx");
      toast.error(err.reason || err.message || "Transaction failed");
      return false;
    }
  }

  async function contractRaiseDRS(matchId: number): Promise<boolean> {
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = getContract(signer);
      const tx = await contract.raiseDRS(matchId);
      toast.loading("Raising DRS on-chain...", { id: "tx" });
      await tx.wait();
      toast.dismiss("tx");
      toast.success("DRS raised on-chain!");
      return true;
    } catch (err: any) {
      toast.dismiss("tx");
      toast.error(err.reason || err.message || "Transaction failed");
      return false;
    }
  }

  async function contractAbandonMatch(matchId: number): Promise<boolean> {
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = getContract(signer);
      const tx = await contract.abandonMatch(matchId);
      toast.loading("Abandoning match on-chain...", { id: "tx" });
      await tx.wait();
      toast.dismiss("tx");
      toast.success("Match abandoned, funds refunded!");
      await refreshBalance(walletAddress!);
      return true;
    } catch (err: any) {
      toast.dismiss("tx");
      toast.error(err.reason || err.message || "Transaction failed");
      return false;
    }
  }

  async function getContractMatch(matchId: number) {
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const contract = getContract(provider);
      return await contract.getMatch(matchId);
    } catch { return null; }
  }

  function explorerUrl(address: string) {
    return `https://wirefluidscan.com/address/${address}`;
  }

  return (
    <Web3Context.Provider value={{
      walletAddress, balance, connecting, connectWallet, disconnectWallet,
      contractCreateMatch, contractAcceptMatch, contractConfirmDelivery,
      contractApproveDelivery, contractRaiseDRS, contractAbandonMatch,
      getContractMatch, explorerUrl,
    }}>
      {children}
    </Web3Context.Provider>
  );
}
