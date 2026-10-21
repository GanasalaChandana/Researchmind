# ResearchMind — Multi-Agent AI Research Platform

[![CI](https://github.com/GanasalaChandana/Researchmind/actions/workflows/ci.yml/badge.svg)](https://github.com/GanasalaChandana/Researchmind/actions/workflows/ci.yml)

> Enter any topic → 4 specialized AI agents coordinate in real-time → streaming UI shows every reasoning step → outputs a structured report + interactive knowledge graph + REST API access.

🔗 **Live App:** [researchmind-app.vercel.app](https://researchmind-app.vercel.app)  
🔗 **Backend API:** [researchmind-q4fp.onrender.com](https://researchmind-q4fp.onrender.com) (Render free tier — first request after idle takes ~30–60s to wake)

---

## Features

| Feature | Description |
|---|---|
| 🤖 Multi-agent pipeline | Orchestrator → Search → Reader → Synthesizer agents in parallel |
| 📡 Live streaming | Watch every agent reasoning step in real-time via SSE |
| 🕸️ Knowledge Graph | Interactive D3 force graph per report + cross-session entity linking |
| 🔍 Full-text search | Search across all report bodies, not just titles |
| 🏷️ Auto-tagging | Tags generated automatically from topic bigrams, KG entities, and section headings |
| 📁 Collections | Organize sessions into color-coded folders |
| 📊 Dashboard | Usage analytics — sessions by date, top topics, most-researched concepts |
| 🔗 Share links | Token-based public share links with 30-day expiry |
| ↔️ Compare | Side-by-side diff of two sessions with similarity score and contradiction detection |
| 🔁 Refresh | Re-run research on a completed session; version history preserved |
| 🗓️ Scheduling | Cron-based recurring research with email notifications |
| ☑️ Bulk operations | Multi-select sessions for bulk delete or bulk tag |
| 📤 Export | Markdown, HTML, PDF, DOCX export |
| 🔑 Public API | REST API with per-key rate limiting (100 req/hr) |
| 🔔 Webhooks | Fire events to your endpoint on research completion |
| 🔐 OAuth | Sign in with Google or GitHub — no password required |
| ⚡ Redis caching | L1 Redis + L2 Postgres caching; completed sessions served in milliseconds |
| ✅ Grounded reports | Figures, names and knowledge-graph facts are checked against the source text; vendor pages are labeled as claims; a citation checker flags weak support |
| 🛡️ Sentry | Error tracking on both frontend and backend |

---

## Architecture

```
User Input
    │
    ▼
┌─────────────────────────────────────────┐
│           Orchestrator Agent            │
│  Llama 3.3 70B breaks topic into        │
│  sub-questions                          │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│            Search Agent                 │
│  Tavily searches each sub-question      │
│  Deduplicates and ranks sources         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│            Reader Agent                 │
│  Scrapes top URLs, summarises content   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│           Synthesizer Agent             │
│  Writes report + KG + citations         │
│  Saves to PostgreSQL                    │
│  Fires auto-tagging + KG extraction     │
└─────────────────────────────────────────┘
               │
               ▼
    Frontend SSE stream
  Agents │ Knowledge Graph │ Report
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Framer Motion |
| Streaming | Server-Sent Events (SSE) proxied through Next.js |
| Graph viz | react-force-graph-2d (D3 canvas) |
| Backend | Python FastAPI, asyncio, APScheduler |
| LLM | Groq API — gpt-oss-120b (writing) and gpt-oss-20b (reading) |
| Search | Tavily Search API |
| Database | Supabase PostgreSQL (asyncpg) + Alembic migrations |
| Cache | Upstash Redis (L1) + Postgres (L2) |
| Auth | JWT (access + refresh tokens) + Google/GitHub OAuth |
| Email | Resend (password resets, schedule notifications) |
| Monitoring | Sentry (frontend + backend) |
| Deploy | Vercel (frontend) + Render free tier (backend, see `render.yaml`) |

---

## Running Locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL database
- Groq API key → [console.groq.com](https://console.groq.com) (free)

### Backend

```bash
cd backend   # or project root
python -m venv venv
source venv/bin/activate        # Windows: .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create `backend/.env`:
```env
GROQ_API_KEY=your_groq_key_here
TAVILY_API_KEY=your_tavily_key_here
DATABASE_URL=postgresql://user:pass@localhost:5432/researchmind
JWT_SECRET_KEY=any-random-string-min-32-chars
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000

# Optional
RESEND_API_KEY=re_...              # needed in production for password-reset emails
ALLOW_DEV_RESET_TOKEN=true         # local dev only: returns reset token in API response
REDIS_URL=rediss://...             # Upstash Redis
RESEND_API_KEY=re_...              # Email notifications
SENTRY_DSN=https://...             # Error tracking
GOOGLE_CLIENT_ID=...               # Google OAuth
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...               # GitHub OAuth
GITHUB_CLIENT_SECRET=...
```

```bash
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_SENTRY_DSN=https://...    # optional
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Evaluation

Report quality is measured automatically, with no LLM judge, by running real research
requests against the live backend and scoring the saved reports (`eval/`).

Latest run: 2026-10-19, 3 topics, depth 3, on the Groq free tier.

| Metric | Result |
|---|---|
| Completion rate | 100% (3/3) |
| Median / max time to a finished report | 24 s / 35 s |
| Sources per report | 6.0 on average |
| Duplicate sources | 0 |
| Citation numbers pointing at a non-existent source | 0 |
| Factual sections with no citation | 0 |
| Garbled characters (broken typography) | 0 |
| Numbers in a section that also appear in the sources it cites | 93% |
| Claims confirmed by the app's own citation checker | 63% fully supported, 89% fully or partly supported |

How to read these numbers:

- It is a small sample (3 topics). It shows the pipeline works and what to watch, not
  a benchmark.
- "Numbers in cited sources" is a text match: it checks that each figure in a section
  appears in the sources that section cites. It does not judge whether the claim is right.
- The citation checker is the app's own LLM check, so it is a signal, not ground truth.
  The weakest result was the retrieval-augmented-generation topic (40% fully supported).
- The first eval runs failed on provider rate limits. That led to fixing a background
  job that re-ran endlessly and burned the daily Groq quota, and to token-saving changes.

Reproduce it: Actions → **Eval** → Run workflow (3 topics by default; up to 8 on a paid
Groq plan), or locally: `python eval/run_eval.py --base-url <your backend URL>`.

## OAuth Setup

### Google

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add authorized redirect URI: `https://YOUR-BACKEND.onrender.com/auth/oauth/google/callback`
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your backend environment

### GitHub

1. GitHub Settings → Developer settings → OAuth Apps → **New OAuth App**
2. Set Authorization callback URL: `https://YOUR-BACKEND.onrender.com/auth/oauth/github/callback`
3. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in your backend environment

---

## REST API

The backend exposes a public REST API. Authenticate with an API key generated from the **Developer** page (`/developer`) in the app.

### Authentication
All endpoints require:
```
Authorization: Bearer <your-api-key>
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/research/{id}/status` | Poll research progress |
| `GET` | `/api/v1/research/{id}/report` | Fetch completed report |
| `GET` | `/api/v1/research/{id}/export/json` | Export as JSON |
| `GET` | `/api/v1/info` | Rate-limit status for your key |

### Quick example

```bash
# Get a completed report
curl https://researchmind-q4fp.onrender.com/api/v1/research/SESSION_ID/report \
  -H "Authorization: Bearer rm_your_key_here"
```

```python
import requests

headers = {"Authorization": "Bearer rm_your_key_here"}
r = requests.get(
    "https://researchmind-q4fp.onrender.com/api/v1/research/SESSION_ID/report",
    headers=headers
)
report = r.json()
print(report["summary"])
```

```js
// From browser console on researchmind-app.vercel.app
fetch("https://researchmind-q4fp.onrender.com/api/v1/research/SESSION_ID/report", {
  headers: { "Authorization": "Bearer rm_your_key" }
})
.then(r => r.json())
.then(console.log)
```

### Rate limits
- **100 requests / hour** per API key
- Returns `429 Too Many Requests` when exceeded
- Resets on a rolling 1-hour window

---

## How to Get an API Key

1. Sign in at [researchmind-app.vercel.app](https://researchmind-app.vercel.app)
2. Click **API** in the navigation bar
3. Enter a name for your key and click **Generate**
4. **Copy the key immediately** — it is shown only once
5. Use it in your requests: `Authorization: Bearer rm_...`

> Keys are hashed (SHA-256) in the database — the raw key is never stored or retrievable after creation.

---

## Project Structure

```
researchmind/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI app, research pipeline, streaming
│       ├── database.py          # PostgreSQL helpers
│       ├── agents/              # Orchestrator, Search, Reader, Synthesizer
│       ├── auth/                # JWT auth
│       └── api/                 # Route handlers
└── frontend/
    └── app/
        ├── page.tsx             # Home
        ├── research/            # Session pages
        ├── dashboard/           # Analytics
        └── developer/           # API key management
```

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit: `git commit -m "feat: describe your change"`
4. Push and open a PR

---

## Contributors

- **GanasalaChandana** — project author

---

## License

MIT
