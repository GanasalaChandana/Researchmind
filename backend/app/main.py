import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from .config import GROQ_API_KEY  # noqa: F401 — triggers dotenv load at startup

from groq import Groq as _GroqClient

from fastapi import FastAPI, HTTPException, Depends, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from .models.schemas import ResearchRequest, AgentEvent, WebhookRequest, FavoriteRequest
from .agents.orchestrator import orchestrate
from .agents.search_agent import search
from .agents.reader_agent import read_sources
from .agents.synthesizer import synthesize
from .database import (
    init_db, create_session, update_session, get_session, list_sessions,
    delete_session, get_cached_research, cache_research, set_favorite,
    create_share_token, get_shared_session, list_share_tokens, delete_share_token,
    add_tag, remove_tag, list_user_tags, get_user_dashboard_stats,
    create_collection, list_collections, update_collection, delete_collection,
    set_session_collection, search_sessions_full,
    store_kg_entities, get_related_sessions_db, get_top_entities_db,
    save_chat_message, get_chat_history,
    create_schedule_db, list_schedules_db, get_schedule_db,
    update_schedule_run, toggle_schedule_active,
    delete_schedule_db, get_all_active_schedules,
)
from .tools.error_handler import friendly_error
from .tools.export_formats import export_markdown, export_html, format_citations
from .tools.webhooks import (
    register_webhook, list_webhooks, delete_webhook,
    fire_webhook_event
)
from .auth.user_db import init_user_tables
from .routes.auth import router as auth_router
from .routes.public_api import router as public_api_router
from .auth.dependencies import get_optional_user, get_current_user


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables on startup
    try:
        await init_db()
        print("✅ Database initialized")
    except Exception as e:
        print(f"⚠️  Database not available: {e} — falling back to in-memory")
    try:
        await init_user_tables()
        print("✅ User tables initialized")
    except Exception as e:
        print(f"⚠️  User tables not available: {e} — using in-memory fallback")

    # Start scheduler and register all active persisted schedules
    _scheduler.start()
    asyncio.create_task(_reload_all_schedules())
    print("✅ Scheduler started")

    yield

    _scheduler.shutdown(wait=False)
    print("🛑 Scheduler stopped")


app = FastAPI(
    title="ResearchMind API",
    description="Multi-agent AI Research API with JWT auth, public API keys, auto-tagging, webhooks, and streaming",
    version="3.8.0",
    lifespan=lifespan,
)

# Mount routers
app.include_router(auth_router)
app.include_router(public_api_router)

# CORS — restrict to known frontend origins. Auth uses bearer tokens (not cookies),
# so allow_credentials is False, which keeps the config valid and the Public API usable.
# Override the regex via ALLOWED_ORIGIN_REGEX to add a custom domain.
import os as _os
from apscheduler.schedulers.asyncio import AsyncIOScheduler as _AsyncIOScheduler
from apscheduler.triggers.cron       import CronTrigger       as _CronTrigger

_scheduler = _AsyncIOScheduler(timezone="UTC")

_default_origin_regex = (
    r"^https://researchmind[a-z0-9.-]*\.vercel\.app$"  # production + Vercel previews
    r"|^http://localhost:\d+$"                          # local dev
    r"|^http://127\.0\.0\.1:\d+$"
)
ALLOWED_ORIGIN_REGEX = _os.environ.get("ALLOWED_ORIGIN_REGEX", _default_origin_regex)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Fallback in-memory store (used if DB is unavailable)
_mem: dict[str, dict] = {}


async def _create(session_id: str, topic: str, user_id: str = None):
    data = {"id": session_id, "topic": topic, "status": "running",
            "created_at": datetime.now(timezone.utc).isoformat(), "report": None,
            "user_id": user_id, "is_favorite": False}
    _mem[session_id] = data
    try:
        await create_session(session_id, topic, user_id=user_id)
    except Exception:
        pass  # use memory fallback


async def _set_favorite(session_id: str, is_favorite: bool):
    if session_id in _mem:
        _mem[session_id]["is_favorite"] = is_favorite
    try:
        await set_favorite(session_id, is_favorite)
    except Exception:
        pass


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


async def _list(user_id: str = None, favorites_only: bool = False):
    try:
        return await list_sessions(user_id=user_id, favorites_only=favorites_only)
    except Exception:
        sessions = list(_mem.values())
        if user_id:
            sessions = [s for s in sessions if s.get("user_id") == user_id]
        if favorites_only:
            sessions = [s for s in sessions if s.get("is_favorite")]
        return sorted(sessions, key=lambda s: s["created_at"], reverse=True)[:20]


# ─── Auto-tagging via LLM ────────────────────────────────────────────────────

_TAG_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#3b82f6", "#ec4899", "#8b5cf6"]

async def _auto_tag_session(session_id: str, topic: str, report_dict: dict, user_id: str = None) -> None:
    """Generate 3-5 topic tags for a completed session using Groq LLM.

    Runs the synchronous Groq client in a thread-pool executor so it doesn't
    block the event loop. Tags are persisted via add_tag() in the database.
    """
    if not user_id:
        return  # Only tag authenticated sessions (tags are user-scoped)

    summary = (report_dict.get("summary") or "")[:600]
    sections = report_dict.get("sections") or []
    headings = ", ".join(s.get("heading", "") for s in sections[:5] if s.get("heading"))

    prompt = (
        f"You are a research tagging assistant. Generate exactly 3 to 5 short, specific tags "
        f"for the research report below. Tags should be lowercase, 1-3 words each, and capture "
        f"the key topics, domains, or methods. Reply ONLY with a comma-separated list. "
        f"No explanations, no numbering, no quotes.\n\n"
        f"Topic: {topic}\n"
        f"Section headings: {headings}\n"
        f"Summary excerpt: {summary}"
    )

    def _call_groq() -> list[str]:
        client = _GroqClient(api_key=os.environ.get("GROQ_API_KEY", ""))
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=80,
            temperature=0.3,
        )
        raw = response.choices[0].message.content.strip()
        tags = [t.strip().lower() for t in raw.split(",") if t.strip()]
        # Keep only reasonably-sized tags; drop anything too long or empty
        return [t for t in tags if 1 <= len(t) <= 40][:5]

    try:
        loop = asyncio.get_event_loop()
        tags = await loop.run_in_executor(None, _call_groq)
        for i, tag_name in enumerate(tags):
            color = _TAG_COLORS[i % len(_TAG_COLORS)]
            try:
                await add_tag(session_id, tag_name, color)
            except Exception:
                pass  # best-effort; don't crash the pipeline
        print(f"✅ Auto-tagged session {session_id[:8]}: {tags}")
    except Exception as e:
        print(f"⚠️  Auto-tagging failed for {session_id[:8]}: {e}")


# ─── Cross-session KG entity extraction ─────────────────────────────────────

async def _extract_entities_to_graph(
    session_id: str, report_dict: dict, user_id: str
) -> None:
    """Normalize the KG from a completed report into persistent cross-session tables.

    Runs after research completes (via asyncio.create_task — non-blocking).
    Only processes authenticated sessions (entities are user-scoped).
    """
    if not user_id:
        return

    kg = report_dict.get("knowledge_graph") or {}
    entities      = kg.get("entities")      or []
    relationships = kg.get("relationships") or []

    if not entities:
        return

    try:
        await store_kg_entities(session_id, entities, relationships, user_id)
        print(f"✅ KG stored for {session_id[:8]}: {len(entities)} entities, {len(relationships)} edges")
    except Exception as e:
        print(f"⚠️  KG extraction failed for {session_id[:8]}: {e}")


# ─── Scheduled research ──────────────────────────────────────────────────────

def _register_job(sched: dict) -> None:
    """Register (or replace) a DB schedule row as an APScheduler cron job."""
    freq   = sched.get("frequency", "weekly")
    job_id = sched["id"]

    if freq == "daily":
        trigger = _CronTrigger(hour=sched.get("hour", 9), minute=0, timezone="UTC")
    elif freq == "weekly":
        dow     = sched.get("day_of_week") or 0   # 0=mon … 6=sun
        trigger = _CronTrigger(
            day_of_week=dow, hour=sched.get("hour", 9), minute=0, timezone="UTC"
        )
    else:
        return

    _scheduler.add_job(
        _fire_schedule,
        trigger=trigger,
        id=job_id,
        kwargs={
            "schedule_id":  sched["id"],
            "user_id":      sched["user_id"],
            "topic":        sched["topic"],
            "depth":        sched.get("depth", 3),
            "notify_email": sched.get("notify_email", True),
        },
        replace_existing=True,
        misfire_grace_time=7200,   # fire even if server was down ≤ 2 hours
    )
    print(f"📅 Registered schedule {job_id[:8]}: '{sched['topic'][:40]}' ({freq})")


async def _reload_all_schedules() -> None:
    """On startup: pull every active schedule from DB and register each as a job."""
    try:
        schedules = await get_all_active_schedules()
        for s in schedules:
            _register_job(s)
        print(f"✅ Reloaded {len(schedules)} active schedule(s)")
    except Exception as exc:
        print(f"⚠️  Could not reload schedules: {exc}")


async def _fire_schedule(
    schedule_id: str, user_id: str, topic: str,
    depth: int = 3, notify_email: bool = True,
) -> None:
    """Called by APScheduler when a cron job fires.
    Creates a new session and kicks off the full pipeline in the background.
    """
    print(f"🔔 Schedule firing: '{topic[:50]}' (id={schedule_id[:8]})")
    session_id = str(uuid.uuid4())
    await _create(session_id, topic, user_id=user_id)
    await update_schedule_run(schedule_id, session_id)
    asyncio.create_task(
        _run_pipeline_bg(session_id, topic, depth, user_id, notify_email)
    )


async def _run_pipeline_bg(
    session_id: str, topic: str, depth: int,
    user_id: str, notify_email: bool = False,
) -> None:
    """Run the 4-agent research pipeline without SSE.

    Used by the scheduler so the full pipeline runs in a background task.
    Mirrors the SSE stream_research handler but yields to no HTTP client.
    """
    all_sources: list = []
    sub_questions: list = []

    try:
        # ① Orchestrate
        async for event in orchestrate(topic, depth):
            if event.data and "sub_questions" in event.data:
                sub_questions = event.data["sub_questions"]
        if not sub_questions:
            sub_questions = [topic]

        # ② Search
        async for _ev, sources in search(sub_questions):
            all_sources.extend(sources)

        # ③ Read (top 6 by relevance)
        top_src = sorted(all_sources, key=lambda s: s.relevance_score, reverse=True)[:6]
        enriched: list = []
        async for _ev, source in read_sources(top_src):
            enriched.append(source)

        # ④ Synthesize
        report_dict = None
        async for _ev, report in synthesize(topic, session_id, enriched, sub_questions):
            if report:
                seen: set = set()
                unique: list = []
                for s in enriched:
                    t = s.title.lower().strip() if hasattr(s, "title") else ""
                    if t not in seen:
                        unique.append(s)
                        seen.add(t)
                report_dict = report.model_dump()
                report_dict["sources"] = [s.model_dump() for s in unique]

        if report_dict:
            await _update(session_id, "completed", report_dict)
            await cache_research(topic, report_dict)
            asyncio.create_task(_auto_tag_session(session_id, topic, report_dict, user_id))
            asyncio.create_task(_extract_entities_to_graph(session_id, report_dict, user_id))
            if notify_email:
                asyncio.create_task(_send_schedule_ready_email(user_id, topic, session_id))
            print(f"✅ Scheduled pipeline done: {session_id[:8]} — {topic[:40]}")
        else:
            await _update(session_id, "failed")

    except Exception as exc:
        print(f"❌ Scheduled pipeline error ({session_id[:8]}): {exc}")
        await _update(session_id, "failed")


async def _send_schedule_ready_email(
    user_id: str, topic: str, session_id: str
) -> None:
    """Email the session owner when their scheduled research is ready."""
    try:
        from .auth.user_db import get_user_by_id
        from .tools.email  import send_email, email_configured
        from .config       import FRONTEND_URL

        if not email_configured():
            return
        user = await get_user_by_id(user_id)
        if not user or not user.get("email"):
            return

        name        = user.get("name") or user["email"].split("@")[0]
        report_url  = f"{FRONTEND_URL}/research/{session_id}"
        sched_url   = f"{FRONTEND_URL}/schedules"

        html = f"""\
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;
            margin:0 auto;padding:24px;color:#0f172a">
  <div style="text-align:center;margin-bottom:20px">
    <span style="font-size:22px;font-weight:700;color:#6366f1">✨ ResearchMind</span>
  </div>
  <h2 style="font-size:18px;margin:0 0 8px">Your scheduled research is ready 🎉</h2>
  <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px">
    Hi {name}, your scheduled research on
    <strong>&ldquo;{topic}&rdquo;</strong> has completed.
  </p>
  <div style="text-align:center;margin:24px 0">
    <a href="{report_url}"
       style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
              font-weight:600;font-size:14px;padding:12px 28px;border-radius:10px">
      View Report →
    </a>
  </div>
  <p style="font-size:12px;color:#94a3b8;margin:16px 0 0">
    Manage your schedules at
    <a href="{sched_url}" style="color:#6366f1">{sched_url}</a>
  </p>
</div>"""
        await send_email(user["email"], f"Research ready: {topic[:60]}", html)
    except Exception as exc:
        print(f"⚠️  Schedule email failed: {exc}")


# ─── Chat with report ────────────────────────────────────────────────────────

from pydantic import BaseModel as _PydanticBase

class ChatMessage(_PydanticBase):
    message: str


def _build_report_context(report: dict, max_chars: int = 8000) -> str:
    """Flatten the report dict into a plain-text context block for the LLM."""
    parts: list[str] = []

    topic = report.get("topic", "Research Report")
    parts.append(f"RESEARCH TOPIC: {topic}\n")

    summary = (report.get("summary") or "")
    if summary:
        parts.append(f"\nEXECUTIVE SUMMARY:\n{summary[:2500]}\n")

    for s in (report.get("sections") or [])[:7]:
        heading = s.get("heading", "")
        content = (s.get("content") or "")[:600]
        if heading:
            parts.append(f"\n## {heading}\n{content}\n")

    sources = report.get("sources") or []
    if sources:
        parts.append("\nSOURCES:\n")
        for i, src in enumerate(sources[:10], 1):
            title   = src.get("title", "Untitled") if isinstance(src, dict) else getattr(src, "title", "Untitled")
            url     = src.get("url", "") if isinstance(src, dict) else getattr(src, "url", "")
            snippet = (src.get("summary", "") if isinstance(src, dict) else getattr(src, "summary", ""))[:200]
            parts.append(f"[{i}] {title}\n   {url}\n   {snippet}\n")

    return "".join(parts)[:max_chars]


def _build_llm_messages(context: str, history: list[dict], topic: str) -> list[dict]:
    """Build the messages array for the Groq chat API."""
    system = {
        "role": "system",
        "content": (
            f"You are an expert AI assistant helping a user explore a research report on '{topic}'. "
            "Answer questions based ONLY on the report content provided. "
            "If the question falls outside the report scope, say so clearly. "
            "When referencing facts, cite the source like [Source 1]. "
            "Be concise and precise. Do not hallucinate facts.\n\n"
            f"--- REPORT CONTENT ---\n{context}\n--- END REPORT ---"
        ),
    }
    msgs: list[dict] = [system]
    for m in history[-8:]:           # last 8 messages = 4 turns of context
        msgs.append({"role": m["role"], "content": m["content"]})
    return msgs


@app.options("/{rest_of_path:path}")
async def preflight_handler():
    return {"status": "ok"}


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok", "version": "3.9.0-crosskg"}


@app.post("/research/start")
async def start_research(
    request: ResearchRequest,
    current_user: dict = Depends(get_optional_user),
):
    session_id = str(uuid.uuid4())
    user_id = current_user["id"] if current_user else None
    await _create(session_id, request.topic, user_id=user_id)
    return {"session_id": session_id}


@app.get("/research/sessions/list")
async def get_sessions(
    status: str = None,
    search: str = None,
    days: int = None,
    limit: int = 20,
    offset: int = 0,
    favorites: bool = False,
    tag: str = None,
    collection: str = None,
    current_user: dict = Depends(get_optional_user),
):
    """List sessions with pagination — filters to current user's sessions if authenticated"""
    user_id = current_user["id"] if current_user else None
    try:
        sessions = await _list(user_id=user_id, favorites_only=favorites)
    except Exception:
        sessions = []

    # Apply additional filters
    filtered = sessions
    if status:
        filtered = [s for s in filtered if s.get("status") == status]
    if search:
        filtered = [s for s in filtered if search.lower() in s.get("topic", "").lower()]
    if days:
        from datetime import datetime, timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        filtered = [s for s in filtered if s.get("created_at", "") > cutoff]
    if tag:
        filtered = [s for s in filtered if any(t.get("name") == tag for t in (s.get("tags") or []))]
    if collection:
        filtered = [s for s in filtered if s.get("collection_id") == collection]

    total = len(filtered)
    # Paginate: offset-based pagination
    paginated = filtered[offset : offset + limit]

    # Strip large report field from list view for performance
    return {
        "items": [
            {k: v for k, v in s.items() if k != "report"}
            for s in paginated
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + limit < total,
    }


# ─── Full-text report search ─────────────────────────────────────────────────

def _extract_snippet(report: dict, query: str, ctx: int = 130) -> tuple[str, str]:
    """Return (snippet_text, match_location) from a report dict."""
    q = query.lower()

    # Executive summary
    summary = report.get("summary", "")
    if q in summary.lower():
        idx = summary.lower().find(q)
        s, e = max(0, idx - 60), min(len(summary), idx + len(query) + 60)
        snip = ("…" if s > 0 else "") + summary[s:e] + ("…" if e < len(summary) else "")
        return snip, "Executive Summary"

    # Body sections
    for section in report.get("sections", []):
        heading = section.get("heading", "")
        content = section.get("content", "")
        for text, loc in [(heading, f"Section: {heading}"), (content, f"Section: {heading}")]:
            if q in text.lower():
                idx = text.lower().find(q)
                s, e = max(0, idx - 60), min(len(text), idx + len(query) + 60)
                snip = ("…" if s > 0 else "") + text[s:e] + ("…" if e < len(text) else "")
                return snip, loc

    # Sources
    for source in report.get("sources", []):
        title = source.get("title", "")
        if q in title.lower():
            return title, "Sources"

    return "", "content"


@app.get("/research/search")
async def full_text_search(
    q: str = Query(..., min_length=2),
    current_user: dict = Depends(get_current_user),
):
    """Full-text search across session topics AND report content (completed sessions only)."""
    query = q.strip()
    sessions = await search_sessions_full(user_id=current_user["id"], query=query)

    results = []
    for s in sessions:
        report = s.get("report") or {}
        snippet, match_in = ("", "topic")
        # Only extract snippet for non-topic matches
        if query.lower() not in s.get("topic", "").lower():
            snippet, match_in = _extract_snippet(report, query)
        else:
            match_in = "topic"

        row = {k: v for k, v in s.items() if k != "report"}
        row["snippet"]  = snippet
        row["match_in"] = match_in
        results.append(row)

    return {"results": results, "query": query, "total": len(results)}


@app.get("/research/entities/top")
async def get_top_research_entities(
    limit: int = Query(default=20, le=50),
    days:  int = Query(default=30,  le=365),
    current_user: dict = Depends(get_current_user),
):
    """Most-researched entities for the current user across all sessions.

    Useful for the dashboard 'What I research most' widget.
    """
    entities = await get_top_entities_db(current_user["id"], limit=limit, days=days)
    return {"entities": entities, "limit": limit, "days": days}


@app.get("/research/{session_id}/related")
async def get_related_research(
    session_id: str,
    limit: int = Query(default=5, le=10),
    current_user: dict = Depends(get_current_user),
):
    """Return sessions that share knowledge-graph entities with session_id.

    Each result contains: id, topic, created_at, shared_count, shared_entities.
    Requires the user to own the source session.
    """
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("user_id") and session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your session")

    related = await get_related_sessions_db(
        session_id,
        user_id=current_user["id"],
        limit=limit,
    )
    return {"related": related, "session_id": session_id, "total": len(related)}


@app.get("/research/{session_id}/chat/history")
async def get_session_chat_history(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Return persisted chat messages for a session (owner only)."""
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("user_id") and session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your session")

    messages = await get_chat_history(session_id, limit=50)
    return {"messages": messages, "session_id": session_id}


@app.post("/research/{session_id}/chat")
async def chat_with_report(
    session_id: str,
    body: ChatMessage,
    current_user: dict = Depends(get_current_user),
):
    """Stream an LLM answer grounded in the completed research report.

    Uses Groq (Llama 3.3 70B) with the full report as context.
    Persists both the user question and assistant answer to chat_messages.
    Returns an SSE stream of JSON chunks: {"type":"chunk","text":"..."} / {"type":"done"}.
    """
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("user_id") and session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your session")
    if session.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Research not yet complete")

    report = session.get("report") or {}
    if isinstance(report, str):
        report = json.loads(report)

    # Persist the user's question before streaming starts
    await save_chat_message(session_id, "user", body.message.strip())

    # Load conversation history (includes the message we just saved)
    history = await get_chat_history(session_id, limit=10)

    context     = _build_report_context(report)
    llm_msgs    = _build_llm_messages(context, history, session.get("topic", "research"))

    async def event_gen():
        queue: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def _run_sync():
            """Blocking Groq stream — runs in thread executor."""
            try:
                client = _GroqClient(api_key=os.environ.get("GROQ_API_KEY", ""))
                stream = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=llm_msgs,
                    max_tokens=900,
                    temperature=0.4,
                    stream=True,
                )
                for chunk in stream:
                    text = (chunk.choices[0].delta.content or "")
                    if text:
                        loop.call_soon_threadsafe(queue.put_nowait, text)
            except Exception as exc:
                err_text = f"\n\n⚠️ {str(exc)}"
                loop.call_soon_threadsafe(queue.put_nowait, err_text)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel

        loop.run_in_executor(None, _run_sync)

        answer_chunks: list[str] = []
        while True:
            text = await queue.get()
            if text is None:
                break
            answer_chunks.append(text)
            yield {"data": json.dumps({"type": "chunk", "text": text})}

        # Persist full assistant answer
        full_answer = "".join(answer_chunks)
        if full_answer and not full_answer.startswith("\n\n⚠️"):
            try:
                await save_chat_message(session_id, "assistant", full_answer)
            except Exception:
                pass

        yield {"data": json.dumps({"type": "done"})}

    return EventSourceResponse(event_gen())


@app.post("/research/{session_id}/favorite")
async def toggle_favorite(
    session_id: str,
    body: FavoriteRequest,
    current_user: dict = Depends(get_current_user),
):
    """Star/unstar a research session. Only the owner may favorite their session."""
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Ownership check (sessions created while logged in carry user_id)
    if session.get("user_id") and session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your session")
    await _set_favorite(session_id, body.is_favorite)
    return {"id": session_id, "is_favorite": body.is_favorite}


@app.post("/research/{session_id}/tags")
async def add_session_tag(
    session_id: str,
    tag_name: str = Query(...),
    color: str = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Add a tag to a research session"""
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("user_id") and session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your session")

    updated = await add_tag(session_id, tag_name, color)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to add tag")
    return {"id": session_id, "tags": updated.get("tags", [])}


@app.delete("/research/{session_id}/tags")
async def remove_session_tag(
    session_id: str,
    tag_name: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Remove a tag from a research session"""
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("user_id") and session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your session")

    updated = await remove_tag(session_id, tag_name)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to remove tag")
    return {"id": session_id, "tags": updated.get("tags", [])}


@app.get("/research/tags")
async def get_user_tags(current_user: dict = Depends(get_current_user)):
    """List all tags for the current user"""
    tags = await list_user_tags(current_user["id"])
    return {"tags": tags}


@app.get("/research/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Get analytics dashboard for the current user"""
    stats = await get_user_dashboard_stats(current_user["id"])
    return {"success": True, "data": stats}


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
async def stream_research(session_id: str, topic: str, depth: int = 3, custom_prompts: str = None):
    async def event_generator():
        all_sources = []
        sub_questions = []

        try:
            # Parse custom prompts if provided
            if custom_prompts:
                try:
                    sub_questions = json.loads(custom_prompts)
                    yield {"data": AgentEvent(
                        type="thinking",
                        agent="system",
                        message=f"📋 Using {len(sub_questions)} custom research questions",
                    ).model_dump_json()}
                except:
                    pass  # Fall back to orchestrator

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

            # Phase 1: Orchestrator (skip if custom prompts provided)
            if not sub_questions:
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

                    # 🏷️ Auto-tag: LLM generates 3-5 topic tags in the background
                    _user_id = _mem.get(session_id, {}).get("user_id")
                    asyncio.create_task(
                        _auto_tag_session(session_id, topic, report_dict, _user_id)
                    )

                    # 🕸️ KG extraction: store entities into cross-session graph tables
                    asyncio.create_task(
                        _extract_entities_to_graph(session_id, report_dict, _user_id)
                    )

                    # 🔔 Fire webhook: research completed
                    asyncio.create_task(fire_webhook_event(
                        session_id, "completed",
                        {"topic": topic, "session_id": session_id, "summary": report_dict.get("summary", "")[:500]}
                    ))

                yield {"data": event.model_dump_json()}
                await asyncio.sleep(0)

        except Exception as e:
            await _update(session_id, "failed")
            # 🔔 Fire webhook: research failed
            asyncio.create_task(fire_webhook_event(
                session_id, "failed",
                {"topic": topic, "session_id": session_id, "error": str(e)}
            ))
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
async def create_share_link(session_id: str, user: dict = Depends(get_optional_user)):
    """Create a shareable link for the research"""
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    user_id = user.get("user_id") if user else None
    token_info = await create_share_token(session_id, user_id=user_id, expires_in_days=30)

    if not token_info:
        raise HTTPException(status_code=500, detail="Failed to create share token")

    return {
        "success": True,
        "session_id": session_id,
        "token": token_info["token"],
        "share_url": f"/api/research/shared/{token_info['token']}",
        "public_url": f"https://{token_info['token']}",
        "expires_at": token_info["expires_at"],
    }



# ─── Webhook Endpoints ───────────────────────────────────────────────────────


@app.post("/research/{session_id}/webhooks")
async def add_webhook(session_id: str, req: WebhookRequest):
    """Register a webhook URL to be notified when research completes or fails.

    Events: 'completed', 'failed', 'progress'

    The webhook URL will receive a POST request with this body:
    ```json
    {
      "event": "completed",
      "session_id": "...",
      "timestamp": "...",
      "delivery_id": "...",
      "data": { "topic": "...", "summary": "..." }
    }
    ```

    If you provide a `secret`, each request will include an
    `X-ResearchMind-Signature: sha256=<hmac>` header for verification.
    """
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    webhook = await register_webhook(
        session_id=session_id,
        url=req.url,
        events=req.events,
        secret=req.secret,
    )
    return {"status": "registered", "webhook": webhook}


@app.get("/research/{session_id}/webhooks")
async def get_webhooks(session_id: str):
    """List all registered webhooks for a session"""
    webhooks = await list_webhooks(session_id)
    return {"webhooks": webhooks, "count": len(webhooks)}


@app.delete("/research/{session_id}/webhooks/{webhook_id}")
async def remove_webhook(session_id: str, webhook_id: str):
    """Delete a webhook registration"""
    deleted = await delete_webhook(session_id, webhook_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"status": "deleted", "webhook_id": webhook_id}


@app.post("/research/{session_id}/webhooks/test")
async def test_webhook(session_id: str):
    """Send a test webhook event to all registered URLs for a session"""
    await fire_webhook_event(
        session_id, "test",
        {"message": "This is a test webhook from ResearchMind", "session_id": session_id}
    )
    webhooks = await list_webhooks(session_id)
    return {"status": "fired", "webhooks_notified": len(webhooks)}


# ─── Shared Research ─────────────────────────────────────────────────────────

@app.get("/research/shared/{share_token}")
async def get_shared_research(share_token: str):
    """Access shared research via token. Returns research if token is valid and not expired."""
    session = await get_shared_session(share_token)
    if not session:
        raise HTTPException(status_code=404, detail="Share link expired or invalid")

    return {
        "success": True,
        "id": session["id"],
        "topic": session["topic"],
        "status": session["status"],
        "created_at": session["created_at"],
        "report": session.get("report"),
        "knowledge_graph": session.get("report", {}).get("knowledge_graph", {"entities": [], "relationships": []}),
    }


@app.get("/research/{session_id}/shares")
async def get_session_shares(session_id: str, user: dict = Depends(get_optional_user)):
    """List all active share tokens for a session (only owner can view)"""
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check authorization: must be owner
    if user and session.get("user_id") != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Not authorized")

    tokens = await list_share_tokens(session_id)
    return {
        "success": True,
        "session_id": session_id,
        "shares": tokens,
        "count": len(tokens),
    }


@app.delete("/research/{session_id}/shares/{share_token}")
async def revoke_share_link(session_id: str, share_token: str, user: dict = Depends(get_optional_user)):
    """Revoke a share token"""
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check authorization
    if user and session.get("user_id") != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Not authorized")

    success = await delete_share_token(share_token)
    if not success:
        raise HTTPException(status_code=404, detail="Share link not found")

    return {"success": True, "message": "Share link revoked"}


# ─── Schedule endpoints ──────────────────────────────────────────────────────

class _ScheduleCreate(_BaseModel):
    topic: str
    frequency: str = "weekly"    # "daily" | "weekly"
    day_of_week: int = 0          # 0=Mon … 6=Sun  (weekly only)
    hour: int = 9                 # UTC hour 0–23
    depth: int = 3
    notify_email: bool = True

class _ScheduleToggle(_BaseModel):
    is_active: bool


@app.get("/schedules")
async def list_schedules(current_user: dict = Depends(get_current_user)):
    """List all schedules for the authenticated user."""
    schedules = await list_schedules_db(current_user["id"])
    return {"schedules": schedules}


@app.post("/schedules")
async def create_schedule(
    body: _ScheduleCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new recurring schedule. Registers it immediately with APScheduler."""
    if body.frequency not in ("daily", "weekly"):
        raise HTTPException(status_code=400, detail="frequency must be 'daily' or 'weekly'")
    if not body.topic.strip():
        raise HTTPException(status_code=400, detail="topic cannot be empty")

    sched = await create_schedule_db(
        user_id      = current_user["id"],
        topic        = body.topic.strip(),
        frequency    = body.frequency,
        hour         = max(0, min(23, body.hour)),
        day_of_week  = max(0, min(6,  body.day_of_week)),
        depth        = max(1, min(5,  body.depth)),
        notify_email = body.notify_email,
    )
    if not sched:
        raise HTTPException(status_code=500, detail="Failed to create schedule")

    _register_job(sched)
    return sched


@app.patch("/schedules/{schedule_id}")
async def toggle_schedule(
    schedule_id: str,
    body: _ScheduleToggle,
    current_user: dict = Depends(get_current_user),
):
    """Pause or resume a schedule."""
    sched = await toggle_schedule_active(schedule_id, current_user["id"], body.is_active)
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if body.is_active:
        _register_job(sched)
    else:
        try:
            _scheduler.remove_job(schedule_id)
        except Exception:
            pass    # already removed or never registered

    return sched


@app.delete("/schedules/{schedule_id}")
async def delete_schedule(
    schedule_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Permanently delete a schedule."""
    ok = await delete_schedule_db(schedule_id, current_user["id"])
    if not ok:
        raise HTTPException(status_code=404, detail="Schedule not found")
    try:
        _scheduler.remove_job(schedule_id)
    except Exception:
        pass
    return {"ok": True}


@app.post("/schedules/{schedule_id}/run")
async def run_schedule_now(
    schedule_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Trigger an immediate run of a schedule (ignores the cron time)."""
    sched = await get_schedule_db(schedule_id)
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if sched["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your schedule")

    session_id = str(uuid.uuid4())
    await _create(session_id, sched["topic"], user_id=current_user["id"])
    await update_schedule_run(schedule_id, session_id)
    asyncio.create_task(
        _run_pipeline_bg(
            session_id, sched["topic"], sched.get("depth", 3),
            current_user["id"], sched.get("notify_email", True),
        )
    )
    return {"session_id": session_id, "topic": sched["topic"], "status": "triggered"}


# ─── Collections (named folders) ─────────────────────────────────────────────

from pydantic import BaseModel as _BaseModel
from typing import Optional as _Optional


class CollectionCreate(_BaseModel):
    name: str
    description: _Optional[str] = None
    color: str = "indigo"


class CollectionUpdate(_BaseModel):
    name: _Optional[str] = None
    description: _Optional[str] = None
    color: _Optional[str] = None


class SessionCollectionAssign(_BaseModel):
    collection_id: _Optional[str] = None


@app.get("/collections")
async def get_collections(current_user: dict = Depends(get_current_user)):
    """List all collections for the authenticated user"""
    cols = await list_collections(current_user["id"])
    return {"collections": cols}


@app.post("/collections")
async def post_collection(
    body: CollectionCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new collection"""
    coll = await create_collection(
        user_id=current_user["id"],
        name=body.name,
        description=body.description,
        color=body.color,
    )
    if not coll:
        raise HTTPException(status_code=500, detail="Failed to create collection")
    return coll


@app.patch("/collections/{collection_id}")
async def patch_collection(
    collection_id: str,
    body: CollectionUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Rename or recolor a collection"""
    coll = await update_collection(
        collection_id=collection_id,
        user_id=current_user["id"],
        name=body.name,
        description=body.description,
        color=body.color,
    )
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    return coll


@app.delete("/collections/{collection_id}")
async def del_collection(
    collection_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a collection (sessions are kept, just un-grouped)"""
    ok = await delete_collection(collection_id, current_user["id"])
    return {"ok": ok}


@app.put("/research/{session_id}/collection")
async def assign_collection(
    session_id: str,
    body: SessionCollectionAssign,
    current_user: dict = Depends(get_current_user),
):
    """Move a session into (or out of) a collection"""
    session = await set_session_collection(session_id, body.collection_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session
