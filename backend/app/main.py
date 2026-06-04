import asyncio
import json
import uuid
from datetime import datetime
from contextlib import asynccontextmanager
from .config import ANTHROPIC_API_KEY  # noqa: F401 — triggers dotenv load at startup

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from .models.schemas import ResearchRequest, AgentEvent
from .agents.orchestrator import orchestrate
from .agents.search_agent import search
from .agents.reader_agent import read_sources
from .agents.synthesizer import synthesize
from .database import init_db, create_session, update_session, get_session, list_sessions, delete_session, get_cached_research, cache_research
from .tools.error_handler import friendly_error
from .tools.export_formats import export_markdown, export_html, format_citations


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
async def get_sessions(
    status: str = None,
    search: str = None,
    days: int = None,
    limit: int = 20,
):
    """List sessions with optional filters"""
    sessions = await _list()

    # Apply filters in-memory as fallback
    filtered = sessions
    if status:
        filtered = [s for s in filtered if s.get("status") == status]
    if search:
        filtered = [s for s in filtered if search.lower() in s.get("topic", "").lower()]
    if days:
        from datetime import datetime, timedelta
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        filtered = [s for s in filtered if s.get("created_at", "") > cutoff]

    filtered = filtered[:limit]

    # Strip large report field from list view for performance
    return [
        {k: v for k, v in s.items() if k != "report"}
        for s in filtered
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
            # Check cache first
            cached_report = await get_cached_research(topic)
            if cached_report:
                yield {"data": AgentEvent(
                    type="thinking",
                    agent="system",
                    message="✨ Returning cached research result — no API calls needed!",
                ).model_dump_json()}

                # Save cached result to session
                await _update(session_id, "completed", cached_report)

                # Stream the cached report as if it was just generated
                yield {"data": AgentEvent(
                    type="done",
                    agent="system",
                    message="Research complete (from cache).",
                    data={"report": cached_report},
                ).model_dump_json()}
                return

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

                    # Cache the completed research for future queries
                    await cache_research(topic, report_dict)

                yield {"data": event.model_dump_json()}
                await asyncio.sleep(0)

        except Exception as e:
            await _update(session_id, "failed")
            error_event = AgentEvent(type="error", agent="system", message=friendly_error(e))
            yield {"data": error_event.model_dump_json()}

    return EventSourceResponse(event_generator())


@app.get("/research/{session_id}/export/{format_type}")
async def export_research(session_id: str, format_type: str):
    """Export research report in different formats"""
    try:
        session = await _get(session_id)
        if not session or not session.get("report"):
            raise HTTPException(status_code=404, detail="Session or report not found")

        report_dict = session["report"]
        if isinstance(report_dict, str):
            report_dict = json.loads(report_dict)

        topic = report_dict.get("topic", "Research Report")
        summary = report_dict.get("summary", "")
        sections = report_dict.get("sections", [])
        sources = report_dict.get("sources", [])

        if format_type == "markdown":
            # Build markdown manually from dict
            lines = [
                f"# {topic}\n",
                f"*Research ID: {session_id}*\n",
                f"## Executive Summary\n{summary}\n",
            ]

            for section in sections:
                lines.append(f"## {section.get('heading', '')}\n")
                lines.append(section.get("content", "") + "\n")

            lines.append("\n## Sources\n")
            for i, source in enumerate(sources, 1):
                lines.append(f"[{i}] **{source.get('title', 'Untitled')}**\n")
                lines.append(f"{source.get('url', '')}\n")
                lines.append(f"{source.get('summary', '')}\n\n")

            content = "".join(lines)
            return {
                "content": content,
                "filename": f"{session_id}.md",
                "mime_type": "text/markdown",
            }
        elif format_type == "html":
            # Build HTML manually from dict
            html_parts = [
                "<!DOCTYPE html>",
                "<html><head><meta charset='UTF-8'>",
                f"<title>{topic}</title>",
                "<style>body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }",
                "h1 { border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }",
                "h2 { color: #1e40af; margin-top: 20px; }",
                ".source { background: #f0f9ff; padding: 10px; margin: 10px 0; border-radius: 5px; }</style>",
                "</head><body>",
                f"<h1>{topic}</h1>",
                f"<p><em>Research ID: {session_id}</em></p>",
                f"<h2>Executive Summary</h2><p>{summary}</p>",
            ]

            for section in sections:
                html_parts.append(f"<h2>{section.get('heading', '')}</h2>")
                html_parts.append(f"<p>{section.get('content', '').replace(chr(10), '<br>')}</p>")

            html_parts.append("<h2>Sources</h2>")
            for i, source in enumerate(sources, 1):
                html_parts.append(f'<div class="source">')
                html_parts.append(f"<strong>[{i}] {source.get('title', 'Untitled')}</strong><br>")
                html_parts.append(f'<a href="{source.get("url", "")}" target="_blank">{source.get("url", "")}</a><br>')
                html_parts.append(f"<p>{source.get('summary', '')}</p>")
                html_parts.append("</div>")

            html_parts.extend(["</body></html>"])

            content = "\n".join(html_parts)
            return {
                "content": content,
                "filename": f"{session_id}.html",
                "mime_type": "text/html",
            }
        else:
            raise HTTPException(status_code=400, detail="Unsupported format")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export error: {str(e)}")


@app.get("/research/{session_id}/citations")
async def get_citations(session_id: str, style: str = "apa"):
    """Get formatted citations for research"""
    try:
        session = await _get(session_id)
        if not session or not session.get("report"):
            return {"citations": {}, "style": style}

        report_dict = session["report"]
        if isinstance(report_dict, str):
            try:
                report_dict = json.loads(report_dict)
            except:
                return {"citations": {}, "style": style}

        sources = report_dict.get("sources")
        if not sources or not isinstance(sources, list):
            return {"citations": {}, "style": style}

        # Build citations manually
        citations = {}
        for i, source in enumerate(sources, 1):
            try:
                if isinstance(source, dict):
                    title = source.get("title", "Untitled")
                    url = source.get("url", "")
                else:
                    title = getattr(source, "title", "Untitled")
                    url = getattr(source, "url", "")

                if not title or not url:
                    continue

                if style == "apa":
                    citations[str(i)] = f"{title}. Retrieved from {url}"
                elif style == "mla":
                    citations[str(i)] = f'"{title}." Web. {url}'
                elif style == "chicago":
                    citations[str(i)] = f'Accessed {url}. "{title}."'
                else:
                    citations[str(i)] = f"[{i}] {title} - {url}"
            except Exception:
                continue

        return {"citations": citations, "style": style}
    except Exception:
        # Return empty citations on any error
        return {"citations": {}, "style": style}


@app.post("/research/{session_id}/share")
async def create_share_link(session_id: str):
    """Create a shareable link for the research"""
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Generate a simple share token (in production, use more secure tokens)
    share_token = str(uuid.uuid4())[:8].upper()

    return {
        "session_id": session_id,
        "share_token": share_token,
        "share_url": f"/shared/{share_token}",
        "expires_in": "30 days",
    }


@app.get("/shared/{share_token}")
async def get_shared_research(share_token: str):
    """Access shared research (simplified - in production add token validation)"""
    # For now, this is a placeholder. In production:
    # 1. Store share tokens in database with expiry
    # 2. Link tokens to session IDs
    # 3. Validate token before returning data
    return {
        "message": "Shared research endpoint. Implement token validation in production.",
        "token": share_token,
    }
