import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { HiOutlineHome, HiOutlinePlusCircle, HiOutlineLogout, HiOutlineUser } from "react-icons/hi";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { walletAddress, balance, connecting, connectWallet, disconnectWallet } = useWeb3();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="glass-strong sticky top-0 z-50 border-b border-white/10">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-neon-blue to-neon-cyan flex items-center justify-center text-noir-900 font-black text-sm">
              CT
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-lg neon-text">CricTrust</span>
              <span className="text-white/40 text-sm ml-2 font-mono">ESCROW</span>
            </div>
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                isActive("/")
                  ? "bg-neon-blue/15 text-neon-blue border border-neon-blue/20"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              <HiOutlineHome className="w-4 h-4" />
              <span className="hidden md:inline">Dashboard</span>
            </Link>

            {user?.role === "client" && (
              <Link
                to="/create-match"
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  isActive("/create-match")
                    ? "bg-neon-blue/15 text-neon-blue border border-neon-blue/20"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <HiOutlinePlusCircle className="w-4 h-4" />
                <span className="hidden md:inline">New Match</span>
              </Link>
            )}

            {/* Wallet */}
            <div className="ml-4 pl-4 border-l border-white/10">
              {walletAddress ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neon-green/10 border border-neon-green/20">
                  <span className="w-2 h-2 bg-neon-green rounded-full animate-pulse" />
                  <span className="text-xs font-mono text-neon-green">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
                  <span className="text-xs text-white/40">{parseFloat(balance).toFixed(2)} WIRE</span>
                  <button
                    onClick={disconnectWallet}
                    className="text-white/30 hover:text-red-400 transition-colors ml-1"
                    title="Disconnect wallet"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <button
                  onClick={connectWallet}
                  disabled={connecting}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-neon-blue/15 text-neon-blue border border-neon-blue/20 hover:bg-neon-blue/25 transition-all disabled:opacity-50"
                >
                  {connecting ? "Connecting..." : "Connect Wallet"}
                </button>
              )}
            </div>

            {/* User badge */}
            <div className="flex items-center gap-3 ml-4 pl-4 border-l border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-blue/30 to-neon-cyan/30 flex items-center justify-center">
                  <HiOutlineUser className="w-4 h-4 text-neon-blue" />
                </div>
                <div className="hidden lg:block">
                  <p className="text-sm font-medium text-white/90">{user?.name}</p>
                  <p className="text-xs text-white/40 capitalize font-mono">{user?.role}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-all"
                title="Logout"
              >
                <HiOutlineLogout className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
