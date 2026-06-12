"""Redis-backed async cache with graceful no-op fallback.

Set REDIS_URL (e.g. redis://localhost:6379/0, a Railway internal URL, or an
Upstash redis:// URL) to enable caching.  When REDIS_URL is absent every call
is a cache miss / no-op — the app behaves exactly as before.

Key schema
----------
session:{session_id}         TTL 300s   single completed session row
sessions:user:{user_id}      TTL  30s   paginated session list for a user
research_cache:{topic_norm}  TTL 86400s normalized-topic report cache
"""
import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

_client = None
_initialized = False


async def _get_client():
    global _client, _initialized
    if _initialized:
        return _client
    _initialized = True
    url = os.environ.get("REDIS_URL", "")
    if not url:
        return None
    try:
        import redis.asyncio as aioredis  # type: ignore
        _client = aioredis.from_url(url, decode_responses=True)
        await _client.ping()
        logger.info("Redis connected (%s)", url.split("@")[-1] if "@" in url else url)
    except Exception as exc:
        logger.warning("Redis unavailable — caching disabled: %s", exc)
        _client = None
    return _client


async def get(key: str) -> Optional[Any]:
    client = await _get_client()
    if client is None:
        return None
    try:
        raw = await client.get(key)
        return json.loads(raw) if raw is not None else None
    except Exception as exc:
        logger.debug("cache GET %s failed: %s", key, exc)
        return None


async def set(key: str, value: Any, ttl: int = 300) -> None:
    client = await _get_client()
    if client is None:
        return
    try:
        await client.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception as exc:
        logger.debug("cache SET %s failed: %s", key, exc)


async def delete(key: str) -> None:
    client = await _get_client()
    if client is None:
        return
    try:
        await client.delete(key)
    except Exception as exc:
        logger.debug("cache DEL %s failed: %s", key, exc)


async def delete_pattern(pattern: str) -> None:
    """Delete all keys matching a glob pattern (use sparingly — O(N) scan)."""
    client = await _get_client()
    if client is None:
        return
    try:
        keys = await client.keys(pattern)
        if keys:
            await client.delete(*keys)
    except Exception as exc:
        logger.debug("cache DEL pattern %s failed: %s", pattern, exc)


# ── Typed helpers ─────────────────────────────────────────────────────────────

def session_key(session_id: str) -> str:
    return f"session:{session_id}"

def session_list_key(user_id: str | None) -> str:
    return f"sessions:user:{user_id or 'anon'}"

def research_cache_key(topic_normalized: str) -> str:
    return f"research_cache:{topic_normalized}"
