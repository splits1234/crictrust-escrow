import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import { HiOutlineMail, HiOutlineLockClosed, HiOutlineUser, HiOutlineBriefcase, HiOutlineCode } from "react-icons/hi";

export default function SignupPage() {
  const { signup } = useAuth();
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "builder" as "client" | "builder",
    walletAddress: "",
    portfolioUrl: "",
    skills: "",
    hourlyRate: "",
  });
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await signup({
        ...form,
        skills: form.skills ? form.skills.split(",").map((s) => s.trim()) : [],
        hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : 0,
      });
      toast.success("Welcome to the squad!");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Signup failed");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-noir-900 bg-grid flex items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 right-1/3 w-96 h-96 bg-psl-lahore/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/3 left-1/3 w-96 h-96 bg-neon-blue/5 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-lg relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-neon-blue to-neon-cyan mb-4 animate-pulse-glow">
            <span className="text-noir-900 font-black text-xl">CT</span>
          </div>
          <h1 className="text-3xl font-bold">
            <span className="neon-text">Join</span> <span className="text-white/40">CricTrust</span>
          </h1>
          <p className="text-white/40 mt-2">Pick your side — Client or Builder</p>
        </div>

        <form onSubmit={handleSubmit} className="glass p-8 space-y-5">
          {/* Role Selector */}
          <div className="grid grid-cols-2 gap-3">
            {(["client", "builder"] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => update("role", role)}
                className={`p-4 rounded-xl border text-center transition-all ${
                  form.role === role
                    ? "bg-neon-blue/15 border-neon-blue/40 text-neon-blue"
                    : "bg-white/5 border-white/10 text-white/50 hover:bg-white/8"
                }`}
              >
                <div className="text-2xl mb-1">{role === "client" ? "🏏" : "💻"}</div>
                <p className="font-semibold capitalize">{role}</p>
                <p className="text-xs mt-1 opacity-60">
                  {role === "client" ? "Post matches & hire" : "Accept matches & build"}
                </p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/50 mb-2">Full Name</label>
              <div className="relative">
                <HiOutlineUser className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text" value={form.name} onChange={(e) => update("name", e.target.value)}
                  className="glass-input w-full pl-10 text-sm" placeholder="Babar Azam" required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-white/50 mb-2">Email</label>
              <div className="relative">
                <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="email" value={form.email} onChange={(e) => update("email", e.target.value)}
                  className="glass-input w-full pl-10 text-sm" placeholder="you@example.com" required
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/50 mb-2">Password</label>
            <div className="relative">
              <HiOutlineLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="password" value={form.password} onChange={(e) => update("password", e.target.value)}
                className="glass-input w-full pl-10 text-sm" placeholder="Min 6 characters" required minLength={6}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/50 mb-2">Wallet Address (optional)</label>
            <input
              type="text" value={form.walletAddress} onChange={(e) => update("walletAddress", e.target.value)}
              className="glass-input w-full text-sm font-mono" placeholder="0x..."
            />
          </div>

          {form.role === "builder" && (
            <>
              <div>
                <label className="block text-sm text-white/50 mb-2">Portfolio URL</label>
                <div className="relative">
                  <HiOutlineBriefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="url" value={form.portfolioUrl} onChange={(e) => update("portfolioUrl", e.target.value)}
                    className="glass-input w-full pl-10 text-sm" placeholder="https://github.com/you"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/50 mb-2">Skills (comma-separated)</label>
                  <div className="relative">
                    <HiOutlineCode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="text" value={form.skills} onChange={(e) => update("skills", e.target.value)}
                      className="glass-input w-full pl-10 text-sm" placeholder="React, Node.js, Solidity"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-white/50 mb-2">Hourly Rate ($)</label>
                  <input
                    type="number" value={form.hourlyRate} onChange={(e) => update("hourlyRate", e.target.value)}
                    className="glass-input w-full text-sm" placeholder="50"
                  />
                </div>
              </div>
            </>
          )}

          <button type="submit" disabled={loading} className="glass-button-primary w-full disabled:opacity-50">
            {loading ? "Joining the squad..." : "Sign Up"}
          </button>

          <p className="text-center text-sm text-white/40">
            Already have an account?{" "}
            <Link to="/login" className="text-neon-blue hover:text-neon-cyan transition-colors">Login</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
