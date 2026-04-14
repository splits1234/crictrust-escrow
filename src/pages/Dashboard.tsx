import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Match } from "../types";
import { api } from "../services/api";
import MatchCard from "../components/MatchCard";
import { HiOutlineSearch, HiOutlineFilter, HiOutlineLightningBolt, HiOutlineCollection, HiOutlineCheckCircle } from "react-icons/hi";

type FilterType = "all" | "mine" | "open";

export default function Dashboard() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadMatches();
  }, [filter]);

  async function loadMatches() {
    setLoading(true);
    try {
      const params: any = {};
      if (filter !== "all") params.filter = filter;
      const res = await api.get("/matches", { params });
      setMatches(res.data);
    } catch {}
    setLoading(false);
  }

  const filtered = matches
    .filter((m) => {
      // Hide accepted matches from builders who aren't assigned to them
      if (user?.role === "builder" && m.builder_id && m.builder_id !== user.id) {
        return false;
      }
      return true;
    })
    .filter(
      (m) =>
        m.title.toLowerCase().includes(search.toLowerCase()) ||
        m.description.toLowerCase().includes(search.toLowerCase())
    );

  const stats = {
    total: matches.length,
    active: matches.filter((m) => m.status === "first_innings").length,
    completed: matches.filter((m) => m.status === "match_won").length,
    totalValue: matches.reduce((sum, m) => sum + m.budget, 0),
  };

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold">
          <span className="text-white/90">Welcome back, </span>
          <span className="neon-text">{user?.name}</span>
        </h1>
        <p className="text-white/40 mt-1">
          {user?.role === "client"
            ? "Your matches at a glance. Post new projects and track progress."
            : "Find open matches and deliver winning innings."}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Matches", value: stats.total, icon: HiOutlineCollection, color: "neon-blue" },
          { label: "Active Innings", value: stats.active, icon: HiOutlineLightningBolt, color: "psl-islamabad" },
          { label: "Matches Won", value: stats.completed, icon: HiOutlineCheckCircle, color: "psl-peshawar" },
          { label: "Total Value", value: `$${stats.totalValue.toLocaleString()}`, icon: HiOutlineLightningBolt, color: "neon-cyan" },
        ].map((stat) => (
          <div key={stat.label} className="glass-card">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-${stat.color}/10 flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 text-${stat.color}`} />
              </div>
              <div>
                <p className="text-lg font-bold text-white/90 font-mono">{stat.value}</p>
                <p className="text-xs text-white/40">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search matches..."
            className="glass-input w-full pl-10"
          />
        </div>
        <div className="flex gap-2">
          {([
            { key: "all", label: "All Matches" },
            { key: "mine", label: "My Matches" },
            { key: "open", label: "Open" },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                filter === f.key
                  ? "bg-neon-blue/15 text-neon-blue border border-neon-blue/20"
                  : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/8"
              }`}
            >
              <HiOutlineFilter className="w-3.5 h-3.5" />
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Match Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card animate-pulse h-48" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card text-center py-16">
          <div className="text-5xl mb-4">🏏</div>
          <h3 className="text-xl font-semibold text-white/60">No matches found</h3>
          <p className="text-white/30 mt-2">
            {user?.role === "client"
              ? "Create your first match to get started!"
              : "No open matches right now. Check back soon!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          {filtered.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}
