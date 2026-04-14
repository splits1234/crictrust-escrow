import { Link } from "react-router-dom";
import { Match, PSL_CONFIG } from "../types";
import PSLBadge from "./PSLBadge";
import { HiOutlineClock, HiOutlineCurrencyDollar, HiOutlineUser, HiOutlineShieldCheck } from "react-icons/hi";

interface Props {
  match: Match;
}

export default function MatchCard({ match }: Props) {
  const teamConfig = PSL_CONFIG[match.psl_team];
  const deadline = new Date(match.deadline);
  const isOverdue = deadline < new Date() && match.status !== "match_won";

  return (
    <Link to={`/match/${match.id}`} className="block group">
      <div
        className="glass-card relative overflow-hidden animate-fade-in"
        style={{
          borderColor: `${teamConfig.hex}15`,
        }}
      >
        {/* Team color accent bar */}
        <div
          className="absolute top-0 left-0 right-0 h-1 opacity-60 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: teamConfig.hex }}
        />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white/90 truncate group-hover:text-white transition-colors">
              {match.title}
            </h3>
            <p className="text-sm text-white/40 mt-1 line-clamp-2">{match.description}</p>
          </div>
          <PSLBadge team={match.psl_team} />
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-white/50">
            <HiOutlineCurrencyDollar className="w-4 h-4 text-neon-blue" />
            <span className="font-mono">${match.budget}</span>
          </div>
          <div className={`flex items-center gap-2 ${isOverdue ? "text-red-400" : "text-white/50"}`}>
            <HiOutlineClock className="w-4 h-4" />
            <span>{deadline.toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2 text-white/50">
            <HiOutlineUser className="w-4 h-4" />
            <span className="truncate">{match.client_name || "Client"}</span>
          </div>
          {match.complexity_score > 0 && (
            <div className="flex items-center gap-2 text-white/50">
              <HiOutlineShieldCheck className="w-4 h-4 text-neon-green" />
              <span className="font-mono">{match.complexity_score}/100</span>
            </div>
          )}
        </div>

        {/* Builder info */}
        {match.builder_name && (
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-neon-cyan/20 flex items-center justify-center text-xs text-neon-cyan font-bold">
              {match.builder_name[0]}
            </div>
            <span className="text-sm text-white/50">{match.builder_name}</span>
            {match.heartbeat_active ? (
              <span className="ml-auto text-xs text-neon-green font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-neon-green rounded-full animate-pulse" />
                LIVE
              </span>
            ) : null}
          </div>
        )}

        {/* Scam alert */}
        {match.scam_detected ? (
          <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono text-center">
            SCAM DETECTED — Funds auto-released to builder
          </div>
        ) : null}

        {/* Bad code — funds returned to client */}
        {match.status === "match_abandoned" && !match.scam_detected ? (
          <div className="mt-3 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-mono text-center">
            CODE FAILED REVIEW — Funds released to client
          </div>
        ) : null}
      </div>
    </Link>
  );
}
