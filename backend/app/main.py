import asyncio
import json
import uuid
from datetime import datetime
from .config import GROQ_API_KEY  # noqa: F401 — triggers dotenv load at startup

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from .models.schemas import ResearchRequest, AgentEvent
from .agents.orchestrator import orchestrate
from .agents.search_agent import search
from .agents.reader_agent import read_sources
from .agents.synthesizer import synthesize

app = FastAPI(title="ResearchMind API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# In-memory session store (swap for Redis/PostgreSQL in production)
sessions: dict[str, dict] = {}


@app.options("/{rest_of_path:path}")
async def preflight_handler():
    return {"status": "ok"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/research/start")
async def start_research(request: ResearchRequest):
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "id": session_id,
        "topic": request.topic,
        "status": "running",
        "created_at": datetime.utcnow().isoformat(),
        "report": None,
    }
    return {"session_id": session_id}


@app.get("/research/{session_id}/stream")
async def stream_research(session_id: str, topic: str, depth: int = 3):
    async def event_generator():
        all_sources = []
        sub_questions = []

        try:
            # Phase 1: Orchestrator
            async for event in orchestrate(topic, depth):
                if event.data and "sub_questions" in event.data:
                    sub_questions = event.data["sub_questions"]
                yield {"data": event.model_dump_json()}
                await asyncio.sleep(0)

            if not sub_questions:
                sub_questions = [topic]

            # Phase 2: Search
            async for event, sources in search(sub_questions):
                all_sources.extend(sources)
                yield {"data": event.model_dump_json()}
                await asyncio.sleep(0)

            # Phase 3: Read sources (top 6 by relevance)
            top_sources = sorted(all_sources, key=lambda s: s.relevance_score, reverse=True)[:6]
            enriched_sources = []
            async for event, source in read_sources(top_sources):
                if source not in enriched_sources:
                    enriched_sources.append(source)
                yield {"data": event.model_dump_json()}
                await asyncio.sleep(0)

            # Phase 4: Synthesize
            async for event, report in synthesize(topic, session_id, enriched_sources, sub_questions):
                if report:
                    if session_id in sessions:
                        sessions[session_id]["report"] = report.model_dump()
                        sessions[session_id]["status"] = "completed"
                yield {"data": event.model_dump_json()}
                await asyncio.sleep(0)

        except Exception as e:
            if session_id in sessions:
                sessions[session_id]["status"] = "failed"
            error_event = AgentEvent(type="error", agent="system", message=str(e))
            yield {"data": error_event.model_dump_json()}

    return EventSourceResponse(event_generator())


@app.get("/research/{session_id}/report")
async def get_report(session_id: str):
    session = sessions.get(session_id)
    if not session:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.get("/research/sessions/list")
async def list_sessions():
    return list(sessions.values())
