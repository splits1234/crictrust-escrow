import { config } from "dotenv";
config(); // Load .env BEFORE anything else

import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { matchRouter } from "./routes/matches.js";
import { aiRouter, ensureAIUser } from "./routes/ai.js";
import { heartbeatRouter, heartbeatPingRouter } from "./routes/heartbeat.js";
import { initDB } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

// Initialize database & AI user
initDB();
ensureAIUser();

// Routes
app.use("/api/auth", authRouter);
app.use("/api/matches", matchRouter);
app.use("/api/ai", aiRouter);
app.use("/api/heartbeat", heartbeatRouter);
// Short, unguessable ping URL for injected demo scripts: /api/hb/<token>
app.use("/api/hb", heartbeatPingRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`CricTrust Server running on 0.0.0.0:${PORT}`);
});
