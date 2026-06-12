import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from .config import GROQ_API_KEY  # noqa: F401 — triggers dotenv load at startup
from .tools.json_logging import configure_logging

configure_logging(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

from groq import Groq as _GroqClient

from fastapi import FastAPI, HTTPException, Depends, Query, Body, Request, UploadFile, File
import io
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from .models.schemas import ResearchRequest, AgentEvent, WebhookRequest, FavoriteRequest
from .agents.orchestrator import orchestrate
from .agents.search_agent import search
from .agents.reader_agent import read_sources
from .agents.synthesizer import synthesize
from .database import (
    init_db, get_pool, create_session, update_session, get_session, list_sessions,
    delete_session, get_cached_research, cache_research, set_favorite,
    create_share_token, get_shared_session, list_share_tokens, delete_share_token,
    add_tag, remove_tag, list_user_tags, get_user_dashboard_stats,
    create_collection, list_collections, update_collection, delete_collection,
    set_session_collection, search_sessions_full,
    store_kg_entities, get_related_sessions_db, get_top_entities_db,
    save_chat_message, get_chat_history, delete_chat_history,
    create_schedule_db, list_schedules_db, get_schedule_db,
    update_schedule_run, toggle_schedule_active,
    delete_schedule_db, get_all_active_schedules,
    save_document, get_documents_text, delete_document, count_user_documents,
    cleanup_old_uploads, cleanup_old_chat_messages, cleanup_expired_cache,
    add_comment, get_comments, delete_comment,
    save_report_version, get_report_versions, get_report_version,
)
from .tools.auto_tagger import extract_tags
from .tools.error_handler import friendly_error
from .tools.rate_limit import check_rate_limit
from .tools.language_detect import detect_language
from .tools.export_formats import export_markdown, export_html, format_citations
from .tools.pdf_export import generate_report_pdf
from .tools.docx_export import generate_report_docx
from .tools.metrics import (
    research_sessions_total, groq_calls_total,
    cache_hits_total, cache_misses_total, export_requests_total,
    active_sse_connections, ResearchTimer, get_metrics_output,
)
from .tools.webhooks import (
    register_webhook, list_webhooks, delete_webhook,
    fire_webhook_event,
)
from .database import (
    create_webhook_db, list_webhooks_db, delete_webhook_db,
    toggle_webhook_active, list_webhook_deliveries,
    create_chain_db, list_chains_db, get_chain_db, delete_chain_db,
    toggle_chain_auto_run, complete_chain_step_and_get_next,
    start_chain_step, fail_chain_step,
)
from .auth.user_db import init_user_tables
from .routes.auth import router as auth_router
from .routes.public_api import router as public_api_router
from .auth.dependencies import get_optional_user, get_current_user


@asynccontextmanager
async def _run_migrations() -> None:
    """Run Alembic migrations in a thread pool (Alembic is synchronous)."""
    import asyncio, os, pathlib
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        return
    try:
        from alembic.config import Config
        from alembic import command

        def _upgrade():
            ini = pathlib.Path(__file__).parent.parent / "alembic.ini"
            cfg = Config(str(ini))
            # Override the script_location to an absolute path so it works
            # regardless of the working directory at runtime.
            migrations_dir = pathlib.Path(__file__).parent.parent / "migrations"
            cfg.set_main_option("script_location", str(migrations_dir))
            command.upgrade(cfg, "head")

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _upgrade)
        logger.info("Database migrations applied (alembic head)")
    except Exception as exc:
        logger.warning("Alembic migration failed — falling back to init_db(): %s", exc)
        # Graceful fallback: run the legacy DDL-based init
        try:
            await init_db()
            await init_user_tables()
        except Exception as e:
            logger.warning("Legacy init_db also failed: %s", e)


async def lifespan(app: FastAPI):
    # Run migrations / initialise DB tables
    try:
        await _run_migrations()
    except Exception as e:
        logger.warning("Startup DB init failed: %s — falling back to in-memory", e)

    # Start scheduler and register all active persisted schedules
    _scheduler.start()
    _bg_task(_reload_all_schedules())
    # Daily data-retention job: 03:00 UTC
    _scheduler.add_job(
        lambda: asyncio.ensure_future(_run_data_retention()),
        trigger=_CronTrigger(hour=3, minute=0, timezone="UTC"),
        id="data_retention",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    logger.info("Scheduler started")

    yield

    _scheduler.shutdown(wait=True)
    pool = await get_pool()
    if pool:
        await pool.close()
    logger.info("Shutdown complete")


app = FastAPI(
    title="ResearchMind API",
    description="Multi-agent AI Research API with JWT auth, public API keys, auto-tagging, webhooks, and streaming",
    version="4.0.0",
    lifespan=lifespan,
)

# Mount routers — auth and public API available under both root and /v1
app.include_router(auth_router)
app.include_router(public_api_router)
app.include_router(auth_router, prefix="/v1")
app.include_router(public_api_router, prefix="/v1")

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

from fastapi.middleware.gzip import GZipMiddleware as _GZipMiddleware
app.add_middleware(_GZipMiddleware, minimum_size=500)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
)

from starlette.middleware.base import BaseHTTPMiddleware as _BaseHTTPMiddleware
from starlette.responses import Response as _StarletteResponse

class _RequestIDMiddleware(_BaseHTTPMiddleware):
    """Attach a unique X-Request-ID to every request and response for log correlation."""
    async def dispatch(self, request: Request, call_next) -> _StarletteResponse:
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:8]
        import contextvars as _cv
        _request_id_var.set(req_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = req_id
        return response

import contextvars as _cv_mod
_request_id_var: _cv_mod.ContextVar[str] = _cv_mod.ContextVar("request_id", default="-")
app.add_middleware(_RequestIDMiddleware)

import time as _time
from .tools.metrics import http_request_duration_seconds as _http_duration

class _RateLimitHeaderMiddleware(_BaseHTTPMiddleware):
    """Forward X-RateLimit-* headers stashed by check_rate_limit onto the response."""
    async def dispatch(self, request: Request, call_next) -> _StarletteResponse:
        response = await call_next(request)
        headers = getattr(request.state, "rate_limit_headers", None)
        if headers:
            for k, v in headers.items():
                response.headers[k] = v
        return response

app.add_middleware(_RateLimitHeaderMiddleware)


class _MetricsMiddleware(_BaseHTTPMiddleware):
    """Record HTTP request latency for Prometheus."""
    _SKIP = {"/metrics", "/health"}

    async def dispatch(self, request: Request, call_next) -> _StarletteResponse:
        if request.url.path in self._SKIP:
            return await call_next(request)
        start = _time.perf_counter()
        response = await call_next(request)
        elapsed = _time.perf_counter() - start
        # Normalise dynamic segments so cardinality stays bounded
        path = request.url.path
        for seg in path.split("/"):
            # Replace UUID-like or numeric segments with a placeholder
            if len(seg) > 8 and ("-" in seg or seg.isdigit()):
                path = path.replace(seg, "{id}", 1)
        _http_duration.labels(
            method=request.method,
            path=path,
            status_code=str(response.status_code),
        ).observe(elapsed)
        return response

app.add_middleware(_MetricsMiddleware)

from fastapi import APIRouter as _APIRouter

# v1 router — all new endpoint definitions go here; the app mounts it at /v1
# Old unversioned routes remain for backward compatibility.
v1 = _APIRouter(prefix="/v1", tags=["v1"])

# Fallback in-memory store (used if DB is unavailable)
_mem: dict[str, dict] = {}


def _bg_task(coro) -> asyncio.Task:
    """Schedule a fire-and-forget coroutine, logging any unhandled exceptions."""
    task = asyncio.create_task(coro)
    task.add_done_callback(_on_bg_task_done)
    return task


def _on_bg_task_done(task: asyncio.Task) -> None:
    if not task.cancelled() and task.exception() is not None:
        logger.error("Background task failed: %s", task.exception(), exc_info=task.exception())


async def _create(session_id: str, topic: str, user_id: str = None):
    data = {"id": session_id, "topic": topic, "status": "running",
            "created_at": datetime.now(timezone.utc).isoformat(), "report": None,
            "user_id": user_id, "is_favorite": False}
    _mem[session_id] = data
    try:
        await create_session(session_id, topic, user_id=user_id)
    except Exception as exc:
        logger.warning("DB write failed for session %s, using memory fallback: %s", session_id[:8], exc)


async def _set_favorite(session_id: str, is_favorite: bool):
    if session_id in _mem:
        _mem[session_id]["is_favorite"] = is_favorite
    try:
        await set_favorite(session_id, is_favorite)
    except Exception as exc:
        logger.warning("DB favorite update failed for %s: %s", session_id[:8], exc)


async def _update(session_id: str, status: str, report=None):
    if session_id in _mem:
        _mem[session_id]["status"] = status
        if report:
            _mem[session_id]["report"] = report
    try:
        await update_session(session_id, status, report)
    except Exception as exc:
        logger.warning("DB update failed for session %s, using memory fallback: %s", session_id[:8], exc)
    # Snapshot completed report as a new version and auto-tag
    if status == "completed" and report:
        report_dict = report if isinstance(report, dict) else json.loads(report)
        _bg_task(save_report_version(session_id, report_dict))
        _bg_task(_auto_tag_session(session_id, report_dict))


async def _auto_tag_session(session_id: str, report_dict: dict) -> None:
    """Extract tags from completed report and persist them."""
    try:
        tags = extract_tags(report_dict)
        if not tags:
            return
        sess = _mem.get(session_id, {})
        user_id = sess.get("user_id")
        for tag_name in tags:
            await add_tag(session_id, tag_name, user_id)
        logger.info("Auto-tagged session %s with: %s", session_id[:8], tags)
    except Exception as exc:
        logger.warning("Auto-tagging failed for session %s: %s", session_id[:8], exc)


async def _get(session_id: str):
    try:
        row = await get_session(session_id)
        if row:
            return row
    except Exception as exc:
        logger.warning("DB get failed for session %s, using memory fallback: %s", session_id[:8], exc)
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
        logger.info("Auto-tagged session %s: %s", session_id[:8], tags)
    except Exception as e:
        logger.warning("Auto-tagging failed for %s: %s", session_id[:8], e)


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
        logger.info("KG stored for %s: %d entities, %d edges", session_id[:8], len(entities), len(relationships))
    except Exception as e:
        logger.warning("KG extraction failed for %s: %s", session_id[:8], e)


# ─── Daily data-retention cleanup ───────────────────────────────────────────

async def _run_data_retention() -> None:
    """Runs daily at 03:00 UTC. Deletes old uploads, chat history, stale cache."""
    logger.info("Data retention job starting")
    try:
        await cleanup_old_uploads(days=30)
        await cleanup_old_chat_messages(days=90)
        await cleanup_expired_cache()
        logger.info("Data retention job complete")
    except Exception as exc:
        logger.error("Data retention job failed: %s", exc, exc_info=exc)


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
    logger.info("Registered schedule %s: '%s' (%s)", job_id[:8], sched['topic'][:40], freq)


async def _reload_all_schedules() -> None:
    """On startup: pull every active schedule from DB and register each as a job."""
    try:
        schedules = await get_all_active_schedules()
        for s in schedules:
            _register_job(s)
        logger.info("Reloaded %d active schedule(s)", len(schedules))
    except Exception as exc:
        logger.warning("Could not reload schedules: %s", exc)


async def _fire_schedule(
    schedule_id: str, user_id: str, topic: str,
    depth: int = 3, notify_email: bool = True,
) -> None:
    """Called by APScheduler when a cron job fires.
    Creates a new session and kicks off the full pipeline in the background.
    """
    logger.info("Schedule firing: '%s' (id=%s)", topic[:50], schedule_id[:8])
    session_id = str(uuid.uuid4())
    await _create(session_id, topic, user_id=user_id)
    await update_schedule_run(schedule_id, session_id)
    _bg_task(_run_pipeline_bg(session_id, topic, depth, user_id, notify_email))


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
        language = detect_language(topic)

        # ① Orchestrate
        async for event in orchestrate(topic, depth, language=language):
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
        async for _ev, source in read_sources(top_src, language=language):
            enriched.append(source)

        # ④ Synthesize
        report_dict = None
        async for _ev, report in synthesize(topic, session_id, enriched, sub_questions, language=language):
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
            _bg_task(_auto_tag_session(session_id, topic, report_dict, user_id))
            _bg_task(_extract_entities_to_graph(session_id, report_dict, user_id))
            if notify_email:
                _bg_task(_send_schedule_ready_email(user_id, topic, session_id))
            logger.info("Scheduled pipeline done: %s — %s", session_id[:8], topic[:40])
        else:
            await _update(session_id, "failed")
            if notify_email:
                _bg_task(_send_schedule_failed_email(user_id, topic, session_id))

    except Exception as exc:
        logger.error("Scheduled pipeline error (%s): %s", session_id[:8], exc, exc_info=exc)
        await _update(session_id, "failed")
        if notify_email:
            _bg_task(_send_schedule_failed_email(user_id, topic, session_id))


async def _advance_chain_if_needed(session_id: str, user_id: str | None) -> None:
    """After a session completes, advance its chain to the next pending step."""
    try:
        next_step = await complete_chain_step_and_get_next(session_id)
        if not next_step:
            return
        next_uid = next_step.get("user_id") or user_id
        new_sid = str(uuid.uuid4())
        await _create(new_sid, next_step["topic"], user_id=next_uid)
        await start_chain_step(next_step["id"], new_sid)
        _bg_task(_run_chain_step_bg(new_sid, next_step["topic"], next_uid))
        logger.info("Chain step %d: %s", next_step['step_order'], next_step['topic'][:40])
    except Exception as exc:
        logger.error("Chain advance error: %s", exc)


async def _run_chain_step_bg(session_id: str, topic: str, user_id: str) -> None:
    """Run pipeline for a chain step; auto-advance or fail-mark after completion."""
    await _run_pipeline_bg(session_id, topic, 3, user_id)
    sess = await _get(session_id)
    if sess and sess.get("status") == "completed":
        await _advance_chain_if_needed(session_id, user_id)
    elif sess and sess.get("status") == "failed":
        await fail_chain_step(session_id)


async def _suggest_chain_topics(topic: str, summary: str) -> list[str]:
    """Use LLM to suggest 3 follow-up research topics for a chain."""
    import json as _json
    prompt = (
        f'A user finished research on: "{topic}"\n\n'
        f"Summary: {summary[:800]}\n\n"
        "Suggest exactly 3 follow-up research topics that naturally extend this into a deeper series. "
        "Each topic should build on the previous but explore a new angle.\n"
        'Return ONLY a JSON array of 3 strings: ["topic 1", "topic 2", "topic 3"]'
    )
    loop = asyncio.get_event_loop()
    def _call():
        client = _GroqClient(api_key=GROQ_API_KEY)
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=200,
        )
        return resp.choices[0].message.content.strip()
    try:
        raw = await loop.run_in_executor(None, _call)
        start = raw.find("[")
        end   = raw.rfind("]") + 1
        return _json.loads(raw[start:end]) if start != -1 else []
    except Exception:
        return []



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
        logger.warning("Schedule email failed for user %s: %s", user_id, exc)


async def _send_schedule_failed_email(user_id: str, topic: str, session_id: str) -> None:
    """Email the session owner when their scheduled research fails."""
    try:
        from .auth.user_db import get_user_by_id
        from .tools.email import send_email, email_configured
        if not email_configured():
            return
        user = await get_user_by_id(user_id)
        if not user or not user.get("email"):
            return
        name = user.get("name") or user["email"].split("@")[0]
        dashboard_url = f"{FRONTEND_URL}/dashboard"
        html = f"""\
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;
            margin:0 auto;padding:24px;color:#0f172a">
  <div style="text-align:center;margin-bottom:20px">
    <span style="font-size:22px;font-weight:700;color:#6366f1">ResearchMind</span>
  </div>
  <h2 style="font-size:18px;margin:0 0 8px;color:#dc2626">Scheduled research failed</h2>
  <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px">
    Hi {name}, your scheduled research on
    <strong>&ldquo;{topic}&rdquo;</strong> encountered an error and could not complete.
  </p>
  <p style="font-size:14px;color:#475569;margin:0 0 20px">
    You can retry the research manually from your dashboard.
  </p>
  <div style="text-align:center">
    <a href="{dashboard_url}"
       style="display:inline-block;background:#6366f1;color:white;padding:12px 28px;
              border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
      Go to Dashboard
    </a>
  </div>
  <p style="font-size:12px;color:#94a3b8;margin:16px 0 0">Session ID: {session_id}</p>
</div>"""
        await send_email(user["email"], f"Research failed: {topic[:60]}", html)
    except Exception as exc:
        logger.warning("Schedule failure email failed for user %s: %s", user_id, exc)


# ─── Chat with report ────────────────────────────────────────────────────────

from pydantic import BaseModel as _PydanticBase, Field as _Field

class ChatMessage(_PydanticBase):
    message: str = _Field(..., min_length=1, max_length=2000)


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
            f"You are an expert AI research assistant helping a user explore the topic '{topic}'. "
            "You have access to a research report (below) AND your own general knowledge.\n\n"
            "Rules:\n"
            "1. When answering from the report, cite sources like [Source 1].\n"
            "2. When using your general knowledge (not in the report), prefix with 'Based on general knowledge:'.\n"
            "3. If the question is about something the report briefly covers, supplement it with what you know.\n"
            "4. Be helpful, concise, and accurate. Never refuse to answer — always provide the best answer you can.\n\n"
            f"--- RESEARCH REPORT ---\n{context}\n--- END REPORT ---"
        ),
    }
    msgs: list[dict] = [system]
    for m in history[-8:]:           # last 8 messages = 4 turns of context
        msgs.append({"role": m["role"], "content": m["content"]})
    return msgs


@app.options("/{rest_of_path:path}")
async def preflight_handler():
    return {"status": "ok"}


@app.get("/metrics", include_in_schema=False)
async def prometheus_metrics():
    """Prometheus metrics endpoint — returns text/plain exposition format."""
    from fastapi.responses import Response as _FResponse
    body, content_type = get_metrics_output()
    return _FResponse(content=body, media_type=content_type)


@app.get("/health")
async def health():
    """Health check — 200 when healthy or DB not configured, 503 when DB is
    configured but unreachable (pool failed to connect)."""
    from fastapi.responses import JSONResponse as _JSONResponse
    db_url_set = bool(os.environ.get("DATABASE_URL"))
    db_ok = not db_url_set  # default: ok when no DB is expected
    try:
        pool = await get_pool()
        if pool:
            async with pool.acquire() as _conn:
                await _conn.fetchval("SELECT 1")
            db_ok = True
    except Exception:
        db_ok = False
    from .tools.circuit_breaker import groq_breaker, tavily_breaker
    status = "ok" if db_ok else "degraded"
    payload = {
        "status": status,
        "checks": {
            "db": db_ok,
            "db_configured": db_url_set,
            "circuit_breakers": {
                "groq": groq_breaker.state,
                "tavily": tavily_breaker.state,
            },
        },
    }
    return _JSONResponse(payload, status_code=200 if db_ok else 503)


# ---------------------------------------------------------------------------
# Shared report comments
# ---------------------------------------------------------------------------

@app.get("/research/{session_id}/comments")
async def list_comments(
    session_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    all_comments = await get_comments(session_id)
    page = all_comments[offset: offset + limit]
    return {"comments": page, "total": len(all_comments), "offset": offset, "limit": limit}


class _CommentCreate(_PydanticBase):
    author_name: str = _Field(default="", max_length=80)
    content: str = _Field(..., min_length=1, max_length=2000)


@app.post("/research/{session_id}/comments")
async def post_comment(session_id: str, body: _CommentCreate):
    comment = await add_comment(session_id, body.author_name.strip() or "Anonymous", body.content.strip())
    return comment


@app.delete("/research/comments/{comment_id}")
async def remove_comment(comment_id: str, current_user=Depends(get_current_user)):
    ok = await delete_comment(comment_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Comment not found")
    return {"ok": True}


@app.get("/research/compare")
async def compare_sessions(
    a: str = Query(..., min_length=1, max_length=100, description="Session ID A"),
    b: str = Query(..., min_length=1, max_length=100, description="Session ID B"),
):
    """Compare two completed research reports side-by-side."""
    from .tools.report_compare import compare_reports
    if a == b:
        raise HTTPException(status_code=400, detail="Session IDs must be different")

    sess_a, sess_b = await asyncio.gather(_get(a), _get(b))
    if not sess_a or not sess_a.get("report"):
        raise HTTPException(status_code=404, detail=f"Session {a!r} not found or has no report")
    if not sess_b or not sess_b.get("report"):
        raise HTTPException(status_code=404, detail=f"Session {b!r} not found or has no report")

    def _parse(raw):
        if isinstance(raw, str):
            return json.loads(raw)
        return raw

    return compare_reports(_parse(sess_a["report"]), _parse(sess_b["report"]), a, b)


@app.get("/research/search")
async def search_reports(
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_optional_user),
):
    """Full-text search across stored research report content."""
    from .tools.report_search import search_sessions
    user_id = current_user["id"] if current_user else None
    try:
        sessions = await _list(user_id=user_id)
    except Exception:
        sessions = list(_mem.values())

    results = search_sessions(sessions, q)[:limit]

    return {
        "query": q,
        "total": len(results),
        "results": [
            {
                "session_id": s.get("id"),
                "topic": s.get("topic"),
                "status": s.get("status"),
                "created_at": s.get("created_at"),
                "score": s["_search"]["score"],
                "matches": s["_search"]["matches"],
            }
            for s in results
        ],
    }


@app.post("/research/{session_id}/refresh")
async def refresh_research(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Force a cache-bypassing re-run of a completed research session."""
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("user_id") and session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your session")
    if session.get("status") == "running":
        raise HTTPException(status_code=409, detail="Session is already running")

    topic = session.get("topic", "")
    if not topic:
        raise HTTPException(status_code=400, detail="Session has no topic to re-research")

    # Create a fresh session for the refreshed run, preserving the same topic
    new_session_id = str(uuid.uuid4())
    await _create(new_session_id, topic, user_id=current_user["id"])

    logger.info(
        "Research refresh: new=%s original=%s topic=%s",
        new_session_id[:8], session_id[:8], topic[:50],
    )
    return {
        "new_session_id": new_session_id,
        "original_session_id": session_id,
        "topic": topic,
        "note": "Stream the new session — cache is bypassed for this run",
    }


@app.get("/research/trending")
async def get_trending_topics(
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=12, ge=1, le=50),
):
    """Return most-researched topics across all users in the last N days (anonymised)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT topic, COUNT(*) AS cnt
                FROM sessions
                WHERE status = 'completed'
                  AND created_at > NOW() - ($1 || ' days')::INTERVAL
                GROUP BY topic
                ORDER BY cnt DESC
                LIMIT $2
                """,
                str(days), limit,
            )
        return {"trending": [{"topic": r["topic"], "count": int(r["cnt"])} for r in rows]}
    except Exception:
        return {"trending": []}


# ---------------------------------------------------------------------------
# Document upload
# ---------------------------------------------------------------------------

def _extract_text(filename: str, data: bytes) -> str:
    """Extract plain text from uploaded bytes. Supports PDF and text files."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            return "\n\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not parse PDF: {e}")
    # Plain text / markdown / CSV
    try:
        return data.decode("utf-8", errors="replace")
    except Exception:
        raise HTTPException(status_code=422, detail="Could not decode file as text")


ALLOWED_TYPES = {".pdf", ".txt", ".md", ".csv"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB per file
MAX_DOCS_PER_USER = 50             # total documents stored per user


@app.post("/documents/upload")
async def upload_documents(
    files: list[UploadFile] = File(...),
    current_user=Depends(get_current_user),
):
    if len(files) > 10:
        raise HTTPException(status_code=422, detail="Maximum 10 files per upload request")

    existing = await count_user_documents(current_user["id"])
    if existing + len(files) > MAX_DOCS_PER_USER:
        raise HTTPException(
            status_code=422,
            detail=f"Document limit reached ({MAX_DOCS_PER_USER} max). Delete some before uploading more.",
        )

    results = []
    for file in files:
        suffix = "." + (file.filename or "").rsplit(".", 1)[-1].lower()
        if suffix not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"{file.filename}: unsupported type. Allowed: PDF, TXT, MD, CSV",
            )
        data = await file.read()
        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"{file.filename} exceeds 10 MB limit")
        text = _extract_text(file.filename, data)
        if not text.strip():
            raise HTTPException(status_code=422, detail=f"{file.filename}: no text could be extracted")
        doc = await save_document(
            user_id=current_user["id"],
            filename=file.filename,
            file_type=suffix.lstrip("."),
            text_content=text,
        )
        results.append(doc)
    return {"documents": results}


@app.delete("/documents/{doc_id}")
async def remove_document(doc_id: str, current_user=Depends(get_current_user)):
    ok = await delete_document(doc_id, current_user["id"])
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"ok": True}


@app.post("/research/start")
async def start_research(
    http_request: Request,
    request: ResearchRequest,
    current_user: dict = Depends(get_optional_user),
):
    # 20 research sessions per hour for authenticated users (keyed by user id);
    # 10 per hour for anonymous users (keyed by IP).
    uid = current_user["id"] if current_user else ""
    check_rate_limit(
        http_request,
        bucket="research_start",
        max_attempts=20 if current_user else 10,
        window_seconds=3600,
        user_id=uid,
    )
    from .tools.content_moderator import moderate_topic
    blocked, reason = moderate_topic(request.topic)
    if blocked:
        raise HTTPException(status_code=451, detail=reason)

    session_id = str(uuid.uuid4())
    user_id = current_user["id"] if current_user else None
    await _create(session_id, request.topic, user_id=user_id)
    return {"session_id": session_id}


@app.get("/research/sessions/list")
async def get_sessions(
    status: str = Query(default=None, max_length=20),
    search: str = Query(default=None, max_length=200),
    days: int = Query(default=None, ge=1, le=365),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    cursor: str = Query(default=None, max_length=200, description="Opaque cursor for efficient pagination"),
    favorites: bool = False,
    tag: str = Query(default=None, max_length=80),
    collection: str = Query(default=None, max_length=100),
    current_user: dict = Depends(get_optional_user),
):
    """List sessions with pagination — supports both offset and cursor pagination."""
    import base64 as _b64
    user_id = current_user["id"] if current_user else None
    try:
        sessions = await _list(user_id=user_id, favorites_only=favorites)
    except Exception:
        sessions = []

    # Apply filters
    filtered = sessions
    if status:
        filtered = [s for s in filtered if s.get("status") == status]
    if search:
        filtered = [s for s in filtered if search.lower() in s.get("topic", "").lower()]
    if days:
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        filtered = [s for s in filtered if s.get("created_at", "") > cutoff]
    if tag:
        filtered = [s for s in filtered if any(t.get("name") == tag for t in (s.get("tags") or []))]
    if collection:
        filtered = [s for s in filtered if s.get("collection_id") == collection]

    # Cursor pagination: cursor encodes the created_at of the last seen item
    if cursor:
        try:
            cursor_ts = _b64.b64decode(cursor.encode()).decode()
            filtered = [s for s in filtered if s.get("created_at", "") < cursor_ts]
        except Exception:
            pass  # Malformed cursor — ignore, fall back to full list

    total = len(filtered)
    paginated = filtered[offset: offset + limit]

    # Build next cursor from last item's created_at
    next_cursor = None
    if len(paginated) == limit and paginated:
        last_ts = paginated[-1].get("created_at", "")
        if last_ts:
            next_cursor = _b64.b64encode(last_ts.encode()).decode()

    return {
        "items": [
            {k: v for k, v in s.items() if k != "report"}
            for s in paginated
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + limit < total,
        "next_cursor": next_cursor,
    }


# ─── Bulk operations ─────────────────────────────────────────────────────────

class _BulkDeleteRequest(_PydanticBase):
    session_ids: list[str] = _Field(..., min_length=1, max_length=50)


class _BulkTagRequest(_PydanticBase):
    session_ids: list[str] = _Field(..., min_length=1, max_length=50)
    tags: list[str] = _Field(..., min_length=1, max_length=20)


@app.get("/research/{session_id}/versions")
async def list_report_versions(session_id: str):
    """List all saved report versions for a session (newest first)."""
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    versions = await get_report_versions(session_id)
    return {"session_id": session_id, "versions": versions, "count": len(versions)}


@app.get("/research/{session_id}/versions/{version}")
async def get_report_version_detail(session_id: str, version: int):
    """Retrieve the full report for a specific historical version."""
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    report = await get_report_version(session_id, version)
    if report is None:
        raise HTTPException(status_code=404, detail=f"Version {version} not found")
    return {"session_id": session_id, "version": version, "report": report}


@app.post("/research/bulk/delete")
async def bulk_delete_sessions(
    body: _BulkDeleteRequest,
    current_user: dict = Depends(get_current_user),
):
    """Delete multiple research sessions owned by the current user."""
    deleted, skipped = [], []
    for sid in body.session_ids:
        session = await _get(sid)
        if not session:
            skipped.append({"id": sid, "reason": "not found"})
            continue
        if session.get("user_id") and session["user_id"] != current_user["id"]:
            skipped.append({"id": sid, "reason": "forbidden"})
            continue
        _mem.pop(sid, None)
        try:
            await delete_session(sid)
        except Exception:
            pass
        deleted.append(sid)
    return {"deleted": deleted, "skipped": skipped, "count": len(deleted)}


@app.post("/research/bulk/tag")
async def bulk_tag_sessions(
    body: _BulkTagRequest,
    current_user: dict = Depends(get_current_user),
):
    """Apply one or more tags to multiple sessions owned by the current user."""
    results = []
    for sid in body.session_ids:
        session = await _get(sid)
        if not session:
            results.append({"id": sid, "status": "not_found"})
            continue
        if session.get("user_id") and session["user_id"] != current_user["id"]:
            results.append({"id": sid, "status": "forbidden"})
            continue
        applied = []
        for tag_name in body.tags:
            try:
                await add_tag(sid, tag_name, current_user["id"])
                applied.append(tag_name)
            except Exception:
                pass
        results.append({"id": sid, "status": "ok", "tags_applied": applied})
    return {"results": results}


# ─── ETag / conditional GET for session detail ───────────────────────────────

@app.get("/research/{session_id}")
async def get_session_detail(
    session_id: str,
    request: Request,
):
    """Get a single session. Supports ETag / If-None-Match for efficient polling."""
    import hashlib as _hashlib
    from fastapi.responses import Response as _ETResponse

    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    body = json.dumps(session, default=str, sort_keys=True)
    etag = f'"{_hashlib.sha1(body.encode()).hexdigest()[:16]}"'

    if request.headers.get("if-none-match") == etag:
        return _ETResponse(status_code=304, headers={"ETag": etag})

    return _ETResponse(
        content=body,
        media_type="application/json",
        headers={"ETag": etag, "Cache-Control": "no-cache"},
    )


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


@app.delete("/research/{session_id}/chat/history")
async def clear_session_chat_history(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete all chat messages for a session (owner only)."""
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("user_id") and session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your session")
    await delete_chat_history(session_id)
    return {"ok": True}


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
async def stream_research(
    session_id: str,
    http_request: Request,
    topic: str = Query(..., min_length=1, max_length=500),
    depth: int = Query(default=3, ge=1, le=10),
    custom_prompts: str = Query(default=None, max_length=5000),
    language: str = Query(default=None, max_length=100),
    doc_ids: str = Query(default=None, max_length=500),
    model_tier: str = Query(default="balanced", pattern="^(fast|balanced|deep)$"),
    bypass_cache: bool = Query(default=False),
):
    async def event_generator():
        all_sources = []
        sub_questions = []
        active_sse_connections.inc()
        _research_timer = ResearchTimer()
        _research_timer.__enter__()
        research_sessions_total.labels(status="started").inc()

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

            # Check cache first (skipped on forced refresh)
            cached_report = None if bypass_cache else await get_cached_research(topic)
            if cached_report:
                cache_hits_total.inc()
                yield {"data": AgentEvent(
                    type="thinking",
                    agent="system",
                    message="✨ Returning cached research result — no API calls needed!",
                ).model_dump_json()}

                # Save cached result to session
                await _update(session_id, "completed", cached_report)
                research_sessions_total.labels(status="completed").inc()
                _research_timer.__exit__(None, None, None)
                active_sse_connections.dec()

                # Stream the cached report as if it was just generated
                yield {"data": AgentEvent(
                    type="done",
                    agent="system",
                    message="Research complete (from cache).",
                    data={"report": cached_report},
                ).model_dump_json()}
                return

            cache_misses_total.inc()

            lang = language if language else detect_language(topic)

            # Fetch uploaded document texts if doc_ids were provided
            _session_meta = _mem.get(session_id, {})
            _user_id_for_docs = _session_meta.get("user_id")
            doc_contexts = []
            if doc_ids and _user_id_for_docs:
                parsed_ids = [d.strip() for d in doc_ids.split(",") if d.strip()]
                doc_contexts = await get_documents_text(parsed_ids, _user_id_for_docs)

            _PHASE_TIMEOUT = 120  # seconds per agent phase before giving up

            async def _collect_orchestrate():
                results = []
                async for event in orchestrate(topic, depth, language=lang):
                    results.append(event)
                return results

            async def _collect_search(questions):
                results = []
                async for event, sources in search(questions):
                    results.append((event, sources))
                return results

            async def _collect_read(sources):
                results = []
                async for event, source in read_sources(sources, language=lang):
                    results.append((event, source))
                return results

            async def _collect_synthesize(enriched, questions, doc_ctx):
                results = []
                async for event, report in synthesize(
                    topic, session_id, enriched, questions,
                    language=lang, doc_contexts=doc_ctx or None, model_tier=model_tier,
                ):
                    results.append((event, report))
                return results

            # Phase 1: Orchestrator (skip if custom prompts provided)
            if not sub_questions:
                orch_events = await asyncio.wait_for(
                    _collect_orchestrate(), timeout=_PHASE_TIMEOUT
                )
                for event in orch_events:
                    if event.data and "sub_questions" in event.data:
                        sub_questions = event.data["sub_questions"]
                    yield {"data": event.model_dump_json()}
                    await asyncio.sleep(0)

            if not sub_questions:
                sub_questions = [topic]

            # Phase 2: Search
            search_results = await asyncio.wait_for(
                _collect_search(sub_questions), timeout=_PHASE_TIMEOUT
            )
            for event, sources in search_results:
                all_sources.extend(sources)
                yield {"data": event.model_dump_json()}
                await asyncio.sleep(0)

            # Phase 3: Read sources (top 6 by relevance)
            top_sources = sorted(all_sources, key=lambda s: s.relevance_score, reverse=True)[:6]
            enriched_sources = []
            read_results = await asyncio.wait_for(
                _collect_read(top_sources), timeout=_PHASE_TIMEOUT
            )
            for event, source in read_results:
                enriched_sources.append(source)
                yield {"data": event.model_dump_json()}
                await asyncio.sleep(0)

            # Phase 4: Synthesize
            synth_results = await asyncio.wait_for(
                _collect_synthesize(enriched_sources, sub_questions, doc_contexts),
                timeout=_PHASE_TIMEOUT,
            )
            for event, report in synth_results:
                if report:
                    # Deduplicate sources by title before saving (final safety check)
                    seen_titles = set()
                    unique_sources = []
                    for s in enriched_sources:
                        title_lower = s.title.lower().strip() if hasattr(s, 'title') else ""
                        if title_lower not in seen_titles:
                            unique_sources.append(s)
                            seen_titles.add(title_lower)
                    # Sort final source list by quality score (highest first)
                    unique_sources.sort(
                        key=lambda s: s.quality_score if hasattr(s, "quality_score") else 0,
                        reverse=True,
                    )

                    # Ensure sources are included when saving
                    report_dict = report.model_dump()
                    report_dict["sources"] = [s.model_dump() if hasattr(s, 'model_dump') else s for s in unique_sources]
                    await _update(session_id, "completed", report_dict)
                    research_sessions_total.labels(status="completed").inc()
                    _research_timer.__exit__(None, None, None)
                    active_sse_connections.dec()

                    # Cache the completed research for future queries
                    await cache_research(topic, report_dict)

                    # 🏷️ Auto-tag: LLM generates 3-5 topic tags in the background
                    _user_id = _mem.get(session_id, {}).get("user_id")
                    _bg_task(_auto_tag_session(session_id, topic, report_dict, _user_id))

                    # 🕸️ KG extraction: store entities into cross-session graph tables
                    _bg_task(_extract_entities_to_graph(session_id, report_dict, _user_id))

                    # 🔔 Fire webhook: research completed
                    _bg_task(fire_webhook_event(
                        session_id, "completed",
                        {"topic": topic, "session_id": session_id, "summary": report_dict.get("summary", "")[:500]},
                        user_id=_user_id,
                    ))

                    # ⛓️ Chain: advance to next step if this session is part of a chain
                    _bg_task(_advance_chain_if_needed(session_id, _user_id))

                yield {"data": event.model_dump_json()}
                await asyncio.sleep(0)

        except Exception as e:
            await _update(session_id, "failed")
            research_sessions_total.labels(status="failed").inc()
            _research_timer.__exit__(None, None, None)
            active_sse_connections.dec()
            _fail_uid = _mem.get(session_id, {}).get("user_id")
            # 🔔 Fire webhook: research failed
            _bg_task(fire_webhook_event(
                session_id, "failed",
                {"topic": topic, "session_id": session_id, "error": str(e)},
                user_id=_fail_uid,
            ))
            # ⛓️ Chain: mark step as failed
            _bg_task(fail_chain_step(session_id))
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

        if format_type == "docx":
            from fastapi.responses import Response as _DocxResponse
            export_requests_total.labels(format="docx").inc()
            docx_bytes = generate_report_docx(report_dict, session_id)
            return _DocxResponse(
                content=docx_bytes,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": f"attachment; filename=report-{session_id[:8]}.docx"},
            )
        elif format_type == "pdf":
            from fastapi.responses import Response as _PDFResponse
            export_requests_total.labels(format="pdf").inc()
            pdf_bytes = generate_report_pdf(report_dict, session_id)
            return _PDFResponse(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename=report-{session_id[:8]}.pdf"},
            )
        elif format_type == "markdown":
            export_requests_total.labels(format="markdown").inc()
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
            export_requests_total.labels(format="html").inc()
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

class _ScheduleCreate(_PydanticBase):
    topic: str
    frequency: str = "weekly"    # "daily" | "weekly"
    day_of_week: int = 0          # 0=Mon … 6=Sun  (weekly only)
    hour: int = 9                 # UTC hour 0–23
    depth: int = 3
    notify_email: bool = True

class _ScheduleToggle(_PydanticBase):
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
    _bg_task(_run_pipeline_bg(
        session_id, sched["topic"], sched.get("depth", 3),
        current_user["id"], sched.get("notify_email", True),
    ))
    return {"session_id": session_id, "topic": sched["topic"], "status": "triggered"}


# ─── Research Chains ─────────────────────────────────────────────────────────

class _ChainCreate(_PydanticBase):
    name: str
    topics: list[str]
    root_session_id: str | None = None
    auto_run: bool = True


class _ChainToggle(_PydanticBase):
    auto_run: bool


@app.post("/chains/suggest")
async def suggest_chain_topics(
    session_id: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_user),
):
    """Generate 3 follow-up topic suggestions for a completed research session."""
    session = await _get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your session")
    report = session.get("report") or {}
    if isinstance(report, str):
        import json as _j; report = _j.loads(report)
    summary = report.get("summary", "")
    topics = await _suggest_chain_topics(session.get("topic", ""), summary)
    return {"topics": topics, "session_id": session_id}


@app.get("/chains")
async def list_chains(current_user: dict = Depends(get_current_user)):
    """List all research chains for the authenticated user."""
    chains = await list_chains_db(current_user["id"])
    return {"chains": chains, "count": len(chains)}


@app.post("/chains", status_code=201)
async def create_chain(
    req: _ChainCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a research chain from a list of topics.

    If `root_session_id` is provided the first step is marked completed immediately
    (the root session already has its results). Set `auto_run=true` to have subsequent
    steps start automatically as each one finishes.
    """
    if len(req.topics) < 1 or len(req.topics) > 10:
        raise HTTPException(status_code=400, detail="Chain must have 1-10 topics")

    chain = await create_chain_db(
        user_id=current_user["id"],
        name=req.name,
        topics=req.topics,
        root_session_id=req.root_session_id,
        auto_run=req.auto_run,
    )

    # If root_session_id given, link first step to it and mark completed; kick off step 2
    if req.root_session_id and chain["steps"]:
        first = chain["steps"][0]
        await start_chain_step(first["id"], req.root_session_id)
        if req.auto_run and len(chain["steps"]) > 1:
            _bg_task(_advance_chain_if_needed(req.root_session_id, current_user["id"]))

    # Reload with updated step states
    chain = await get_chain_db(chain["id"])
    return {"status": "created", "chain": chain}


@app.get("/chains/{chain_id}")
async def get_chain(chain_id: str, current_user: dict = Depends(get_current_user)):
    """Get a chain with all its steps."""
    chain = await get_chain_db(chain_id)
    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")
    if chain["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your chain")
    return chain


@app.patch("/chains/{chain_id}")
async def update_chain(
    chain_id: str,
    req: _ChainToggle,
    current_user: dict = Depends(get_current_user),
):
    """Toggle auto-run on a chain."""
    chain = await toggle_chain_auto_run(chain_id, current_user["id"], req.auto_run)
    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")
    return {"status": "updated", "chain": chain}


@app.delete("/chains/{chain_id}")
async def delete_chain(chain_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a chain (does not delete the underlying research sessions)."""
    chain = await get_chain_db(chain_id)
    if not chain or chain["user_id"] != current_user["id"]:
        raise HTTPException(status_code=404, detail="Chain not found")
    await delete_chain_db(chain_id, current_user["id"])
    return {"status": "deleted", "chain_id": chain_id}


# ─── User-level webhook management ──────────────────────────────────────────

class _WebhookCreate(_PydanticBase):
    url: str
    events: list[str] = ["completed", "failed"]
    secret: str | None = None


class _WebhookToggle(_PydanticBase):
    is_active: bool


@app.get("/webhooks")
async def list_user_webhooks(current_user: dict = Depends(get_current_user)):
    """List all webhooks registered for the authenticated user."""
    hooks = await list_webhooks_db(current_user["id"])
    return {"webhooks": hooks, "count": len(hooks)}


@app.post("/webhooks", status_code=201)
async def create_user_webhook(
    req: _WebhookCreate,
    current_user: dict = Depends(get_current_user),
):
    """Register a persistent webhook that fires for all of the user's research sessions.

    Supported events: `completed`, `failed`.
    If a `secret` is provided, every delivery will include an
    `X-ResearchMind-Signature: sha256=<hmac>` header for verification.

    The `secret` field is returned **only once** in this response — store it safely.
    """
    hook = await create_webhook_db(
        user_id=current_user["id"],
        url=req.url,
        events=req.events,
        secret=req.secret,
    )
    return {"status": "created", "webhook": hook}


@app.patch("/webhooks/{webhook_id}")
async def toggle_user_webhook(
    webhook_id: str,
    req: _WebhookToggle,
    current_user: dict = Depends(get_current_user),
):
    """Pause or resume a webhook."""
    hook = await toggle_webhook_active(webhook_id, current_user["id"], req.is_active)
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"status": "updated", "webhook": hook}


@app.delete("/webhooks/{webhook_id}")
async def delete_user_webhook(
    webhook_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a webhook registration."""
    deleted = await delete_webhook_db(webhook_id, current_user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"status": "deleted", "webhook_id": webhook_id}


@app.post("/webhooks/{webhook_id}/test")
async def test_user_webhook(
    webhook_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Send a test event to the webhook URL to verify connectivity."""
    import secrets as _secrets
    from .tools.webhooks import _post_once
    from .database import get_user_webhooks_for_event

    # Verify ownership
    hooks = await list_webhooks_db(current_user["id"])
    hook = next((h for h in hooks if h["id"] == webhook_id), None)
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    # Get secret-bearing row for HMAC signing
    all_hooks = await get_user_webhooks_for_event(current_user["id"], "test")
    full_hook = next(
        (h for h in all_hooks if h["id"] == webhook_id),
        {"id": webhook_id, "url": hook["url"], "secret": None},
    )

    payload = {
        "event": "test",
        "session_id": "test_session",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "delivery_id": f"test_{_secrets.token_hex(6)}",
        "data": {"message": "Test delivery from ResearchMind", "user": current_user.get("email", "")},
    }
    ok, status_code, err, dur = await _post_once(full_hook, json.dumps(payload))
    return {"success": ok, "status_code": status_code, "duration_ms": dur, "error": err}


@app.get("/webhooks/{webhook_id}/deliveries")
async def get_webhook_deliveries(
    webhook_id: str,
    limit: int = Query(default=20, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Get delivery log for a webhook (most recent first)."""
    hooks = await list_webhooks_db(current_user["id"])
    if not any(h["id"] == webhook_id for h in hooks):
        raise HTTPException(status_code=404, detail="Webhook not found")
    deliveries = await list_webhook_deliveries(webhook_id, limit=limit)
    return {"deliveries": deliveries, "count": len(deliveries)}


# ─── API version info ────────────────────────────────────────────────────────

@app.get("/", tags=["meta"])
async def api_root():
    """API root — returns version and available prefixes."""
    return {
        "name": "ResearchMind API",
        "version": "4.0.0",
        "prefixes": {
            "stable": "/v1",
            "legacy": "/  (backward compat, no breaking changes planned)",
        },
        "docs": "/docs",
    }


@v1.get("/", tags=["meta"])
async def v1_root():
    return {"name": "ResearchMind API", "version": "4.0.0", "prefix": "/v1"}


# Register v1 router last so its routes appear in /docs under the v1 tag
app.include_router(v1)


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
