import asyncpg
import os
import json
from typing import Optional


_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> Optional[asyncpg.Pool]:
    global _pool
    if _pool is None:
        db_url = os.environ.get("DATABASE_URL", "")
        if not db_url:
            return None
        try:
            # Railway uses postgres:// but asyncpg needs postgresql://
            if db_url.startswith("postgres://"):
                db_url = db_url.replace("postgres://", "postgresql://", 1)
            _pool = await asyncpg.create_pool(db_url, min_size=1, max_size=5, ssl="require")
        except Exception:
            return None
    return _pool


async def init_db():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id          TEXT PRIMARY KEY,
                topic       TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'running',
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                report      JSONB
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS research_cache (
                topic_normalized TEXT PRIMARY KEY,
                report JSONB NOT NULL,
                cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)


async def create_session(session_id: str, topic: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sessions (id, topic, status) VALUES ($1, $2, 'running')",
            session_id, topic,
        )


async def update_session(session_id: str, status: str, report: Optional[dict] = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if report:
            await conn.execute(
                "UPDATE sessions SET status=$1, report=$2 WHERE id=$3",
                status, json.dumps(report), session_id,
            )
        else:
            await conn.execute(
                "UPDATE sessions SET status=$1 WHERE id=$2",
                status, session_id,
            )


async def get_session(session_id: str) -> Optional[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM sessions WHERE id=$1", session_id)
        if not row:
            return None
        return _row_to_dict(row)


async def list_sessions(
    limit: int = 20,
    status: str = None,
    search_query: str = None,
    days_back: int = None,
) -> list[dict]:
    """List sessions with optional filtering"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = "SELECT * FROM sessions WHERE 1=1"
        params = []

        if status:
            query += " AND status = $" + str(len(params) + 1)
            params.append(status)

        if search_query:
            query += " AND (topic ILIKE $" + str(len(params) + 1) + ")"
            params.append(f"%{search_query}%")

        if days_back:
            query += " AND created_at > NOW() - INTERVAL '" + str(days_back) + " days'"

        query += " ORDER BY created_at DESC LIMIT $" + str(len(params) + 1)
        params.append(limit)

        rows = await conn.fetch(query, *params)
        return [_row_to_dict(r) for r in rows]


async def delete_session(session_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sessions WHERE id=$1", session_id)


def _normalize_topic(topic: str) -> str:
    """Normalize topic for cache lookup (lowercase, remove extra spaces)"""
    return topic.lower().strip()


async def get_cached_research(topic: str) -> Optional[dict]:
    """Get cached research report if available"""
    try:
        pool = await get_pool()
        topic_normalized = _normalize_topic(topic)
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT report FROM research_cache WHERE topic_normalized=$1",
                topic_normalized,
            )
            if row and row["report"]:
                report = row["report"]
                if isinstance(report, str):
                    report = json.loads(report)
                return report
    except Exception:
        pass  # Cache miss or DB error, return None
    return None


async def cache_research(topic: str, report: dict):
    """Cache a completed research report"""
    try:
        pool = await get_pool()
        topic_normalized = _normalize_topic(topic)
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO research_cache (topic_normalized, report)
                   VALUES ($1, $2)
                   ON CONFLICT (topic_normalized) DO UPDATE
                   SET report=$2, cached_at=NOW()""",
                topic_normalized,
                json.dumps(report),
            )
    except Exception:
        pass  # Cache write failure is not fatal


def _row_to_dict(row) -> dict:
    d = dict(row)
    if d.get("report") and isinstance(d["report"], str):
        d["report"] = json.loads(d["report"])
    if d.get("created_at"):
        d["created_at"] = d["created_at"].isoformat()
    return d
