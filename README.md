# ResearchMind — Multi-Agent AI Research Agent

> Enter any topic → 4 specialized AI agents coordinate in real-time → streaming UI shows every reasoning step → outputs a structured report + interactive knowledge graph + PDF export.

🔗 **Live Demo:** [researchmind-beta.vercel.app](https://researchmind-beta.vercel.app)

---

## What it does

| Feature | Description |
|---|---|
| 🧠 Multi-agent pipeline | Orchestrator → Search → Reader → Synthesizer agents coordinate automatically |
| 📡 Live streaming | Watch every agent reasoning step in real-time via SSE |
| 🕸️ Knowledge Graph | Interactive D3 force graph of entities and relationships extracted from research |
| 📄 Research Report | Structured report with inline citations and source links |
| 📥 PDF Export | Download the full report as a formatted PDF |
| 🗄️ Persistent history | All sessions saved to PostgreSQL — revisit any past research |

---

## Architecture

```
User Input
    │
    ▼
┌─────────────────────────────────────────┐
│           Orchestrator Agent            │
│  Llama 3.3 70B breaks topic into        │
│  3-5 targeted sub-questions             │
└──────────────┬──────────────────────────┘
               │ sub-questions
               ▼
┌─────────────────────────────────────────┐
│            Search Agent                 │
│  DuckDuckGo searches each sub-question  │
│  Deduplicates and ranks sources         │
└──────────────┬──────────────────────────┘
               │ top URLs + snippets
               ▼
┌─────────────────────────────────────────┐
│            Reader Agent                 │
│  Scrapes each URL (httpx + BS4)         │
│  Llama 3.1 8B summarizes each source    │
└──────────────┬──────────────────────────┘
               │ enriched summaries
               ▼
┌─────────────────────────────────────────┐
│           Synthesizer Agent             │
│  Extracts knowledge graph entities      │
│  Writes full report with citations      │
│  Saves to PostgreSQL (Supabase)         │
└─────────────────────────────────────────┘
               │
               ▼
         Frontend (SSE stream)
    Agent Activity │ Knowledge Graph │ Report
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Framer Motion |
| Streaming | Server-Sent Events (SSE) via Next.js API proxy |
| Graph viz | react-force-graph-2d (canvas, D3 physics) |
| Backend | Python FastAPI, asyncio |
| LLM | Groq API — Llama 3.3 70B (reasoning) + Llama 3.1 8B (summarization) |
| Web search | DuckDuckGo Search (no API key needed) |
| Database | PostgreSQL on Supabase (asyncpg) |
| Deploy | Vercel (frontend) + Railway (backend) |

---

## Running Locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- Groq API key (free at [console.groq.com](https://console.groq.com))

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Create .env file
echo "GROQ_API_KEY=your_key_here" > .env

uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install

# Create .env.local
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:8000" > .env.local

npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Key Design Decisions

- **Agent coordination via async generators** — each agent yields events as it works, enabling real-time streaming without queues or message brokers
- **SSE proxied through Next.js** — avoids CORS issues and Vercel edge buffering
- **Graceful DB fallback** — if PostgreSQL is unavailable, falls back to in-memory store so the app never crashes
- **LLM routing by task** — fast Llama 8B for summarization, powerful Llama 70B for reasoning and synthesis

---

## Project Structure

```
researchmind/
├── backend/
│   ├── app/
│   │   ├── agents/          # Orchestrator, Search, Reader, Synthesizer
│   │   ├── tools/           # Web search, URL reader
│   │   ├── models/          # Pydantic schemas
│   │   ├── database.py      # PostgreSQL + asyncpg
│   │   ├── config.py        # Env loading
│   │   └── main.py          # FastAPI app + SSE endpoints
│   └── requirements.txt
└── frontend/
    ├── app/
    │   ├── api/research/    # Next.js proxy routes
    │   ├── research/[id]/   # Session page
    │   └── page.tsx         # Homepage + history
    ├── components/
    │   ├── AgentActivityFeed.tsx
    │   ├── KnowledgeGraph.tsx
    │   └── ReportViewer.tsx
    └── lib/
        ├── api.ts
        ├── types.ts
        └── exportPdf.ts
```
