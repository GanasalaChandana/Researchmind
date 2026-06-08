import asyncpg
import os
import json
import secrets
from typing import Optional
from datetime import datetime, timezone, timedelta


_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> Optional[asyncpg.Pool]:
    global _pool
    if _pool is None:
        db_url = os.environ.get("DATABASE_URL", "")
        if not db_url:
            print("⚠️  DATABASE_URL not set")
            return None
        try:
            # asyncpg needs postgresql:// scheme
            if db_url.startswith("postgres://"):
                db_url = db_url.replace("postgres://", "postgresql://", 1)
            # Strip query params (e.g. ?sslmode=require) — we pass ssl explicitly below
            if "?" in db_url:
                db_url = db_url.split("?", 1)[0]
            # statement_cache_size=0 is required for Supabase's transaction-mode
            # pooler (port 6543); harmless for session mode / direct connections.
            _pool = await asyncpg.create_pool(
                db_url,
                min_size=1,
                max_size=5,
                ssl="require",
                statement_cache_size=0,
                command_timeout=30,
            )
            print("✅ Postgres pool connected")
        except Exception as e:
            print(f"❌ Postgres connection failed: {type(e).__name__}: {e}")
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
                report      JSONB,
                user_id     TEXT,
                is_favorite BOOLEAN NOT NULL DEFAULT FALSE
            )
        """)
        # Add columns if they don't exist (migrations for existing deployments)
        await conn.execute("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id TEXT")
        await conn.execute(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE"
        )
        await conn.execute(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'"
        )

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS research_cache (
                topic_normalized TEXT PRIMARY KEY,
                report JSONB NOT NULL,
                cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS share_tokens (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                token TEXT NOT NULL UNIQUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                expires_at TIMESTAMPTZ NOT NULL,
                created_by TEXT
            )
        """)
        # Create index for token lookup
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token)"
        )


async def create_session(session_id: str, topic: str, user_id: str = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sessions (id, topic, status, user_id) VALUES ($1, $2, 'running', $3)",
            session_id, topic, user_id,
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
    user_id: str = None,
    favorites_only: bool = False,
) -> list[dict]:
    """List sessions with optional filtering, scoped to user if user_id provided"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = "SELECT * FROM sessions WHERE 1=1"
        params = []

        if user_id:
            query += " AND user_id = $" + str(len(params) + 1)
            params.append(user_id)

        if status:
            query += " AND status = $" + str(len(params) + 1)
            params.append(status)

        if search_query:
            query += " AND (topic ILIKE $" + str(len(params) + 1) + ")"
            params.append(f"%{search_query}%")

        if days_back:
            query += " AND created_at > NOW() - INTERVAL '" + str(days_back) + " days'"

        if favorites_only:
            query += " AND is_favorite = TRUE"

        query += " ORDER BY created_at DESC LIMIT $" + str(len(params) + 1)
        params.append(limit)

        rows = await conn.fetch(query, *params)
        return [_row_to_dict(r) for r in rows]


async def set_favorite(session_id: str, is_favorite: bool):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE sessions SET is_favorite=$1 WHERE id=$2", is_favorite, session_id
        )


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


async def create_share_token(session_id: str, user_id: str = None, expires_in_days: int = 30) -> Optional[dict]:
    """Create a share token for a session. Returns token details or None if failed."""
    try:
        pool = await get_pool()
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

        async with pool.acquire() as conn:
            token_id = secrets.token_hex(8)
            await conn.execute(
                """INSERT INTO share_tokens (id, session_id, token, expires_at, created_by)
                   VALUES ($1, $2, $3, $4, $5)""",
                token_id, session_id, token, expires_at, user_id
            )
            return {
                "token": token,
                "session_id": session_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": expires_at.isoformat(),
            }
    except Exception as e:
        print(f"Failed to create share token: {e}")
        return None


async def get_shared_session(token: str) -> Optional[dict]:
    """Validate share token and return session if valid (not expired)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT s.* FROM sessions s
                   INNER JOIN share_tokens st ON s.id = st.session_id
                   WHERE st.token = $1 AND st.expires_at > NOW()""",
                token
            )
            if row:
                return _row_to_dict(row)
    except Exception as e:
        print(f"Failed to validate share token: {e}")
    return None


async def list_share_tokens(session_id: str) -> list[dict]:
    """List all active share tokens for a session."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT id, session_id, token, created_at, expires_at
                   FROM share_tokens
                   WHERE session_id = $1 AND expires_at > NOW()
                   ORDER BY created_at DESC""",
                session_id
            )
            return [dict(r) for r in rows]
    except Exception:
        return []


async def delete_share_token(token: str) -> bool:
    """Delete a share token."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM share_tokens WHERE token = $1",
                token
            )
            return result == "DELETE 1"
    except Exception:
        return False


async def add_tag(session_id: str, tag_name: str, color: str = None) -> Optional[dict]:
    """Add a tag to a session. Returns the session or None."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Get current tags
            row = await conn.fetchrow("SELECT tags FROM sessions WHERE id = $1", session_id)
            if not row:
                return None

            current_tags = row["tags"] or []
            if isinstance(current_tags, str):
                current_tags = json.loads(current_tags)

            # Check if tag already exists
            if any(t.get("name") == tag_name for t in current_tags):
                # Tag already exists, return session as-is
                return await get_session(session_id)

            # Add new tag
            new_tag = {"name": tag_name}
            if color:
                new_tag["color"] = color
            current_tags.append(new_tag)

            await conn.execute(
                "UPDATE sessions SET tags = $1 WHERE id = $2",
                json.dumps(current_tags),
                session_id,
            )
            return await get_session(session_id)
    except Exception as e:
        print(f"Failed to add tag: {e}")
        return None


async def remove_tag(session_id: str, tag_name: str) -> Optional[dict]:
    """Remove a tag from a session. Returns the session or None."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Get current tags
            row = await conn.fetchrow("SELECT tags FROM sessions WHERE id = $1", session_id)
            if not row:
                return None

            current_tags = row["tags"] or []
            if isinstance(current_tags, str):
                current_tags = json.loads(current_tags)

            # Remove tag
            updated_tags = [t for t in current_tags if t.get("name") != tag_name]

            await conn.execute(
                "UPDATE sessions SET tags = $1 WHERE id = $2",
                json.dumps(updated_tags),
                session_id,
            )
            return await get_session(session_id)
    except Exception as e:
        print(f"Failed to remove tag: {e}")
        return None


async def list_user_tags(user_id: str) -> list[str]:
    """List all unique tag names for a user's sessions."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT DISTINCT tags FROM sessions WHERE user_id = $1",
                user_id,
            )
            tag_names = set()
            for row in rows:
                tags = row["tags"] or []
                if isinstance(tags, str):
                    tags = json.loads(tags)
                for tag in tags:
                    tag_names.add(tag.get("name", ""))
            return sorted(list(tag_names))
    except Exception:
        return []
