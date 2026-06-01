import asyncpg
import os
import json
from typing import Optional


_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        db_url = os.environ.get("DATABASE_URL", "")
        if not db_url:
            raise RuntimeError("DATABASE_URL not set")
        # Railway uses postgres:// but asyncpg needs postgresql://
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)
        _pool = await asyncpg.create_pool(db_url, min_size=1, max_size=5, ssl="require")
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


async def list_sessions(limit: int = 20) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM sessions ORDER BY created_at DESC LIMIT $1", limit
        )
        return [_row_to_dict(r) for r in rows]


def _row_to_dict(row) -> dict:
    d = dict(row)
    if d.get("report") and isinstance(d["report"], str):
        d["report"] = json.loads(d["report"])
    if d.get("created_at"):
        d["created_at"] = d["created_at"].isoformat()
    return d
