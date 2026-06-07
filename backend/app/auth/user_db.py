"""User CRUD operations against PostgreSQL (asyncpg)"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from ..database import get_pool

# ── Schema (run once at startup) ─────────────────────────────────────────────

CREATE_USERS_TABLE = """
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    password    TEXT NOT NULL,
    api_key     TEXT UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    is_active   BOOLEAN DEFAULT TRUE
);
"""

CREATE_REFRESH_TABLE = """
CREATE TABLE IF NOT EXISTS refresh_tokens (
    jti         TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
"""

CREATE_RESET_TABLE = """
CREATE TABLE IF NOT EXISTS password_resets (
    token_hash  TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
"""


async def init_user_tables():
    pool = await get_pool()
    if pool is None:
        return
    async with pool.acquire() as conn:
        await conn.execute(CREATE_USERS_TABLE)
        await conn.execute(CREATE_REFRESH_TABLE)
        await conn.execute(CREATE_RESET_TABLE)


# ── User CRUD ─────────────────────────────────────────────────────────────────

async def create_user(email: str, name: str, hashed_password: str) -> Optional[dict]:
    pool = await get_pool()
    if pool is None:
        return _mem_create_user(email, name, hashed_password)

    user_id = str(uuid.uuid4())
    api_key = f"rm_{uuid.uuid4().hex}"
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO users (id, email, name, password, api_key, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, email, name, api_key, created_at
            """,
            user_id, email, name, hashed_password, api_key, datetime.now(timezone.utc),
        )
        return dict(row) if row else None


async def get_user_by_email(email: str) -> Optional[dict]:
    pool = await get_pool()
    if pool is None:
        return _mem_get_by_email(email)

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM users WHERE email = $1 AND is_active = TRUE", email
        )
        return dict(row) if row else None


async def get_user_by_id(user_id: str) -> Optional[dict]:
    pool = await get_pool()
    if pool is None:
        return _mem_get_by_id(user_id)

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM users WHERE id = $1 AND is_active = TRUE", user_id
        )
        return dict(row) if row else None


async def update_user(user_id: str, **fields) -> Optional[dict]:
    pool = await get_pool()
    allowed = {k: v for k, v in fields.items() if k in ("name", "email", "password")}
    if not allowed:
        return await get_user_by_id(user_id)

    if pool is None:
        return _mem_update_user(user_id, **allowed)

    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(allowed))
    values = list(allowed.values())
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE users SET {set_clause}, updated_at = NOW() WHERE id = $1 RETURNING *",
            user_id, *values,
        )
        return dict(row) if row else None


async def get_research_count(user_id: str) -> int:
    """Count research sessions belonging to this user"""
    pool = await get_pool()
    if pool is None:
        return 0
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT COUNT(*) as cnt FROM sessions WHERE user_id = $1", user_id
        )
        return row["cnt"] if row else 0


async def store_refresh_token(jti: str, user_id: str, expires_at: datetime):
    pool = await get_pool()
    if pool is None:
        _refresh_store[jti] = {"user_id": user_id, "expires_at": expires_at}
        return
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES ($1, $2, $3)",
            jti, user_id, expires_at,
        )


async def revoke_refresh_token(jti: str):
    pool = await get_pool()
    _refresh_store.pop(jti, None)
    if pool is None:
        return
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM refresh_tokens WHERE jti = $1", jti)


async def is_refresh_token_valid(jti: str) -> bool:
    pool = await get_pool()
    if pool is None:
        entry = _refresh_store.get(jti)
        return entry is not None and entry["expires_at"] > datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT 1 FROM refresh_tokens WHERE jti = $1 AND expires_at > NOW()", jti
        )
        return row is not None


# ── Password reset tokens ─────────────────────────────────────────────────────

async def store_reset_token(token_hash: str, user_id: str, expires_at: datetime):
    pool = await get_pool()
    if pool is None:
        _reset_store[token_hash] = {"user_id": user_id, "expires_at": expires_at}
        return
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
            token_hash, user_id, expires_at,
        )


async def consume_reset_token(token_hash: str) -> Optional[str]:
    """Return user_id if token is valid+unexpired, then delete it (single-use)."""
    pool = await get_pool()
    if pool is None:
        entry = _reset_store.pop(token_hash, None)
        if entry and entry["expires_at"] > datetime.now(timezone.utc):
            return entry["user_id"]
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT user_id FROM password_resets WHERE token_hash = $1 AND expires_at > NOW()",
            token_hash,
        )
        if not row:
            return None
        await conn.execute("DELETE FROM password_resets WHERE token_hash = $1", token_hash)
        return row["user_id"]


# ── In-memory fallback (when DB unavailable) ─────────────────────────────────
_mem_users: dict[str, dict] = {}
_mem_by_email: dict[str, str] = {}
_refresh_store: dict[str, dict] = {}
_reset_store: dict[str, dict] = {}


def _mem_create_user(email, name, hashed_password):
    uid = str(uuid.uuid4())
    user = {
        "id": uid, "email": email, "name": name,
        "password": hashed_password,
        "api_key": f"rm_{uuid.uuid4().hex}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True,
    }
    _mem_users[uid] = user
    _mem_by_email[email] = uid
    return user


def _mem_get_by_email(email):
    uid = _mem_by_email.get(email)
    return _mem_users.get(uid) if uid else None


def _mem_get_by_id(uid):
    return _mem_users.get(uid)


def _mem_update_user(uid, **fields):
    if uid in _mem_users:
        _mem_users[uid].update(fields)
    return _mem_users.get(uid)
