import asyncio
import json
import uuid
from datetime import datetime
from contextlib import asynccontextmanager
from .config import GROQ_API_KEY  # noqa: F401 — triggers dotenv load at startup

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from .models.schemas import ResearchRequest, AgentEvent
from .agents.orchestrator import orchestrate
from .agents.search_agent import search
from .agents.reader_agent import read_sources
from .agents.synthesizer import synthesize
from .database import init_db, create_session, update_session, get_session, list_sessions, delete_session
from .tools.error_handler import friendly_error


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables on startup
    try:
        await init_db()
        print("✅ Database initialized")
    except Exception as e:
        print(f"⚠️  Database not available: {e} — falling back to in-memory")
    yield


app = FastAPI(title="ResearchMind API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Fallback in-memory store (used if DB is unavailable)
_mem: dict[str, dict] = {}


async def _create(session_id: str, topic: str):
    data = {"id": session_id, "topic": topic, "status": "running",
            "created_at": datetime.utcnow().isoformat(), "report": None}
    _mem[session_id] = data
    try:
        await create_session(session_id, topic)
    except Exception:
        pass  # use memory fallback


async def _update(session_id: str, status: str, report=None):
    if session_id in _mem:
        _mem[session_id]["status"] = status
        if report:
            _mem[session_id]["report"] = report
    try:
        await update_session(session_id, status, report)
    except Exception:
        pass


async def _get(session_id: str):
    try:
        row = await get_session(session_id)
        if row:
            return row
    except Exception:
        pass
    return _mem.get(session_id)


async def _list():
    try:
        return await list_sessions()
    except Exception:
        return sorted(_mem.values(), key=lambda s: s["created_at"], reverse=True)[:20]


@app.options("/{rest_of_path:path}")
async def preflight_handler():
    return {"status": "ok"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/research/start")
async def start_research(request: ResearchRequest):
    session_id = str(uuid.uuid4())
    await _create(session_id, request.topic)
    return {"session_id": session_id}


@app.get("/research/sessions/list")
async def get_sessions():
    sessions = await _list()
    # Strip large report field from list view for performance
    return [
        {k: v for k, v in s.items() if k != "report"}
        for s in sessions
    ]


@app.get("/research/{session_id}/report")
async def get_report(session_id: str):
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.delete("/research/{session_id}")
async def delete_research(session_id: str):
    _mem.pop(session_id, None)
    try:
        await delete_session(session_id)
    except Exception:
        pass
    return {"status": "deleted"}


@app.post("/research/{session_id}/retry")
async def retry_research(session_id: str):
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    new_id = str(uuid.uuid4())
    await _create(new_id, session["topic"])
    return {"session_id": new_id, "topic": session["topic"]}


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
                enriched_sources.append(source)
                yield {"data": event.model_dump_json()}
                await asyncio.sleep(0)

            # Phase 4: Synthesize
            async for event, report in synthesize(topic, session_id, enriched_sources, sub_questions):
                if report:
                    # Deduplicate sources by title before saving (final safety check)
                    seen_titles = set()
                    unique_sources = []
                    for s in enriched_sources:
                        title_lower = s.title.lower().strip() if hasattr(s, 'title') else ""
                        if title_lower not in seen_titles:
                            unique_sources.append(s)
                            seen_titles.add(title_lower)

                    # Ensure sources are included when saving
                    report_dict = report.model_dump()
                    report_dict["sources"] = [s.model_dump() if hasattr(s, 'model_dump') else s for s in unique_sources]
                    await _update(session_id, "completed", report_dict)
                yield {"data": event.model_dump_json()}
                await asyncio.sleep(0)

        except Exception as e:
            await _update(session_id, "failed")
            error_event = AgentEvent(type="error", agent="system", message=friendly_error(e))
            yield {"data": error_event.model_dump_json()}

    return EventSourceResponse(event_generator())
