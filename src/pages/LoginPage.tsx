import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import { HiOutlineLockClosed, HiOutlineMail } from "react-icons/hi";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back to the crease!");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Login failed");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-noir-900 bg-grid flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-blue/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-cyan/5 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-neon-blue to-neon-cyan mb-4 animate-pulse-glow">
            <span className="text-noir-900 font-black text-xl">CT</span>
          </div>
          <h1 className="text-3xl font-bold">
            <span className="neon-text">CricTrust</span> <span className="text-white/40">Escrow</span>
          </h1>
          <p className="text-white/40 mt-2">Scam-proof freelancing, powered by PSL</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass p-8 space-y-5">
          <div>
            <label className="block text-sm text-white/50 mb-2 font-medium">Email</label>
            <div className="relative">
              <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="glass-input w-full pl-10"
                placeholder="batsman@psl.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/50 mb-2 font-medium">Password</label>
            <div className="relative">
              <HiOutlineLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass-input w-full pl-10"
                placeholder="Your password"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="glass-button-primary w-full disabled:opacity-50"
          >
            {loading ? "Walking to the crease..." : "Login"}
          </button>

          <p className="text-center text-sm text-white/40">
            New to CricTrust?{" "}
            <Link to="/signup" className="text-neon-blue hover:text-neon-cyan transition-colors">
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
