import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { PSLTeam, PSL_CONFIG } from "../types";
import { api } from "../services/api";
import toast from "react-hot-toast";

export default function CreateMatch() {
  const { user } = useAuth();
  const { walletAddress, connectWallet, contractCreateMatch } = useWeb3();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    budget: "",
    deadline: "",
    pslTeam: "lahore_qalandars" as PSLTeam,
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (user?.role !== "client") {
      toast.error("Only clients can create matches");
      return;
    }
    if (!walletAddress) {
      toast.error("Connect your wallet first to fund the escrow");
      return;
    }

    setLoading(true);
    try {
      // 1. Send WIRE to the smart contract
      const deadlineTimestamp = Math.floor(new Date(form.deadline).getTime() / 1000);
      const contractMatchId = await contractCreateMatch(
        form.title,
        form.description,
        deadlineTimestamp,
        form.budget
      );

      if (contractMatchId === null) {
        setLoading(false);
        return;
      }

      // 2. Create match in the backend DB (linked to on-chain ID)
      const res = await api.post("/matches", {
        ...form,
        budget: parseFloat(form.budget),
        contractMatchId,
        walletAddress,
      });
      toast.success("Match created and funded on-chain!");
      navigate(`/match/${res.data.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to create match");
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold neon-text">Create New Match</h1>
        <p className="text-white/40 mt-1">Post a project and fund it with WIRE</p>
      </div>

      <form onSubmit={handleSubmit} className="glass p-8 space-y-6">
        <div>
          <label className="block text-sm text-white/50 mb-2 font-medium">Match Title</label>
          <input
            type="text" value={form.title} onChange={(e) => update("title", e.target.value)}
            className="glass-input w-full" placeholder="E.g., Build a DeFi Dashboard" required
          />
        </div>

        <div>
          <label className="block text-sm text-white/50 mb-2 font-medium">Description</label>
          <textarea
            value={form.description} onChange={(e) => update("description", e.target.value)}
            className="glass-input w-full h-32 resize-none" placeholder="Describe the project requirements..." required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-white/50 mb-2 font-medium">Budget (WIRE)</label>
            <input
              type="number" value={form.budget} onChange={(e) => update("budget", e.target.value)}
              className="glass-input w-full font-mono" placeholder="5" min="0.01" step="0.01" required
            />
            {form.budget && (
              <p className="text-xs text-white/30 mt-1">
                2.5% platform fee: {(parseFloat(form.budget) * 0.025).toFixed(4)} WIRE | Escrow holds: {(parseFloat(form.budget) * 0.975).toFixed(4)} WIRE
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm text-white/50 mb-2 font-medium">Deadline</label>
            <input
              type="date" value={form.deadline} onChange={(e) => update("deadline", e.target.value)}
              className="glass-input w-full" required
            />
          </div>
        </div>

        {/* PSL Team Selector */}
        <div>
          <label className="block text-sm text-white/50 mb-3 font-medium">PSL Team (Status Theme)</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(Object.entries(PSL_CONFIG) as [PSLTeam, typeof PSL_CONFIG[PSLTeam]][]).map(([key, config]) => (
              <button
                key={key}
                type="button"
                onClick={() => update("pslTeam", key)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  form.pslTeam === key
                    ? "border-opacity-50"
                    : "border-white/10 hover:border-white/20"
                }`}
                style={{
                  backgroundColor: form.pslTeam === key ? `${config.hex}15` : "rgba(255,255,255,0.03)",
                  borderColor: form.pslTeam === key ? `${config.hex}50` : undefined,
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.hex }} />
                  <span className="text-sm font-medium text-white/80">{config.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {!walletAddress ? (
          <button type="button" onClick={connectWallet} className="glass-button-primary w-full text-lg">
            Connect Wallet to Continue
          </button>
        ) : (
          <button type="submit" disabled={loading} className="glass-button-primary w-full text-lg disabled:opacity-50">
            {loading ? "Creating & funding match..." : `Fund Match with ${form.budget || "0"} WIRE`}
          </button>
        )}
      </form>
    </div>
  );
}
