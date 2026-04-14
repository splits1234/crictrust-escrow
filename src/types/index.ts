export type UserRole = "client" | "builder";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  walletAddress?: string;
  portfolioUrl?: string;
  skills: string[];
  hourlyRate: number;
}

export type MatchStatus = "toss_won" | "first_innings" | "drs" | "match_won" | "match_abandoned";

export type PSLTeam =
  | "lahore_qalandars"
  | "islamabad_united"
  | "karachi_kings"
  | "multan_sultans"
  | "peshawar_zalmi"
  | "quetta_gladiators";

export interface Match {
  id: string;
  contract_match_id?: number;
  title: string;
  description: string;
  budget: number;
  deadline: string;
  client_id: string;
  builder_id?: string;
  status: MatchStatus;
  psl_team: PSLTeam;
  complexity_score: number;
  match_price: number;
  scam_detected: number;
  builder_confirmed: number;
  client_approved: number;
  demo_url?: string;
  repo_url?: string;
  heartbeat_active: number;
  created_at: number;
  client_name?: string;
  client_email?: string;
  builder_name?: string;
  builder_email?: string;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: number;
  sender_name: string;
  sender_role: UserRole;
}

export interface AIReview {
  complexityScore: number;
  verdict: string;
  issues: string[];
  strengths: string[];
  scamIndicators: boolean;
  reasoning: string;
}

export interface AIPortfolioAnalysis {
  matchPrice: number;
  confidence: number;
  reasoning: string;
  fairnessRating: string;
  suggestedRange: { min: number; max: number };
}

export const PSL_CONFIG: Record<PSLTeam, { name: string; color: string; hex: string; status: string }> = {
  lahore_qalandars: { name: "Lahore Qalandars", color: "psl-lahore", hex: "#00a651", status: "New" },
  islamabad_united: { name: "Islamabad United", color: "psl-islamabad", hex: "#e4002b", status: "In Progress" },
  karachi_kings: { name: "Karachi Kings", color: "psl-karachi", hex: "#0057b8", status: "Under Review" },
  multan_sultans: { name: "Multan Sultans", color: "psl-multan", hex: "#ffd100", status: "Delivered" },
  peshawar_zalmi: { name: "Peshawar Zalmi", color: "psl-peshawar", hex: "#c8a951", status: "Completed" },
  quetta_gladiators: { name: "Quetta Gladiators", color: "psl-quetta", hex: "#6f2da8", status: "Disputed" },
};
