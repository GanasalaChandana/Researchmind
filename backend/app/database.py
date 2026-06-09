import asyncpg
import os
import json
import uuid
import secrets
import hashlib
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

        # Collections — named folders for grouping sessions
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS collections (
                id          TEXT PRIMARY KEY,
                user_id     TEXT NOT NULL,
                name        TEXT NOT NULL,
                description TEXT,
                color       TEXT NOT NULL DEFAULT 'indigo',
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        await conn.execute(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS collection_id TEXT"
        )

        # API keys — persistent, DB-backed (replaces in-memory store)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS api_keys (
                id            TEXT PRIMARY KEY,
                user_id       TEXT NOT NULL,
                name          TEXT NOT NULL,
                key_hash      TEXT NOT NULL UNIQUE,
                key_prefix    TEXT NOT NULL,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_used_at  TIMESTAMPTZ,
                request_count INTEGER NOT NULL DEFAULT 0,
                is_active     BOOLEAN NOT NULL DEFAULT TRUE
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)"
        )

        # ── Cross-session Knowledge Graph tables ─────────────────────────────────
        # Normalised entity registry — one row per unique (user, name, type)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS kg_entities (
                id           TEXT PRIMARY KEY,
                user_id      TEXT NOT NULL,
                name         TEXT NOT NULL,
                type         TEXT NOT NULL DEFAULT 'concept',
                first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (user_id, name, type)
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_kg_entities_user ON kg_entities(user_id)"
        )

        # Many-to-many: session ↔ entity (which sessions mention which entity)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS kg_session_entities (
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                entity_id  TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
                PRIMARY KEY (session_id, entity_id)
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_kg_se_entity ON kg_session_entities(entity_id)"
        )

        # Directed edges between entities, scoped to the session they came from
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS kg_edges (
                id               TEXT PRIMARY KEY,
                session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                source_entity_id TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
                target_entity_id TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
                label            TEXT NOT NULL DEFAULT 'related',
                weight           INTEGER NOT NULL DEFAULT 1
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_kg_edges_session ON kg_edges(session_id)"
        )

        # ── Chat messages (per-session Q&A history) ──────────────────────────
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id         TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                role       TEXT NOT NULL,
                content    TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)"
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
    # asyncpg returns JSONB columns as strings — parse them to Python objects
    if d.get("report") and isinstance(d["report"], str):
        try:
            d["report"] = json.loads(d["report"])
        except Exception:
            d["report"] = None
    if "tags" in d and isinstance(d["tags"], str):
        try:
            d["tags"] = json.loads(d["tags"])
        except Exception:
            d["tags"] = []
    if not isinstance(d.get("tags"), list):
        d["tags"] = []
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


async def get_user_dashboard_stats(user_id: str) -> dict:
    """Get dashboard analytics for a user."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Basic stats
            total = await conn.fetchval(
                "SELECT COUNT(*) FROM sessions WHERE user_id = $1",
                user_id,
            )

            completed = await conn.fetchval(
                "SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND status = 'completed'",
                user_id,
            )

            failed = await conn.fetchval(
                "SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND status = 'failed'",
                user_id,
            )

            running = await conn.fetchval(
                "SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND status = 'running'",
                user_id,
            )

            favorites = await conn.fetchval(
                "SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND is_favorite = TRUE",
                user_id,
            )

            # Top topics
            top_topics = await conn.fetch(
                """SELECT topic, COUNT(*) as count
                   FROM sessions WHERE user_id = $1
                   GROUP BY topic ORDER BY count DESC LIMIT 5""",
                user_id,
            )

            # Sessions by date (last 30 days)
            sessions_by_date = await conn.fetch(
                """SELECT DATE(created_at) as date, COUNT(*) as count,
                   SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
                   FROM sessions WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
                   GROUP BY DATE(created_at) ORDER BY date""",
                user_id,
            )

            # Average depth (if stored, use 3 as default for now)
            avg_depth = 3  # Can enhance later if depth is stored

            # Status breakdown
            status_data = {
                "completed": completed,
                "failed": failed,
                "running": running,
            }

            return {
                "total": total,
                "completed": completed,
                "failed": failed,
                "running": running,
                "favorites": favorites,
                "success_rate": round((completed / total * 100) if total > 0 else 0, 1),
                "avg_depth": avg_depth,
                "top_topics": [dict(r) for r in top_topics],
                "sessions_by_date": [dict(r) for r in sessions_by_date],
                "status_breakdown": status_data,
            }
    except Exception as e:
        print(f"Failed to get dashboard stats: {e}")
        return {
            "total": 0,
            "completed": 0,
            "failed": 0,
            "running": 0,
            "favorites": 0,
            "success_rate": 0,
            "avg_depth": 3,
            "top_topics": [],
            "sessions_by_date": [],
            "status_breakdown": {},
        }


# ---------------------------------------------------------------------------
# Full-text search across report content
# ---------------------------------------------------------------------------

async def search_sessions_full(
    user_id: str,
    query: str,
    limit: int = 30,
) -> list[dict]:
    """Search topic AND report JSONB content for *query* (completed sessions only)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT * FROM sessions
                   WHERE user_id = $1
                     AND status = 'completed'
                     AND (
                       topic ILIKE $2
                       OR (report IS NOT NULL AND report::text ILIKE $2)
                     )
                   ORDER BY created_at DESC
                   LIMIT $3""",
                user_id,
                f"%{query}%",
                limit,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        print(f"Full-text search failed: {e}")
        return []


# ---------------------------------------------------------------------------
# Collections (named folders)
# ---------------------------------------------------------------------------

def _collection_row(row) -> dict:
    d = dict(row)
    if d.get("created_at"):
        d["created_at"] = d["created_at"].isoformat()
    # session_count comes from COUNT() and is already an int in asyncpg
    return d


async def create_collection(
    user_id: str,
    name: str,
    description: Optional[str] = None,
    color: str = "indigo",
) -> Optional[dict]:
    try:
        pool = await get_pool()
        coll_id = f"coll_{secrets.token_hex(8)}"
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """INSERT INTO collections (id, user_id, name, description, color)
                   VALUES ($1, $2, $3, $4, $5) RETURNING *""",
                coll_id, user_id, name.strip(), description, color,
            )
            return {**_collection_row(row), "session_count": 0} if row else None
    except Exception as e:
        print(f"Failed to create collection: {e}")
        return None


async def list_collections(user_id: str) -> list[dict]:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT c.id, c.user_id, c.name, c.description, c.color, c.created_at,
                          COUNT(s.id) AS session_count
                   FROM collections c
                   LEFT JOIN sessions s ON s.collection_id = c.id
                   WHERE c.user_id = $1
                   GROUP BY c.id
                   ORDER BY c.created_at DESC""",
                user_id,
            )
            return [_collection_row(r) for r in rows]
    except Exception as e:
        print(f"Failed to list collections: {e}")
        return []


async def update_collection(
    collection_id: str,
    user_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    color: Optional[str] = None,
) -> Optional[dict]:
    try:
        pool = await get_pool()
        updates: list[str] = []
        params: list = []
        if name is not None:
            updates.append(f"name = ${len(params)+1}")
            params.append(name.strip())
        if description is not None:
            updates.append(f"description = ${len(params)+1}")
            params.append(description)
        if color is not None:
            updates.append(f"color = ${len(params)+1}")
            params.append(color)
        if not updates:
            return None
        params.extend([collection_id, user_id])
        q = (
            f"UPDATE collections SET {', '.join(updates)} "
            f"WHERE id = ${len(params)-1} AND user_id = ${len(params)} RETURNING *"
        )
        async with pool.acquire() as conn:
            row = await conn.fetchrow(q, *params)
            return _collection_row(row) if row else None
    except Exception as e:
        print(f"Failed to update collection: {e}")
        return None


async def delete_collection(collection_id: str, user_id: str) -> bool:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Detach sessions first (don't delete them)
            await conn.execute(
                "UPDATE sessions SET collection_id = NULL WHERE collection_id = $1",
                collection_id,
            )
            result = await conn.execute(
                "DELETE FROM collections WHERE id = $1 AND user_id = $2",
                collection_id, user_id,
            )
            return result == "DELETE 1"
    except Exception as e:
        print(f"Failed to delete collection: {e}")
        return False


async def set_session_collection(
    session_id: str, collection_id: Optional[str]
) -> Optional[dict]:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE sessions SET collection_id = $1 WHERE id = $2",
                collection_id, session_id,
            )
            return await get_session(session_id)
    except Exception as e:
        print(f"Failed to set session collection: {e}")
        return None


# ---------------------------------------------------------------------------
# API key management (DB-backed, persistent across deploys)
# ---------------------------------------------------------------------------

def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


async def create_api_key_db(user_id: str, name: str) -> Optional[dict]:
    """Create a persistent API key for a user. Raw key is returned ONCE only."""
    try:
        pool = await get_pool()
        raw_key    = f"rm_{secrets.token_urlsafe(32)}"
        key_hash   = _hash_key(raw_key)
        key_prefix = raw_key[:14]          # "rm_" + first 11 chars
        key_id     = f"key_{secrets.token_hex(8)}"

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix)
                   VALUES ($1, $2, $3, $4, $5)
                   RETURNING id, user_id, name, key_prefix, created_at, request_count, is_active""",
                key_id, user_id, name.strip(), key_hash, key_prefix,
            )
        result = dict(row)
        result["created_at"] = result["created_at"].isoformat()
        result["key"] = raw_key   # shown once — caller must display to user
        return result
    except Exception as e:
        print(f"Failed to create API key: {e}")
        return None


async def validate_api_key_db(raw_key: str) -> Optional[str]:
    """Return user_id for a valid active key, or None."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT user_id FROM api_keys WHERE key_hash=$1 AND is_active=TRUE",
                _hash_key(raw_key),
            )
        return row["user_id"] if row else None
    except Exception as e:
        print(f"Failed to validate API key: {e}")
        return None


async def list_api_keys_db(user_id: str) -> list[dict]:
    """List all keys for a user (key_hash is never returned)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT id, name, key_prefix, created_at, last_used_at,
                          request_count, is_active
                   FROM api_keys WHERE user_id=$1 ORDER BY created_at DESC""",
                user_id,
            )
        result = []
        for r in rows:
            d = dict(r)
            d["created_at"]   = d["created_at"].isoformat()
            d["last_used_at"] = d["last_used_at"].isoformat() if d.get("last_used_at") else None
            result.append(d)
        return result
    except Exception as e:
        print(f"Failed to list API keys: {e}")
        return []


async def delete_api_key_db(key_id: str, user_id: str) -> bool:
    """Delete a key by ID. Owner-scoped."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM api_keys WHERE id=$1 AND user_id=$2",
                key_id, user_id,
            )
        return result == "DELETE 1"
    except Exception as e:
        print(f"Failed to delete API key: {e}")
        return False


async def update_key_usage_db(raw_key: str) -> None:
    """Increment request count + update last_used_at timestamp."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE api_keys
                   SET last_used_at=NOW(), request_count=request_count+1
                   WHERE key_hash=$1""",
                _hash_key(raw_key),
            )
    except Exception as e:
        print(f"Failed to update key usage: {e}")


# ---------------------------------------------------------------------------
# Cross-session Knowledge Graph
# ---------------------------------------------------------------------------

async def store_kg_entities(
    session_id: str,
    entities: list[dict],
    relationships: list[dict],
    user_id: str,
) -> None:
    """Upsert entities from a completed report into the cross-session KG tables.

    * kg_entities       — one row per unique (user_id, name, type)
    * kg_session_entities — maps this session to each entity
    * kg_edges          — directed relationship edges for this session
    """
    if not entities:
        return
    pool = await get_pool()
    async with pool.acquire() as conn:
        # local report entity-id → DB entity id
        local_to_db: dict[str, str] = {}

        for ent in entities:
            name = (ent.get("name") or "").strip()
            if not name:
                continue
            etype  = ent.get("type") or "concept"
            new_id = str(uuid.uuid4())

            # Upsert: insert new or update to get the canonical id back
            row = await conn.fetchrow(
                """
                INSERT INTO kg_entities (id, user_id, name, type)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, name, type)
                    DO UPDATE SET name = EXCLUDED.name
                RETURNING id
                """,
                new_id, user_id, name, etype,
            )
            db_id = row["id"]
            local_to_db[ent.get("id", "")] = db_id

            # Link entity → session
            await conn.execute(
                """
                INSERT INTO kg_session_entities (session_id, entity_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
                """,
                session_id, db_id,
            )

        # Store directed edges
        for rel in relationships:
            src_db = local_to_db.get(rel.get("source_id", ""))
            tgt_db = local_to_db.get(rel.get("target_id", ""))
            if not src_db or not tgt_db or src_db == tgt_db:
                continue
            await conn.execute(
                """
                INSERT INTO kg_edges (id, session_id, source_entity_id, target_entity_id, label, weight)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING
                """,
                str(uuid.uuid4()), session_id, src_db, tgt_db,
                rel.get("label") or "related",
                int(rel.get("weight") or 1),
            )


async def get_related_sessions_db(
    session_id: str,
    user_id: str,
    min_shared: int = 1,
    limit: int = 5,
) -> list[dict]:
    """Return completed sessions that share ≥ min_shared entities with session_id.

    Each result includes:
      id, topic, created_at, shared_count, shared_entities (list of names)
    """
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    s.id,
                    s.topic,
                    s.created_at,
                    COUNT(kse2.entity_id)                        AS shared_count,
                    ARRAY_AGG(ke.name ORDER BY ke.name)          AS shared_entities
                FROM sessions s
                JOIN kg_session_entities kse2 ON kse2.session_id = s.id
                JOIN kg_entities ke            ON ke.id = kse2.entity_id
                WHERE kse2.entity_id IN (
                    SELECT entity_id
                    FROM kg_session_entities
                    WHERE session_id = $1
                )
                  AND s.id      != $1
                  AND s.user_id  = $2
                  AND s.status   = 'completed'
                GROUP BY s.id, s.topic, s.created_at
                HAVING COUNT(kse2.entity_id) >= $3
                ORDER BY shared_count DESC, s.created_at DESC
                LIMIT $4
                """,
                session_id, user_id, min_shared, limit,
            )
        results = []
        for r in rows:
            d = dict(r)
            d["created_at"]      = d["created_at"].isoformat()
            d["shared_count"]    = int(d["shared_count"])
            d["shared_entities"] = list(d["shared_entities"] or [])[:6]  # cap display
            results.append(d)
        return results
    except Exception as e:
        print(f"Failed to get related sessions: {e}")
        return []


async def get_top_entities_db(
    user_id: str,
    limit: int = 20,
    days: int = 30,
) -> list[dict]:
    """Return the most-researched entities for a user in the last *days* days."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    ke.name,
                    ke.type,
                    COUNT(DISTINCT kse.session_id) AS session_count
                FROM kg_entities ke
                JOIN kg_session_entities kse ON kse.entity_id = ke.id
                JOIN sessions s              ON s.id = kse.session_id
                WHERE ke.user_id = $1
                  AND s.created_at > NOW() - ($2 || ' days')::INTERVAL
                GROUP BY ke.id, ke.name, ke.type
                ORDER BY session_count DESC
                LIMIT $3
                """,
                user_id, str(days), limit,
            )
        return [dict(r) for r in rows]
    except Exception as e:
        print(f"Failed to get top entities: {e}")
        return []


# ---------------------------------------------------------------------------
# Chat messages (per-session Q&A grounded in report)
# ---------------------------------------------------------------------------

async def save_chat_message(session_id: str, role: str, content: str) -> dict:
    """Persist a chat message. Returns the saved row."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        msg_id = f"msg_{secrets.token_hex(8)}"
        row = await conn.fetchrow(
            """INSERT INTO chat_messages (id, session_id, role, content)
               VALUES ($1, $2, $3, $4) RETURNING *""",
            msg_id, session_id, role, content,
        )
        d = dict(row)
        d["created_at"] = d["created_at"].isoformat()
        return d


async def get_chat_history(session_id: str, limit: int = 30) -> list[dict]:
    """Return chat messages for a session, oldest-first."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT id, session_id, role, content, created_at
                   FROM chat_messages
                   WHERE session_id = $1
                   ORDER BY created_at ASC
                   LIMIT $2""",
                session_id, limit,
            )
        result = []
        for r in rows:
            d = dict(r)
            d["created_at"] = d["created_at"].isoformat()
            result.append(d)
        return result
    except Exception as e:
        print(f"Failed to get chat history: {e}")
        return []
