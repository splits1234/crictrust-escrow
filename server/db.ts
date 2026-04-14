import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "crictrust.db");

let db: Database.Database;

export function getDB(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function initDB() {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('client', 'builder')),
      wallet_address TEXT,
      avatar_url TEXT,
      portfolio_url TEXT,
      skills TEXT DEFAULT '[]',
      hourly_rate REAL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      contract_match_id INTEGER,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      budget REAL NOT NULL,
      deadline TEXT NOT NULL,
      client_id TEXT NOT NULL REFERENCES users(id),
      builder_id TEXT REFERENCES users(id),
      status TEXT DEFAULT 'toss_won',
      psl_team TEXT DEFAULT 'lahore_qalandars',
      complexity_score INTEGER DEFAULT 0,
      match_price REAL DEFAULT 0,
      scam_detected INTEGER DEFAULT 0,
      builder_confirmed INTEGER DEFAULT 0,
      client_approved INTEGER DEFAULT 0,
      demo_url TEXT,
      repo_url TEXT,
      uploaded_code TEXT,
      heartbeat_active INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (client_id) REFERENCES users(id),
      FOREIGN KEY (builder_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS heartbeats (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id),
      injected_script TEXT NOT NULL,
      last_ping INTEGER,
      status TEXT DEFAULT 'active',
      payment_confirmed INTEGER DEFAULT 0,
      ping_token TEXT UNIQUE,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id),
      sender_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);

  // Schema migrations for databases created before ping_token was introduced.
  // ALTER TABLE throws on existing column / existing index — swallow silently.
  try { db.exec("ALTER TABLE heartbeats ADD COLUMN ping_token TEXT"); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_heartbeats_ping_token ON heartbeats(ping_token) WHERE ping_token IS NOT NULL"); } catch {}

  console.log("Database initialized");
}
