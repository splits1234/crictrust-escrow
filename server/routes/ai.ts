import { Router, Response } from "express";
import axios from "axios";
import { v4 as uuid } from "uuid";
import { getDB } from "../db.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { contractSetScore, contractTriggerScam, contractRefundBadCode } from "../contract.js";

export const aiRouter = Router();

const MODEL = "nvidia/nemotron-3-nano-30b-a3b:free";
const AI_UMPIRE_ID = "ai-umpire-system";
const AI_UMPIRE_NAME = "AI Umpire";

function getApiKey(): string {
  return process.env.OPENROUTER_API_KEY || "";
}

// ──────────────── Core AI Query (with conversation memory) ────────────────
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function queryAI(messages: ChatMessage[]): Promise<string> {
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: MODEL,
      messages,
      max_tokens: 1500,
      temperature: 0.4,
    },
    {
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://crictrust.dev",
        "X-Title": "CricTrust Escrow AI Umpire",
      },
    }
  );

  return response.data.choices?.[0]?.message?.content || "No response from AI";
}

// Simple overload for system+user prompt (no conversation history)
async function queryAISimple(systemPrompt: string, userPrompt: string): Promise<string> {
  return queryAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

// ──────────────── Ensure AI Umpire user exists in DB ────────────────
export function ensureAIUser() {
  const db = getDB();
  const exists = db.prepare("SELECT id FROM users WHERE id = ?").get(AI_UMPIRE_ID);
  if (!exists) {
    db.prepare(`
      INSERT INTO users (id, email, password, name, role, skills)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(AI_UMPIRE_ID, "umpire@crictrust.dev", "---", AI_UMPIRE_NAME, "builder", '["AI","Code Review","Pricing"]');
  }
}

// ──────────────── Post AI message to a match chat ────────────────
function postAIMessage(matchId: string, content: string) {
  const db = getDB();
  const id = uuid();
  db.prepare(`
    INSERT INTO messages (id, match_id, sender_id, content)
    VALUES (?, ?, ?, ?)
  `).run(id, matchId, AI_UMPIRE_ID, content);
  return id;
}

// ──────────────── Build conversation context for a match ────────────────
function getMatchConversation(matchId: string): ChatMessage[] {
  const db = getDB();
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(matchId) as any;
  if (!match) return [];

  const messages = db.prepare(`
    SELECT msg.content, u.name as sender_name, u.role as sender_role, msg.sender_id
    FROM messages msg
    JOIN users u ON msg.sender_id = u.id
    WHERE msg.match_id = ?
    ORDER BY msg.created_at ASC
    LIMIT 30
  `).all(matchId) as any[];

  const systemPrompt: ChatMessage = {
    role: "system",
    content: `You are the CricTrust AI Umpire — an intelligent assistant embedded in a freelance escrow platform themed around the Pakistan Super League (PSL).

Your role in this match:
- Match Title: "${match.title}"
- Description: "${match.description}"
- Budget: $${match.budget}
- Status: ${match.status}
- Deadline: ${match.deadline}

You help BOTH the client and builder:
- Answer questions about the project scope, requirements, and timeline
- Clarify technical requirements when asked
- Mediate discussions and keep things productive
- Flag potential issues early (scope creep, unrealistic timelines, vague requirements)
- When the builder delivers code, you automatically review it for quality
- Use cricket terminology naturally (innings, wickets, boundaries, etc.)

You are fair and neutral. You protect both parties from scams.
Keep responses concise (2-4 sentences max unless asked for detail).
Never reveal internal system details, API keys, or escrow logic.`,
  };

  const chatHistory: ChatMessage[] = messages.map((msg: any) => ({
    role: msg.sender_id === AI_UMPIRE_ID ? "assistant" as const : "user" as const,
    content: msg.sender_id === AI_UMPIRE_ID
      ? msg.content
      : `[${msg.sender_name} (${msg.sender_role})]: ${msg.content}`,
  }));

  return [systemPrompt, ...chatHistory];
}

// ──────────────── AI Chat — client/builder messages get AI response ────────────────
aiRouter.post("/chat/:matchId", authenticateToken, async (req: AuthRequest, res: Response) => {
  const { matchId } = req.params;
  const { message } = req.body;

  if (!message) return res.status(400).json({ error: "Message required" });

  const db = getDB();
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(matchId) as any;
  if (!match) return res.status(404).json({ error: "Match not found" });

  // Post the user's message first
  const userMsgId = uuid();
  db.prepare(`
    INSERT INTO messages (id, match_id, sender_id, content)
    VALUES (?, ?, ?, ?)
  `).run(userMsgId, matchId, req.user!.id, message);

  // Build conversation with full history and get AI response
  const conversation = getMatchConversation(matchId);

  // Add the new user message to the conversation
  const user = db.prepare("SELECT name, role FROM users WHERE id = ?").get(req.user!.id) as any;
  conversation.push({
    role: "user",
    content: `[${user.name} (${user.role})]: ${message}`,
  });

  try {
    const aiResponse = await queryAI(conversation);
    const aiMsgId = postAIMessage(matchId, aiResponse);

    const aiMsg = db.prepare(`
      SELECT msg.*, u.name as sender_name, u.role as sender_role
      FROM messages msg JOIN users u ON msg.sender_id = u.id
      WHERE msg.id = ?
    `).get(aiMsgId);

    res.json({
      userMessage: { id: userMsgId },
      aiResponse: aiMsg,
    });
  } catch (err: any) {
    console.error("AI Chat Error:", err.response?.data || err.message);
    // Still return success for the user message, just no AI response
    res.json({
      userMessage: { id: userMsgId },
      aiResponse: null,
      error: "AI Umpire is temporarily unavailable",
    });
  }
});

// ──────────────── Auto Code Review (called internally on delivery) ────────────────
export async function autoCodeReview(matchId: string, repoUrl?: string) {
  const db = getDB();
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(matchId) as any;
  if (!match) return;

  postAIMessage(matchId, `I'm now reviewing the delivered code for "${match.title}". Hold on while I analyze the submission...`);

  const systemPrompt = `You are the CricTrust AI Umpire performing an automatic code review.
You analyze submitted code to ensure clients are NOT receiving empty files, boilerplate, or scam deliverables.
Score the code complexity from 0 to 100:
- 0-20: Empty/boilerplate — likely a scam (OUT! LBW!)
- 21-40: Minimal effort — insufficient (dropped catch)
- 41-60: Acceptable — basic implementation (decent innings)
- 61-80: Good — solid implementation (half century!)
- 81-100: Excellent — production-quality (century!)

Respond ONLY with valid JSON:
{
  "complexityScore": <0-100>,
  "verdict": "<scam|insufficient|acceptable|good|excellent>",
  "issues": ["<issue 1>", "<issue 2>"],
  "strengths": ["<strength 1>", "<strength 2>"],
  "scamIndicators": <true|false>,
  "reasoning": "<2-3 sentences>"
}`;

  const userPrompt = `Review this delivery for project: "${match.title}"
Description: "${match.description}"
Budget: $${match.budget}
Uploaded Code: ${repoUrl || "Not provided"}
Demo: ${match.demo_url || "Not provided"}

The builder has confirmed delivery and uploaded their code. Analyze whether this is legitimate work. Consider the project scope vs what was likely delivered.`;

  try {
    const result = await queryAISimple(systemPrompt, userPrompt);

    let parsed;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    if (parsed) {
      // Record the AI's score (informational) regardless of on-chain result.
      db.prepare("UPDATE matches SET complexity_score = ? WHERE id = ?")
        .run(parsed.complexityScore, matchId);

      const onChain = !!match.contract_match_id;

      // Push the score on-chain BEFORE mutating DB state that implies a payout,
      // so the DB never claims funds moved when the contract call silently failed.
      let scoreSet = true;
      if (onChain) {
        scoreSet = await contractSetScore(match.contract_match_id, parsed.complexityScore);
        if (!scoreSet) {
          postAIMessage(matchId, `I computed a complexity score of ${parsed.complexityScore}/100, but the on-chain score update failed. The escrow will retry — please try approving again in a moment.`);
        }
      }

      // Auto-trigger scam detection if score is critically low
      if (parsed.scamIndicators || parsed.complexityScore < 15) {
        if (onChain) {
          const scamOk = await contractTriggerScam(match.contract_match_id);
          if (!scamOk) {
            postAIMessage(matchId, `SCAM flagged (score ${parsed.complexityScore}/100) but the on-chain penalty transfer failed. The umpire will retry — funds remain escrowed until the call succeeds.`);
            return;
          }
        }
        db.prepare("UPDATE matches SET scam_detected = 1, status = 'match_won', psl_team = 'peshawar_zalmi' WHERE id = ?")
          .run(matchId);
        postAIMessage(matchId, `SCAM DETECTED! The submission scored ${parsed.complexityScore}/100. ${parsed.reasoning} Funds have been auto-released to the builder as penalty protection.`);
        return;
      }

      // Bad code (score 15-39): auto-release funds back to the client
      if (parsed.complexityScore < 40) {
        if (onChain) {
          const refundOk = await contractRefundBadCode(match.contract_match_id);
          if (!refundOk) {
            postAIMessage(matchId, `Code scored ${parsed.complexityScore}/100 (below threshold) but the on-chain refund failed. The umpire will retry — funds remain escrowed until the call succeeds.`);
            return;
          }
        }
        db.prepare("UPDATE matches SET status = 'match_abandoned', psl_team = 'quetta_gladiators' WHERE id = ?")
          .run(matchId);
        postAIMessage(matchId, `The code did NOT pass quality review (${parsed.complexityScore}/100). ${parsed.reasoning}\n\nFunds have been auto-released back to the client. The builder's code did not meet the minimum quality threshold of 40/100.`);
        return;
      }

      // Score passes threshold. With the new contract, setComplexityScore itself
      // auto-releases when builder+client have already confirmed, so we only
      // reflect the resulting status in DB if the on-chain score update succeeded.
      if (scoreSet) {
        const updated = db.prepare("SELECT * FROM matches WHERE id = ?").get(matchId) as any;
        if (updated.builder_confirmed && updated.client_approved && parsed.complexityScore >= 40) {
          db.prepare("UPDATE matches SET status = 'match_won', psl_team = 'peshawar_zalmi' WHERE id = ?")
            .run(matchId);
        }
      }

      // Post review summary to chat
      const emoji = parsed.complexityScore >= 80 ? "CENTURY!" :
                    parsed.complexityScore >= 60 ? "Half century!" :
                    parsed.complexityScore >= 40 ? "Decent innings." :
                    parsed.complexityScore >= 20 ? "Dropped catch..." : "OUT! LBW!";

      const issuesList = parsed.issues?.length > 0
        ? "\n\nIssues found:\n" + parsed.issues.map((i: string) => `- ${i}`).join("\n")
        : "";
      const strengthsList = parsed.strengths?.length > 0
        ? "\n\nStrengths:\n" + parsed.strengths.map((s: string) => `+ ${s}`).join("\n")
        : "";

      postAIMessage(matchId,
        `Code Review Complete! ${emoji}\n\n` +
        `Score: ${parsed.complexityScore}/100 (${parsed.verdict})\n` +
        `${parsed.reasoning}${strengthsList}${issuesList}\n\n` +
        (parsed.complexityScore >= 40
          ? "The code passes the quality threshold. Client can now approve delivery."
          : "The code does NOT meet the quality threshold. Builder should improve the submission.")
      );
    } else {
      postAIMessage(matchId, `I reviewed the submission but couldn't produce a structured analysis. Raw assessment: ${result}`);
    }
  } catch (err: any) {
    console.error("Auto Code Review Error:", err.response?.data || err.message);
    postAIMessage(matchId, "I encountered an error while reviewing the code. I'll try again shortly.");
  }
}

// ──────────────── Auto Welcome (called on match creation) ────────────────
export async function autoWelcomeClient(matchId: string) {
  const db = getDB();
  const match = db.prepare(`
    SELECT m.*, u.name as client_name
    FROM matches m JOIN users u ON m.client_id = u.id
    WHERE m.id = ?
  `).get(matchId) as any;
  if (!match) return;

  const systemPrompt = `You are the CricTrust AI Umpire welcoming a client who just created a new match (project).
Use cricket terminology. Be warm, professional, and brief (3-5 sentences).
Mention the project title, confirm the budget, and let them know you'll help find the right builder.
Also give one quick tip about writing a good project description to attract quality builders.`;

  const userPrompt = `Client "${match.client_name}" just created a match:
Title: "${match.title}"
Description: "${match.description}"
Budget: $${match.budget}
Deadline: ${match.deadline}

Welcome them and give a brief overview of what happens next.`;

  try {
    const response = await queryAISimple(systemPrompt, userPrompt);
    postAIMessage(matchId, response);
  } catch (err: any) {
    console.error("Auto Welcome Error:", err.message);
    postAIMessage(matchId,
      `Welcome to the crease! Your match "${match.title}" is live with a $${match.budget} bounty. ` +
      `I'm the AI Umpire and I'll be here throughout the innings to help with questions, review code, and ensure fair play. ` +
      `Builders can now see your match and apply. Let's play!`
    );
  }
}

// ──────────────── Auto Builder Welcome (called on match accept) ────────────────
export async function autoBuilderWelcome(matchId: string, builderName: string) {
  const db = getDB();
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(matchId) as any;
  if (!match) return;

  const systemPrompt = `You are the CricTrust AI Umpire. A builder just accepted a match and the First Innings has started.
Use cricket terminology. Be encouraging and brief (3-4 sentences).
Remind them about the heartbeat protection feature and that you'll auto-review their code on delivery.`;

  const userPrompt = `Builder "${builderName}" just accepted the match:
Title: "${match.title}"
Budget: $${match.budget}
Deadline: ${match.deadline}

Welcome the builder, mention the heartbeat protection, and set expectations for delivery.`;

  try {
    const response = await queryAISimple(systemPrompt, userPrompt);
    postAIMessage(matchId, response);
  } catch {
    postAIMessage(matchId,
      `${builderName} is at the crease! First Innings has begun. ` +
      `Remember to inject the Heartbeat Protection script into your demo to protect against non-payment. ` +
      `When you deliver, I'll automatically review the code quality. Good luck!`
    );
  }
}

// ──────────────── Manual Portfolio Analysis ────────────────
aiRouter.post("/analyze-portfolio", authenticateToken, async (req: AuthRequest, res: Response) => {
  const { portfolioUrl, skills, hourlyRate, projectDescription, budget } = req.body;

  const systemPrompt = `You are the CricTrust AI Umpire — a fair pricing analyst for freelance projects.
Respond ONLY with valid JSON:
{
  "matchPrice": <number in USD>,
  "confidence": <0-100>,
  "reasoning": "<2-3 sentences>",
  "fairnessRating": "<underpriced|fair|overpriced>",
  "suggestedRange": { "min": <number>, "max": <number> }
}`;

  const userPrompt = `Analyze this freelance match:
Builder Portfolio: ${portfolioUrl || "Not provided"}
Builder Skills: ${(skills || []).join(", ")}
Builder Hourly Rate: $${hourlyRate || "Not specified"}/hr
Project Description: ${projectDescription}
Client Budget: $${budget}

What is the fair Match Price?`;

  try {
    const result = await queryAISimple(systemPrompt, userPrompt);
    let parsed;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch { parsed = null; }

    if (parsed && req.body.matchId) {
      const db = getDB();
      db.prepare("UPDATE matches SET match_price = ? WHERE id = ?")
        .run(parsed.matchPrice, req.body.matchId);

      postAIMessage(req.body.matchId,
        `I've analyzed the market rates. Fair price for this match: $${parsed.matchPrice} (${parsed.fairnessRating}). ` +
        `Suggested range: $${parsed.suggestedRange?.min} — $${parsed.suggestedRange?.max}. ${parsed.reasoning}`
      );
    }

    res.json({ analysis: parsed, raw: result });
  } catch (err: any) {
    console.error("AI Portfolio Analysis Error:", err.response?.data || err.message);
    res.status(500).json({ error: "AI analysis failed", details: err.message });
  }
});

// ──────────────── Manual Code Review ────────────────
aiRouter.post("/review-code", authenticateToken, async (req: AuthRequest, res: Response) => {
  const { code, projectDescription, matchId } = req.body;

  if (!code) return res.status(400).json({ error: "Code is required" });

  const systemPrompt = `You are the CricTrust AI Umpire — code quality reviewer.
Score complexity 0-100. Respond ONLY with valid JSON:
{
  "complexityScore": <0-100>,
  "verdict": "<scam|insufficient|acceptable|good|excellent>",
  "issues": ["<issue>"],
  "strengths": ["<strength>"],
  "scamIndicators": <true|false>,
  "reasoning": "<2-3 sentences>"
}`;

  const userPrompt = `Review this code for project: "${projectDescription}"

\`\`\`
${code.substring(0, 8000)}
\`\`\`

Score the complexity.`;

  try {
    const result = await queryAISimple(systemPrompt, userPrompt);
    let parsed;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch { parsed = null; }

    if (parsed && matchId) {
      const db = getDB();
      db.prepare("UPDATE matches SET complexity_score = ? WHERE id = ?")
        .run(parsed.complexityScore, matchId);

      const matchForContract = db.prepare("SELECT * FROM matches WHERE id = ?").get(matchId) as any;
      const onChain = !!matchForContract?.contract_match_id;

      // Push score on-chain first; only mutate payout-implying DB state on success.
      let scoreSet = true;
      if (onChain) {
        scoreSet = await contractSetScore(matchForContract.contract_match_id, parsed.complexityScore);
      }

      if (parsed.scamIndicators || parsed.complexityScore < 15) {
        let scamOk = true;
        if (onChain) scamOk = await contractTriggerScam(matchForContract.contract_match_id);
        if (scamOk) {
          db.prepare("UPDATE matches SET scam_detected = 1, status = 'match_won', psl_team = 'peshawar_zalmi' WHERE id = ?")
            .run(matchId);
        } else {
          postAIMessage(matchId, `Scam flagged at ${parsed.complexityScore}/100 but the on-chain penalty transfer failed. Funds remain escrowed until retry.`);
        }
      } else if (parsed.complexityScore < 40) {
        let refundOk = true;
        if (onChain) refundOk = await contractRefundBadCode(matchForContract.contract_match_id);
        if (refundOk) {
          db.prepare("UPDATE matches SET status = 'match_abandoned', psl_team = 'quetta_gladiators' WHERE id = ?")
            .run(matchId);
          postAIMessage(matchId, `Code review score: ${parsed.complexityScore}/100 — below minimum threshold. Funds auto-released back to the client.`);
        } else {
          postAIMessage(matchId, `Code scored ${parsed.complexityScore}/100 but the on-chain refund failed. Funds remain escrowed until retry.`);
        }
      } else if (scoreSet) {
        if (matchForContract && matchForContract.builder_confirmed && matchForContract.client_approved && parsed.complexityScore >= 40) {
          db.prepare("UPDATE matches SET status = 'match_won', psl_team = 'peshawar_zalmi' WHERE id = ?")
            .run(matchId);
        }
      }
    }

    res.json({ review: parsed, raw: result });
  } catch (err: any) {
    console.error("AI Code Review Error:", err.response?.data || err.message);
    res.status(500).json({ error: "AI review failed", details: err.message });
  }
});

// ──────────────── Manual Scam Check ────────────────
aiRouter.post("/scam-check", authenticateToken, async (req: AuthRequest, res: Response) => {
  const { clientBehavior, matchId, paymentHistory } = req.body;

  const systemPrompt = `You are the CricTrust Scam Detection AI. Respond ONLY with valid JSON:
{
  "scamProbability": <0-100>,
  "isScam": <true|false>,
  "indicators": ["<indicator>"],
  "recommendation": "<release_funds|hold|investigate>",
  "reasoning": "<2-3 sentences>"
}`;

  const userPrompt = `Analyze client behavior:
Behavior: ${clientBehavior}
Payment History: ${paymentHistory || "No history"}
Match ID: ${matchId}

Is this a scam?`;

  try {
    const result = await queryAISimple(systemPrompt, userPrompt);
    let parsed;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch { parsed = null; }

    if (parsed?.isScam && matchId) {
      const db = getDB();
      const scamMatch = db.prepare("SELECT contract_match_id FROM matches WHERE id = ?").get(matchId) as any;
      let scamOk = true;
      if (scamMatch?.contract_match_id) {
        scamOk = await contractTriggerScam(scamMatch.contract_match_id);
      }
      if (scamOk) {
        db.prepare("UPDATE matches SET scam_detected = 1, status = 'match_won', psl_team = 'peshawar_zalmi' WHERE id = ?")
          .run(matchId);
        postAIMessage(matchId, `SCAM ALERT! Analysis indicates a ${parsed.scamProbability}% probability of fraud. ${parsed.reasoning} Funds auto-released to builder.`);
      } else {
        postAIMessage(matchId, `SCAM ALERT flagged at ${parsed.scamProbability}% but on-chain penalty transfer failed. Funds remain escrowed until the umpire retries.`);
      }
    }

    res.json({ analysis: parsed, raw: result });
  } catch (err: any) {
    console.error("AI Scam Check Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Scam check failed", details: err.message });
  }
});
