import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { Match, PSL_CONFIG } from "../types";
import { api } from "../services/api";
import PSLBadge from "../components/PSLBadge";
import ChatPanel from "../components/ChatPanel";
import toast from "react-hot-toast";
import {
  HiOutlineCurrencyDollar, HiOutlineClock, HiOutlineUser, HiOutlineShieldCheck,
  HiOutlineLightningBolt, HiOutlineCode, HiOutlineExclamation, HiOutlineCheck,
  HiOutlineClipboardCopy,
} from "react-icons/hi";

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { walletAddress, connectWallet, contractAcceptMatch, contractConfirmDelivery, contractApproveDelivery, contractRaiseDRS } = useWeb3();
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [codeForReview, setCodeForReview] = useState("");
  const [aiReview, setAiReview] = useState<any>(null);
  const [aiPricing, setAiPricing] = useState<any>(null);
  const [heartbeatScript, setHeartbeatScript] = useState("");
  const [deliveryForm, setDeliveryForm] = useState({ demoUrl: "" });
  const [codeFile, setCodeFile] = useState<File | null>(null);

  useEffect(() => {
    loadMatch();
  }, [id]);

  async function loadMatch() {
    try {
      const res = await api.get(`/matches/${id}`);
      setMatch(res.data);
    } catch {
      toast.error("Failed to load match");
    }
    setLoading(false);
  }

  async function handleAction(action: string, body?: any) {
    setActionLoading(action);
    try {
      // On-chain actions require wallet
      const onChainActions = ["accept", "deliver", "approve", "drs"];
      if (onChainActions.includes(action) && match?.contract_match_id) {
        if (!walletAddress) {
          toast.error("Connect your wallet first");
          setActionLoading("");
          return;
        }

        let success = false;
        const cid = match.contract_match_id;

        if (action === "accept") success = await contractAcceptMatch(cid);
        else if (action === "deliver") success = await contractConfirmDelivery(cid);
        else if (action === "approve") success = await contractApproveDelivery(cid);
        else if (action === "drs") success = await contractRaiseDRS(cid);

        if (!success) {
          setActionLoading("");
          return;
        }
      }

      // For deliver action, include file as base64
      if (action === "deliver" && codeFile) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(codeFile);
        });
        body = { ...body, uploadedCode: base64, fileName: codeFile.name };
      }
      await api.post(`/matches/${id}/${action}`, body);
      toast.success(`Action successful!`);
      loadMatch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Action failed");
    }
    setActionLoading("");
  }

  async function runAICodeReview() {
    if (!codeForReview.trim()) {
      toast.error("Paste code to review");
      return;
    }
    setActionLoading("ai-review");
    try {
      const res = await api.post("/ai/review-code", {
        code: codeForReview,
        projectDescription: match?.title,
        matchId: id,
      });
      setAiReview(res.data.review);
      toast.success("AI Umpire has reviewed the code!");
      loadMatch();
    } catch (err: any) {
      toast.error("AI review failed");
    }
    setActionLoading("");
  }

  async function runAIPricing() {
    setActionLoading("ai-pricing");
    try {
      const res = await api.post("/ai/analyze-portfolio", {
        portfolioUrl: match?.builder_name ? "Portfolio of " + match.builder_name : "",
        skills: [],
        hourlyRate: 0,
        projectDescription: match?.description,
        budget: match?.budget,
        matchId: id,
      });
      setAiPricing(res.data.analysis);
      toast.success("Match Price set by AI Umpire!");
      loadMatch();
    } catch {
      toast.error("AI pricing failed");
    }
    setActionLoading("");
  }

  async function injectHeartbeat() {
    setActionLoading("heartbeat");
    try {
      const res = await api.post("/heartbeat/inject", { matchId: id });
      setHeartbeatScript(res.data.script);
      toast.success("Heartbeat script generated! Copy and inject it into your demo.");
      loadMatch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to generate heartbeat");
    }
    setActionLoading("");
  }

  async function runScamCheck() {
    setActionLoading("scam-check");
    try {
      const res = await api.post("/ai/scam-check", {
        clientBehavior: "Client has not responded after delivery. Multiple revision requests without clear feedback.",
        matchId: id,
        paymentHistory: "No prior payments",
      });
      if (res.data.analysis) {
        toast.success(`Scam probability: ${res.data.analysis.scamProbability}%`);
        loadMatch();
      }
    } catch {
      toast.error("Scam check failed");
    }
    setActionLoading("");
  }

  if (loading) {
    return (
      <div className="max-w-[1800px] mx-auto px-4 py-8">
        <div className="glass-card animate-pulse h-96" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="max-w-[1800px] mx-auto px-4 py-8">
        <div className="glass-card text-center py-16">
          <p className="text-white/40 text-xl">Match not found</p>
        </div>
      </div>
    );
  }

  const teamConfig = PSL_CONFIG[match.psl_team];
  const isClient = user?.id === match.client_id;
  const isBuilder = user?.id === match.builder_id;
  const isOpen = match.status === "toss_won" && !match.builder_id;
  const isTakenByOther = user?.role === "builder" && match.builder_id && match.builder_id !== user?.id;

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="glass p-6 sm:p-8 mb-6" style={{ borderColor: `${teamConfig.hex}20` }}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <PSLBadge team={match.psl_team} size="lg" />
              {match.scam_detected ? (
                <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-bold border border-red-500/30">
                  SCAM DETECTED
                </span>
              ) : null}
              {match.heartbeat_active ? (
                <span className="px-3 py-1 rounded-full bg-neon-green/20 text-neon-green text-xs font-mono border border-neon-green/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-neon-green rounded-full animate-pulse" />
                  HEARTBEAT ACTIVE
                </span>
              ) : null}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white/95">{match.title}</h1>
            <p className="text-white/40 mt-2 max-w-2xl">{match.description}</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="glass-card px-5 py-3 text-center min-w-[100px]">
              <HiOutlineCurrencyDollar className="w-5 h-5 text-neon-blue mx-auto mb-1" />
              <p className="text-lg font-bold font-mono text-white/90">${match.budget}</p>
              <p className="text-xs text-white/40">Budget</p>
            </div>
            <div className="glass-card px-5 py-3 text-center min-w-[100px]">
              <HiOutlineShieldCheck className="w-5 h-5 text-neon-green mx-auto mb-1" />
              <p className="text-lg font-bold font-mono text-white/90">{match.complexity_score}/100</p>
              <p className="text-xs text-white/40">Complexity</p>
            </div>
            {match.match_price > 0 && (
              <div className="glass-card px-5 py-3 text-center min-w-[100px]">
                <HiOutlineLightningBolt className="w-5 h-5 text-psl-peshawar mx-auto mb-1" />
                <p className="text-lg font-bold font-mono text-white/90">${match.match_price}</p>
                <p className="text-xs text-white/40">AI Price</p>
              </div>
            )}
          </div>
        </div>

        {/* Participants */}
        <div className="flex flex-wrap gap-6 mt-6 pt-6 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-neon-blue/20 flex items-center justify-center">
              <HiOutlineUser className="w-5 h-5 text-neon-blue" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">{match.client_name || "Client"}</p>
              <p className="text-xs text-white/40">Client</p>
            </div>
          </div>
          {match.builder_name && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-neon-cyan/20 flex items-center justify-center">
                <HiOutlineCode className="w-5 h-5 text-neon-cyan" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/80">{match.builder_name}</p>
                <p className="text-xs text-white/40">Builder</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <HiOutlineClock className="w-5 h-5 text-white/30" />
            <div>
              <p className="text-sm text-white/80">{new Date(match.deadline).toLocaleDateString()}</p>
              <p className="text-xs text-white/40">Deadline</p>
            </div>
          </div>
        </div>
      </div>

      {/* Taken by another builder warning */}
      {isTakenByOther && (
        <div className="glass p-6 mb-6 text-center border border-red-500/20">
          <p className="text-red-400 font-bold text-lg">This match has already been accepted by another builder.</p>
          <p className="text-white/40 mt-2">You cannot interact with this match.</p>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column — Actions & AI */}
        <div className="xl:col-span-2 space-y-6">
          {/* Action Buttons */}
          <div className="glass p-6">
            <h2 className="font-semibold text-white/80 mb-4 flex items-center gap-2">
              <HiOutlineLightningBolt className="w-5 h-5 text-neon-blue" />
              Match Actions
            </h2>
            <div className="flex flex-wrap gap-3">
              {/* Builder: Accept open match */}
              {isOpen && user?.role === "builder" && (
                <button
                  onClick={() => handleAction("accept")}
                  disabled={!!actionLoading}
                  className="glass-button-primary disabled:opacity-50"
                >
                  {actionLoading === "accept" ? "Accepting..." : "Accept Match — Start Innings"}
                </button>
              )}

              {/* Builder: Deliver */}
              {isBuilder && match.status === "first_innings" && !match.builder_confirmed && (
                <div className="w-full space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="url" placeholder="Demo URL"
                      value={deliveryForm.demoUrl}
                      onChange={(e) => setDeliveryForm((p) => ({ ...p, demoUrl: e.target.value }))}
                      className="glass-input text-sm"
                    />
                    <div className="relative">
                      <label className="glass-input text-sm flex items-center gap-2 cursor-pointer">
                        <HiOutlineCode className="w-4 h-4 text-neon-blue" />
                        <span className="text-white/50 truncate">
                          {codeFile ? codeFile.name : "Upload your code (.zip, .tar.gz)"}
                        </span>
                        <input
                          type="file"
                          accept=".zip,.tar.gz,.tgz,.rar,.7z"
                          onChange={(e) => setCodeFile(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                  {codeFile && (
                    <p className="text-xs text-neon-green/70">
                      File selected: {codeFile.name} ({(codeFile.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                  <button
                    onClick={() => handleAction("deliver", deliveryForm)}
                    disabled={!!actionLoading || !codeFile}
                    className="glass-button-primary disabled:opacity-50"
                  >
                    {actionLoading === "deliver" ? "Uploading & Delivering..." : "Upload Code & Confirm Delivery"}
                  </button>
                </div>
              )}

              {/* Client: Approve */}
              {isClient && match.builder_confirmed && !match.client_approved && (
                <button
                  onClick={() => handleAction("approve")}
                  disabled={!!actionLoading}
                  className="glass-button-primary disabled:opacity-50"
                >
                  <HiOutlineCheck className="w-4 h-4 inline mr-2" />
                  {actionLoading === "approve" ? "Approving..." : "Approve Delivery"}
                </button>
              )}

              {/* DRS */}
              {(isClient || isBuilder) && match.status === "first_innings" && (
                <button
                  onClick={() => handleAction("drs")}
                  disabled={!!actionLoading}
                  className="glass-button text-psl-quetta border-psl-quetta/30 disabled:opacity-50"
                >
                  <HiOutlineExclamation className="w-4 h-4 inline mr-2" />
                  Raise DRS (Dispute)
                </button>
              )}

              {/* Builder: Inject Heartbeat */}
              {isBuilder && match.status === "first_innings" && !match.heartbeat_active && (
                <button
                  onClick={injectHeartbeat}
                  disabled={!!actionLoading}
                  className="glass-button text-neon-green border-neon-green/30 disabled:opacity-50"
                >
                  {actionLoading === "heartbeat" ? "Generating..." : "Inject Heartbeat Protection"}
                </button>
              )}

              {/* Builder: Run Scam Check */}
              {isBuilder && match.status === "first_innings" && (
                <button
                  onClick={runScamCheck}
                  disabled={!!actionLoading}
                  className="glass-button text-red-400 border-red-400/30 disabled:opacity-50"
                >
                  {actionLoading === "scam-check" ? "Checking..." : "Run Scam Detection"}
                </button>
              )}

              {/* AI Pricing */}
              {match.builder_id && match.match_price === 0 && (
                <button
                  onClick={runAIPricing}
                  disabled={!!actionLoading}
                  className="glass-button disabled:opacity-50"
                >
                  {actionLoading === "ai-pricing" ? "Analyzing..." : "AI: Set Match Price"}
                </button>
              )}

              {/* Match Won indicator */}
              {match.status === "match_won" && (
                <div className="w-full p-4 rounded-xl bg-psl-peshawar/10 border border-psl-peshawar/30 text-center">
                  <p className="text-psl-peshawar font-bold text-lg">Match Won! Funds Released.</p>
                </div>
              )}

              {/* Match Abandoned — funds returned to client */}
              {match.status === "match_abandoned" && (
                <div className="w-full p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-center">
                  <p className="text-red-400 font-bold text-lg">Match Abandoned — Code did not pass quality review.</p>
                  <p className="text-white/40 text-sm mt-1">Funds have been released back to the client.</p>
                </div>
              )}
            </div>
          </div>

          {/* Heartbeat Script Output */}
          {heartbeatScript && (
            <div className="glass p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-neon-green flex items-center gap-2">
                  <span className="w-2 h-2 bg-neon-green rounded-full animate-pulse" />
                  Heartbeat Protection Script
                </h2>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(heartbeatScript);
                    toast.success("Script copied!");
                  }}
                  className="glass-button text-xs py-1.5 px-3 flex items-center gap-1"
                >
                  <HiOutlineClipboardCopy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
              <div className="bg-noir-900 rounded-xl p-4 overflow-x-auto border border-white/5">
                <pre className="text-sm text-neon-green/80 font-mono whitespace-pre-wrap">{heartbeatScript}</pre>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-neon-blue/5 border border-neon-blue/10">
                <p className="text-xs text-white/50">
                  <strong className="text-neon-blue">Instructions:</strong> Copy this script and add it to your demo project's entry file.
                  It pings every 15 minutes. When the client pays, it auto-deletes itself. If the client ghosts, it corrupts the demo after 45 minutes.
                </p>
              </div>
            </div>
          )}

          {/* AI Code Review */}
          <div className="glass p-6">
            <h2 className="font-semibold text-white/80 mb-4 flex items-center gap-2">
              <HiOutlineShieldCheck className="w-5 h-5 text-neon-blue" />
              AI Umpire — Code Review
            </h2>
            <textarea
              value={codeForReview}
              onChange={(e) => setCodeForReview(e.target.value)}
              placeholder="Paste the builder's code here for AI complexity review..."
              className="glass-input w-full h-40 resize-none font-mono text-sm mb-4"
            />
            <button
              onClick={runAICodeReview}
              disabled={!!actionLoading || !codeForReview.trim()}
              className="glass-button-primary disabled:opacity-50"
            >
              {actionLoading === "ai-review" ? "AI Umpire is reviewing..." : "Run AI Code Review"}
            </button>

            {aiReview && (
              <div className="mt-4 p-4 rounded-xl bg-white/3 border border-white/10 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-bold font-mono neon-text">{aiReview.complexityScore}</span>
                  <span className="text-white/40 text-sm">/100 Complexity Score</span>
                  <span className={`ml-auto px-3 py-1 rounded-full text-xs font-bold ${
                    aiReview.verdict === "excellent" ? "bg-neon-green/20 text-neon-green" :
                    aiReview.verdict === "good" ? "bg-neon-blue/20 text-neon-blue" :
                    aiReview.verdict === "acceptable" ? "bg-psl-multan/20 text-psl-multan" :
                    "bg-red-500/20 text-red-400"
                  }`}>
                    {aiReview.verdict?.toUpperCase()}
                  </span>
                </div>
                {aiReview.scamIndicators && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    SCAM INDICATORS DETECTED — This submission appears to be fraudulent.
                  </div>
                )}
                <p className="text-sm text-white/60">{aiReview.reasoning}</p>
                {aiReview.strengths?.length > 0 && (
                  <div>
                    <p className="text-xs text-white/40 mb-1">Strengths:</p>
                    <ul className="text-sm text-neon-green/70 space-y-1">
                      {aiReview.strengths.map((s: string, i: number) => <li key={i}>+ {s}</li>)}
                    </ul>
                  </div>
                )}
                {aiReview.issues?.length > 0 && (
                  <div>
                    <p className="text-xs text-white/40 mb-1">Issues:</p>
                    <ul className="text-sm text-red-400/70 space-y-1">
                      {aiReview.issues.map((s: string, i: number) => <li key={i}>- {s}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Pricing Result */}
          {aiPricing && (
            <div className="glass p-6">
              <h2 className="font-semibold text-white/80 mb-4">AI Match Price Analysis</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold font-mono neon-text">${aiPricing.matchPrice}</p>
                  <p className="text-xs text-white/40">Fair Price</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold font-mono text-white/80">{aiPricing.confidence}%</p>
                  <p className="text-xs text-white/40">Confidence</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-bold capitalize ${
                    aiPricing.fairnessRating === "fair" ? "text-neon-green" :
                    aiPricing.fairnessRating === "underpriced" ? "text-psl-multan" : "text-red-400"
                  }`}>
                    {aiPricing.fairnessRating}
                  </p>
                  <p className="text-xs text-white/40">Rating</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-mono text-white/60">
                    ${aiPricing.suggestedRange?.min} — ${aiPricing.suggestedRange?.max}
                  </p>
                  <p className="text-xs text-white/40">Range</p>
                </div>
              </div>
              <p className="text-sm text-white/50 mt-4">{aiPricing.reasoning}</p>
            </div>
          )}
        </div>

        {/* Right Column — Chat */}
        <div>
          <ChatPanel matchId={id!} />
        </div>
      </div>
    </div>
  );
}
