# ResearchMind — Multi-Agent AI Research Agent

Enter any topic → 4 specialized AI agents coordinate in real-time → streaming UI shows every reasoning step → outputs a structured report + interactive knowledge graph.

## Architecture

```
Orchestrator  →  decomposes topic into sub-questions
Search Agent  →  Tavily web search per sub-question
Reader Agent  →  scrapes + summarizes top sources via Claude Haiku
Synthesizer   →  builds knowledge graph + final report via Claude Sonnet
```

## Quick Start

### 1. Backend
```bash
cd backend
cp .env.example .env         # add your API keys
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 2. Frontend
```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

## API Keys needed
- `ANTHROPIC_API_KEY` — get at console.anthropic.com
- `TAVILY_API_KEY` — get at tavily.com (free tier: 1000 searches/month)

## Stack
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Python FastAPI, async streaming (SSE)
- **LLM**: Claude Sonnet (reasoning) + Claude Haiku (summarization)
- **Search**: Tavily API
- **Graph viz**: react-force-graph-2d
- **Database**: PostgreSQL + pgvector (for future session persistence)
