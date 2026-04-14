import { Router, Response } from "express";
import { v4 as uuid } from "uuid";
import { getDB } from "../db.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { autoWelcomeClient, autoBuilderWelcome, autoCodeReview } from "./ai.js";

export const matchRouter = Router();

// ──────────────── Create Match (Client only) ────────────────
matchRouter.post("/", authenticateToken, (req: AuthRequest, res: Response) => {
  if (req.user!.role !== "client") {
    return res.status(403).json({ error: "Only clients can create matches" });
  }

  const { title, description, budget, deadline, pslTeam, contractMatchId, walletAddress } = req.body;
  if (!title || !description || !budget || !deadline) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const db = getDB();
  const id = uuid();

  db.prepare(`
    INSERT INTO matches (id, title, description, budget, deadline, client_id, psl_team, contract_match_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description, budget, deadline, req.user!.id, pslTeam || "lahore_qalandars", contractMatchId || null);

  // Update user wallet address if provided
  if (walletAddress) {
    db.prepare("UPDATE users SET wallet_address = ? WHERE id = ?").run(walletAddress, req.user!.id);
  }

  // AI auto-welcome the client (fire and forget)
  autoWelcomeClient(id).catch((err) => console.error("AI welcome failed:", err.message));

  res.status(201).json({ id, title, description, budget, deadline, status: "toss_won", pslTeam: pslTeam || "lahore_qalandars" });
});

// ──────────────── List Matches ────────────────
matchRouter.get("/", authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const { role, id: userId } = req.user!;
  const { status, filter } = req.query;

  let query = `
    SELECT m.*,
      c.name as client_name, c.email as client_email,
      b.name as builder_name, b.email as builder_email
    FROM matches m
    LEFT JOIN users c ON m.client_id = c.id
    LEFT JOIN users b ON m.builder_id = b.id
  `;

  const conditions: string[] = [];
  const params: any[] = [];

  if (filter === "mine") {
    if (role === "client") {
      conditions.push("m.client_id = ?");
      params.push(userId);
    } else {
      conditions.push("m.builder_id = ?");
      params.push(userId);
    }
  } else if (filter === "open") {
    conditions.push("m.status = 'toss_won' AND m.builder_id IS NULL");
  }

  if (status) {
    conditions.push("m.status = ?");
    params.push(status);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY m.created_at DESC";

  const matches = db.prepare(query).all(...params);
  res.json(matches);
});

// ──────────────── Get Single Match ────────────────
matchRouter.get("/:id", authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const match = db.prepare(`
    SELECT m.*,
      c.name as client_name, c.email as client_email,
      b.name as builder_name, b.email as builder_email
    FROM matches m
    LEFT JOIN users c ON m.client_id = c.id
    LEFT JOIN users b ON m.builder_id = b.id
    WHERE m.id = ?
  `).get(req.params.id);

  if (!match) return res.status(404).json({ error: "Match not found" });
  res.json(match);
});

// ──────────────── Accept Match (Builder only) ────────────────
matchRouter.post("/:id/accept", authenticateToken, (req: AuthRequest, res: Response) => {
  if (req.user!.role !== "builder") {
    return res.status(403).json({ error: "Only builders can accept matches" });
  }

  const db = getDB();
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(req.params.id) as any;
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.status !== "toss_won") return res.status(400).json({ error: "Match is not open" });
  if (match.builder_id) return res.status(400).json({ error: "Builder already assigned" });

  const user = db.prepare("SELECT name FROM users WHERE id = ?").get(req.user!.id) as any;

  db.prepare(`
    UPDATE matches SET builder_id = ?, status = 'first_innings', psl_team = 'islamabad_united'
    WHERE id = ?
  `).run(req.user!.id, req.params.id);

  // AI auto-welcome the builder (fire and forget)
  autoBuilderWelcome(req.params.id, user?.name || "Builder").catch((err) =>
    console.error("AI builder welcome failed:", err.message)
  );

  res.json({ message: "Match accepted — First Innings started!" });
});

// ──────────────── Builder Confirms Delivery ────────────────
matchRouter.post("/:id/deliver", authenticateToken, (req: AuthRequest, res: Response) => {
  if (req.user!.role !== "builder") {
    return res.status(403).json({ error: "Only builders can deliver" });
  }

  const db = getDB();
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(req.params.id) as any;
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.builder_id !== req.user!.id) return res.status(403).json({ error: "Not your match" });

  const { demoUrl, uploadedCode, fileName } = req.body;

  db.prepare(`
    UPDATE matches SET builder_confirmed = 1, demo_url = ?, uploaded_code = ?, psl_team = 'multan_sultans'
    WHERE id = ?
  `).run(demoUrl || null, uploadedCode ? `${fileName || "code.zip"}` : null, req.params.id);

  // AI auto code review (fire and forget)
  autoCodeReview(req.params.id, fileName).catch((err) =>
    console.error("AI auto review failed:", err.message)
  );

  res.json({ message: "Code uploaded & delivery confirmed — AI Umpire is reviewing your code automatically" });
});

// ──────────────── Client Approves ────────────────
matchRouter.post("/:id/approve", authenticateToken, (req: AuthRequest, res: Response) => {
  if (req.user!.role !== "client") {
    return res.status(403).json({ error: "Only clients can approve" });
  }

  const db = getDB();
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(req.params.id) as any;
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.client_id !== req.user!.id) return res.status(403).json({ error: "Not your match" });

  db.prepare(`
    UPDATE matches SET client_approved = 1 WHERE id = ?
  `).run(req.params.id);

  // Check if everything is ready for release
  const updated = db.prepare("SELECT * FROM matches WHERE id = ?").get(req.params.id) as any;
  if (updated.builder_confirmed && updated.client_approved && updated.complexity_score >= 40) {
    db.prepare(`
      UPDATE matches SET status = 'match_won', psl_team = 'peshawar_zalmi' WHERE id = ?
    `).run(req.params.id);
    return res.json({ message: "Match Won! Funds released to builder." });
  }

  res.json({ message: "Approved — waiting for remaining conditions" });
});

// ──────────────── Raise DRS (Dispute) ────────────────
matchRouter.post("/:id/drs", authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(req.params.id) as any;
  if (!match) return res.status(404).json({ error: "Match not found" });

  const userId = req.user!.id;
  if (match.client_id !== userId && match.builder_id !== userId) {
    return res.status(403).json({ error: "Not a participant" });
  }

  db.prepare(`
    UPDATE matches SET status = 'drs', psl_team = 'quetta_gladiators' WHERE id = ?
  `).run(req.params.id);

  res.json({ message: "DRS raised — dispute under review" });
});

// ──────────────── Match Messages ────────────────
matchRouter.get("/:id/messages", authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const messages = db.prepare(`
    SELECT msg.*, u.name as sender_name, u.role as sender_role
    FROM messages msg
    JOIN users u ON msg.sender_id = u.id
    WHERE msg.match_id = ?
    ORDER BY msg.created_at ASC
  `).all(req.params.id);

  res.json(messages);
});

matchRouter.post("/:id/messages", authenticateToken, (req: AuthRequest, res: Response) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "Message content required" });

  const db = getDB();
  const id = uuid();

  db.prepare(`
    INSERT INTO messages (id, match_id, sender_id, content)
    VALUES (?, ?, ?, ?)
  `).run(id, req.params.id, req.user!.id, content);

  const msg = db.prepare(`
    SELECT msg.*, u.name as sender_name, u.role as sender_role
    FROM messages msg JOIN users u ON msg.sender_id = u.id
    WHERE msg.id = ?
  `).get(id);

  res.status(201).json(msg);
});
