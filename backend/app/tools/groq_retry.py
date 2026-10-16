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
import re

from .circuit_breaker import groq_breaker
from .groq_models import adapt_kwargs

logger = logging.getLogger(__name__)

_RATE_LIMIT_SIGNALS = ("rate_limit", "429", "too many requests", "ratelimit")
_TRY_AGAIN = re.compile(r"try again in (?:(\d+)m)?\s*(\d+(?:\.\d+)?)s", re.IGNORECASE)
MAX_BACKOFF_S = 60.0


def retry_delay(exc: Exception, attempt: int) -> float:
    """How long to wait after a 429. Prefer what Groq tells us (Retry-After header or
    'Please try again in 12.5s' in the message); otherwise exponential 2s, 4s, 8s...
    Per-minute token limits only reset after ~a minute, so a fixed 2-4s retry just
    burns the retries and fails."""
    wait = None
    headers = getattr(getattr(exc, "response", None), "headers", None)
    if headers:
        try:
            wait = float(headers.get("retry-after"))
        except (TypeError, ValueError):
            wait = None
    if wait is None:
        m = _TRY_AGAIN.search(str(exc))
        if m:
            wait = int(m.group(1) or 0) * 60 + float(m.group(2))
    if wait is None:
        return min(float(2 ** (attempt + 1)), MAX_BACKOFF_S)
    return min(max(wait + 1.0, 2.0), MAX_BACKOFF_S)  # +1s margin over Groq's hint


async def groq_with_retry(client, max_retries: int = 5, **kwargs):
    """Call client.chat.completions.create with exponential backoff on 429s.

    Retries up to max_retries times, waiting as long as Groq asks (capped at 60s). Any
    non-rate-limit exception is re-raised immediately. The whole call (including
    its retries) counts as one success/failure for the circuit breaker, which
    opens after 5 consecutive failures and recovers after 60s; while open this
    raises CircuitBreakerOpen without contacting Groq.
    """
    kwargs = adapt_kwargs(kwargs)
    async with groq_breaker:
        for attempt in range(max_retries):
            try:
                return await asyncio.to_thread(client.chat.completions.create, **kwargs)
            except Exception as exc:
                msg = str(exc).lower()
                is_rate_limit = any(sig in msg for sig in _RATE_LIMIT_SIGNALS)
                if is_rate_limit and attempt < max_retries - 1:
                    wait = retry_delay(exc, attempt)
                    logger.warning(
                        "Groq rate limit hit (attempt %d/%d), retrying in %.0fs",
                        attempt + 1, max_retries, wait,
                    )
                    await asyncio.sleep(wait)
                    continue
                raise
