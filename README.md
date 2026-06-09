# ResearchMind — Multi-Agent AI Research Platform

[![CI](https://github.com/GanasalaChandana/Researchmind/actions/workflows/ci.yml/badge.svg)](https://github.com/GanasalaChandana/Researchmind/actions/workflows/ci.yml)

> Enter any topic → 4 specialized AI agents coordinate in real-time → streaming UI shows every reasoning step → outputs a structured report + interactive knowledge graph + REST API access.

🔗 **Live App:** [researchmind-app.vercel.app](https://researchmind-app.vercel.app)  
🔗 **Backend API:** [researchmind-production-b6ca.up.railway.app](https://researchmind-production-b6ca.up.railway.app)

---

## Features

| Feature | Description |
|---|---|
| 🤖 Multi-agent pipeline | Orchestrator → Search → Reader → Synthesizer agents in parallel |
| 📡 Live streaming | Watch every agent reasoning step in real-time via SSE |
| 🕸️ Knowledge Graph | Interactive D3 force graph per report + cross-session entity linking |
| 🔍 Full-text search | Search across all report bodies, not just titles |
| 🏷️ Auto-tagging | LLM generates 3–5 topic tags automatically after research completes |
| 📁 Collections | Organize sessions into color-coded folders |
| 📊 Dashboard | Usage analytics — sessions by date, top topics, most-researched concepts |
| 🔗 Share links | Token-based public share links with 30-day expiry |
| ↔️ Compare | Side-by-side comparison of two sessions with source overlap analysis |
| 📤 Export | Markdown, HTML, PDF, DOCX export |
| 🔑 Public API | REST API with per-key rate limiting (100 req/hr) |
| 🔔 Webhooks | Fire events to your endpoint on research completion |

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
│  DuckDuckGo searches each sub-question  │
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
| Backend | Python FastAPI, asyncio |
| LLM | Groq API — Llama 3.3 70B |
| Database | PostgreSQL on Railway (asyncpg) |
| Auth | JWT (access + refresh tokens) |
| Deploy | Vercel (frontend) + Railway (backend) |

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
DATABASE_URL=postgresql://user:pass@localhost:5432/researchmind
SECRET_KEY=any-random-string-for-jwt
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
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

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
curl https://researchmind-production-b6ca.up.railway.app/api/v1/research/SESSION_ID/report \
  -H "Authorization: Bearer rm_your_key_here"
```

```python
import requests

headers = {"Authorization": "Bearer rm_your_key_here"}
r = requests.get(
    "https://researchmind-production-b6ca.up.railway.app/api/v1/research/SESSION_ID/report",
    headers=headers
)
report = r.json()
print(report["summary"])
```

```js
// From browser console on researchmind-app.vercel.app
fetch("https://researchmind-production-b6ca.up.railway.app/api/v1/research/SESSION_ID/report", {
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
