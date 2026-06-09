"""API Key management — DB-backed (persistent across deploys).

Rate limiting stays in-memory (sliding window, per-process).
Keys and usage stats are stored in PostgreSQL via database.py helpers.
"""
import time
from typing import Optional
from collections import defaultdict

from ..database import (
    validate_api_key_db,
    update_key_usage_db,
    list_api_keys_db,
    create_api_key_db,
    delete_api_key_db,
)

# ── In-memory sliding-window rate limiter ────────────────────────────────────
# Tracks request timestamps per raw key (resets on process restart, acceptable).
_rate_windows: dict[str, list[float]] = defaultdict(list)
MAX_REQUESTS_PER_HOUR = 100


async def validate_api_key(raw_key: str) -> bool:
    """Return True if the key exists and is active in the database."""
    user_id = await validate_api_key_db(raw_key)
    return user_id is not None


async def check_rate_limit(raw_key: str) -> bool:
    """Sliding-window rate limit: MAX_REQUESTS_PER_HOUR per key per hour.

    Returns True if the request is allowed, False if the limit is exceeded.
    Side-effect: records the current timestamp on every allowed request.
    """
    now  = time.time()
    cutoff = now - 3600  # 1-hour window

    # Evict timestamps older than the window
    _rate_windows[raw_key] = [t for t in _rate_windows[raw_key] if t > cutoff]

    if len(_rate_windows[raw_key]) >= MAX_REQUESTS_PER_HOUR:
        return False

    _rate_windows[raw_key].append(now)
    return True


async def update_key_usage(raw_key: str) -> None:
    """Persist last_used_at + request_count increment to DB."""
    await update_key_usage_db(raw_key)


async def get_key_info(raw_key: str) -> Optional[dict]:
    """Get display info for a key (no hash exposed).
    Returns None if the key is invalid.
    """
    user_id = await validate_api_key_db(raw_key)
    if not user_id:
        return None
    # Return rate-limit window usage for this process
    now = time.time()
    recent = [t for t in _rate_windows.get(raw_key, []) if t > now - 3600]
    return {
        "requests_this_hour": len(recent),
        "limit_per_hour": MAX_REQUESTS_PER_HOUR,
        "remaining": MAX_REQUESTS_PER_HOUR - len(recent),
    }


# ── Key management helpers (called from management endpoints) ─────────────────

async def create_user_api_key(user_id: str, name: str) -> Optional[dict]:
    """Generate a new DB-backed API key for a user."""
    return await create_api_key_db(user_id, name)


async def list_user_api_keys(user_id: str) -> list[dict]:
    """List all keys for a user (no raw key or hash exposed)."""
    return await list_api_keys_db(user_id)


async def delete_user_api_key(key_id: str, user_id: str) -> bool:
    """Delete a key by ID. Owner-scoped."""
    return await delete_api_key_db(key_id, user_id)
