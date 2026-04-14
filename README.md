# CricTrust Escrow

**Scam-proof freelancing with an AI Umpire and kill-switch "innings protection."**

Submitted to **Wire Fluid Entangle 2026**.

Live demo: [https://talktohurairah.com](https://talktohurairah.com)

---

## The problem

Freelance clients ghost. Builders deliver working demos and then get blocked when it's time to pay. CricTrust flips the dynamic: the builder ships code that **protects itself** until the client actually pays.

## How it works — the cricket metaphor

The whole lifecycle is modeled as a PSL match. Every state change belongs to a team, so the UI feels like a scoreboard rather than a form.

| Phase | Status | Team |
|---|---|---|
| Client posts a brief | `toss_won` | Lahore Qalandars |
| Builder accepts | `first_innings` | Islamabad United |
| Builder delivers code | `builder_confirmed` | Multan Sultans |
| Client approves & pays | `match_won` | Peshawar Zalmi |
| Either side disputes | `drs` | Quetta Gladiators |

## Key systems

### 🫀 Innings Protection (the kill switch)
When a builder delivers, they inject a heartbeat script into their demo:

```js
const HEARTBEAT_URL = "https://talktohurairah.com/api/hb/<token>";
setInterval(heartbeatPing, 15 * 60 * 1000);
```

- Server returns **200 `KEEP_ALIVE`** → demo keeps running.
- Client pays → server returns **301 `SELF_DELETE`** → script uninstalls itself cleanly.
- Client ghosts → 3 missed pings + 45-min grace period → the script **corrupts every source file in the project** and wipes `.env`. Payment is required to restore.

Tokens are 192-bit base64url, unique per match, so hundreds of demos can run in parallel.

### ⚖️ AI Umpire
OpenRouter-backed AI agent (`nvidia/nemotron-3-nano-30b-a3b:free`) that participates in every match chat:

- Auto-welcomes clients and builders with context-aware briefings.
- Automatically reviews uploaded code when a builder delivers (complexity scoring + red-flag detection).
- `/api/ai/scam-check` returns structured risk analysis (probability, indicators, recommendation).
- Free-form `/api/ai/chat/:matchId` — the AI has full match context and conversation memory.

### 🔐 On-chain escrow (Hardhat)
`contracts/CricTrustEscrow.sol` holds funds, records match scores, and releases payment when approval conditions are met. Refunds fire automatically if AI review flags the code.

---

## Stack

- **Frontend:** React 18 + Vite + Tailwind + Framer Motion + Zustand
- **Backend:** Express + better-sqlite3 + JWT + bcrypt
- **AI:** OpenRouter (Nemotron Nano 30B)
- **Chain:** Hardhat + ethers v6 + Solidity
- **PWA:** Manifest + service worker, installable on Android/iOS/desktop
- **Infra:** nginx + Let's Encrypt on EC2, PM2 for process management

## Run locally

```bash
git clone https://github.com/splits1234/crictrust-escrow
cd crictrust-escrow
npm install

cat > .env <<EOF
OPENROUTER_API_KEY=your_key_here
JWT_SECRET=change_me
PORT=3001
UMPIRE_PRIVATE_KEY=your_umpire_wallet_key
EOF

npm run dev       # starts client (5173) + server (3001) concurrently
```

Vite proxies `/api` to `localhost:3001`, so the frontend looks identical to production.

## Smart contracts

```bash
npm run compile          # hardhat compile
npm run test:contracts   # hardhat test
node scripts/deploy.cjs  # deploy
```

## API surface

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create client or builder account |
| POST | `/api/auth/login` | Returns JWT |
| GET | `/api/auth/me` | Current user |
| POST | `/api/matches` | Client creates a match |
| POST | `/api/matches/:id/accept` | Builder accepts |
| POST | `/api/matches/:id/deliver` | Builder uploads code |
| POST | `/api/matches/:id/approve` | Client releases funds |
| POST | `/api/matches/:id/drs` | Raise a dispute |
| POST | `/api/heartbeat/inject` | Builder gets the protection script |
| GET | `/api/hb/:token` | Heartbeat endpoint (public, unguessable) |
| POST | `/api/heartbeat/confirm-payment/:matchId` | Kills the heartbeat |
| POST | `/api/ai/chat/:matchId` | Chat with the AI Umpire |
| POST | `/api/ai/review-code` | Code review + complexity scoring |
| POST | `/api/ai/scam-check` | Client risk analysis |

## Project layout

```
crictrust-escrow/
├── contracts/          Solidity escrow contract
├── server/
│   ├── routes/         auth, matches, heartbeat, ai
│   ├── middleware/     JWT auth
│   ├── contract.ts     ethers bindings
│   └── db.ts           sqlite schema
├── src/                React app (pages, components, context, services)
├── public/             PWA manifest, service worker, icons
├── scripts/deploy.cjs  Hardhat deploy
└── test/               Contract tests (vitest)
```

## License

MIT — built for Wire Fluid Entangle 2026.
