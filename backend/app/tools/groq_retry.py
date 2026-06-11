"""Shared Groq call wrapper with exponential-backoff retry and circuit breaker.

Usage:
    from ..tools.groq_retry import groq_with_retry
    response = groq_with_retry(client, model=..., messages=..., max_tokens=...)
"""
import asyncio
import time
import logging

logger = logging.getLogger(__name__)

_RATE_LIMIT_SIGNALS = ("rate_limit", "429", "too many requests", "ratelimit")


def groq_with_retry(client, max_retries: int = 3, **kwargs):
    """Call client.chat.completions.create with exponential backoff on 429s.

    Retries up to max_retries times. Waits 2s, then 4s before each retry.
    Any non-rate-limit exception is re-raised immediately.
    Circuit breaker opens after 5 consecutive failures and recovers after 60s.
    """
    from .circuit_breaker import groq_breaker, CircuitBreakerOpen

    # groq_breaker is async; run its enter/exit in sync context via a helper
    loop = None
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        pass

    def _cb_enter():
        if loop and loop.is_running():
            # We're inside an async context — can't await here, so check state directly
            from .circuit_breaker import _State
            if groq_breaker._state == _State.OPEN:
                import time as _t
                elapsed = _t.monotonic() - groq_breaker._opened_at
                if elapsed < groq_breaker._recovery_timeout:
                    raise CircuitBreakerOpen(
                        f"groq circuit is OPEN — retry in {groq_breaker._recovery_timeout - elapsed:.0f}s"
                    )

    def _cb_record_failure():
        groq_breaker._failures += 1
        from .circuit_breaker import _State
        if groq_breaker._failures >= groq_breaker._failure_threshold:
            groq_breaker._opened_at = time.monotonic()
            groq_breaker._state = _State.OPEN
            groq_breaker._failures = 0
            logger.warning("CircuitBreaker[groq]: CLOSED → OPEN")

    def _cb_record_success():
        from .circuit_breaker import _State
        if groq_breaker._failures > 0:
            groq_breaker._failures = max(0, groq_breaker._failures - 1)
        if groq_breaker._state == _State.HALF_OPEN:
            groq_breaker._successes += 1
            if groq_breaker._successes >= groq_breaker._success_threshold:
                groq_breaker._state = _State.CLOSED
                groq_breaker._failures = 0
                logger.warning("CircuitBreaker[groq]: HALF_OPEN → CLOSED")

    _cb_enter()

    for attempt in range(max_retries):
        try:
            result = client.chat.completions.create(**kwargs)
            _cb_record_success()
            return result
        except Exception as exc:
            msg = str(exc).lower()
            is_rate_limit = any(sig in msg for sig in _RATE_LIMIT_SIGNALS)
            if is_rate_limit and attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                logger.warning(
                    "Groq rate limit hit (attempt %d/%d), retrying in %ds",
                    attempt + 1, max_retries, wait,
                )
                time.sleep(wait)
                continue
            _cb_record_failure()
            raise
