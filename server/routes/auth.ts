import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { getDB } from "../db.js";
import { signToken, authenticateToken, AuthRequest } from "../middleware/auth.js";

export const authRouter = Router();

// ──────────────── Sign Up ────────────────
authRouter.post("/signup", async (req: Request, res: Response) => {
  const { email, password, name, role, walletAddress, portfolioUrl, skills, hourlyRate } = req.body;

  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: "Email, password, name, and role are required" });
  }
  if (!["client", "builder"].includes(role)) {
    return res.status(400).json({ error: "Role must be 'client' or 'builder'" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const db = getDB();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const id = uuid();
  const hashedPassword = await bcrypt.hash(password, 12);

  db.prepare(`
    INSERT INTO users (id, email, password, name, role, wallet_address, portfolio_url, skills, hourly_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, email, hashedPassword, name, role,
    walletAddress || null,
    portfolioUrl || null,
    JSON.stringify(skills || []),
    hourlyRate || 0
  );

  const token = signToken({ id, email, role });
  res.status(201).json({
    token,
    user: { id, email, name, role, walletAddress, portfolioUrl, skills: skills || [], hourlyRate: hourlyRate || 0 },
  });
});

// ──────────────── Login ────────────────
authRouter.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const db = getDB();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      walletAddress: user.wallet_address,
      portfolioUrl: user.portfolio_url,
      skills: JSON.parse(user.skills || "[]"),
      hourlyRate: user.hourly_rate,
    },
  });
});

// ──────────────── Get Current User ────────────────
authRouter.get("/me", authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user!.id) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    walletAddress: user.wallet_address,
    portfolioUrl: user.portfolio_url,
    skills: JSON.parse(user.skills || "[]"),
    hourlyRate: user.hourly_rate,
  });
});
