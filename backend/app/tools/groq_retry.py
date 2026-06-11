"""Shared Groq call wrapper with exponential-backoff retry on rate-limit errors.

Usage:
    from ..tools.groq_retry import groq_with_retry
    response = groq_with_retry(client, model=..., messages=..., max_tokens=...)
"""
import time
import logging

logger = logging.getLogger(__name__)

_RATE_LIMIT_SIGNALS = ("rate_limit", "429", "too many requests", "ratelimit")


def groq_with_retry(client, max_retries: int = 3, **kwargs):
    """Call client.chat.completions.create with exponential backoff on 429s.

    Retries up to max_retries times. Waits 2s, then 4s before each retry.
    Any non-rate-limit exception is re-raised immediately.
    """
    for attempt in range(max_retries):
        try:
            return client.chat.completions.create(**kwargs)
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
            raise
