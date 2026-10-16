"""Async Groq call wrapper: exponential-backoff retry on 429s + circuit breaker.

The Groq SDK client used here is synchronous, so the blocking HTTP call runs in a
worker thread (asyncio.to_thread) and backoff uses asyncio.sleep. This keeps the
event loop free so one slow or rate-limited request can't stall every other user
and live SSE stream.

Usage:
    from ..tools.groq_retry import groq_with_retry
    response = await groq_with_retry(client, model=..., messages=..., max_tokens=...)
"""
import asyncio
import logging

from .circuit_breaker import groq_breaker

logger = logging.getLogger(__name__)

_RATE_LIMIT_SIGNALS = ("rate_limit", "429", "too many requests", "ratelimit")


async def groq_with_retry(client, max_retries: int = 3, **kwargs):
    """Call client.chat.completions.create with exponential backoff on 429s.

    Retries up to max_retries times, waiting 2s then 4s between attempts. Any
    non-rate-limit exception is re-raised immediately. The whole call (including
    its retries) counts as one success/failure for the circuit breaker, which
    opens after 5 consecutive failures and recovers after 60s; while open this
    raises CircuitBreakerOpen without contacting Groq.
    """
    async with groq_breaker:
        for attempt in range(max_retries):
            try:
                return await asyncio.to_thread(client.chat.completions.create, **kwargs)
            except Exception as exc:
                msg = str(exc).lower()
                is_rate_limit = any(sig in msg for sig in _RATE_LIMIT_SIGNALS)
                if is_rate_limit and attempt < max_retries - 1:
                    wait = 2 ** (attempt + 1)
                    logger.warning(
                        "Groq rate limit hit (attempt %d/%d), retrying in %ds",
                        attempt + 1, max_retries, wait,
                    )
                    await asyncio.sleep(wait)
                    continue
                raise
