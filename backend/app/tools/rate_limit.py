"""Lightweight in-memory sliding-window rate limiter.

Keyed by an arbitrary string (typically client IP, or IP+email for login).
Suitable for single/low-replica deployments. For multi-region horizontal scaling
you'd back this with Redis, but this is a solid brute-force deterrent as-is.
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

# key -> deque[timestamps]
_hits: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    """Best-effort client IP, honouring common proxy headers (Railway/Vercel)."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(
    request: Request,
    *,
    bucket: str,
    max_attempts: int,
    window_seconds: int,
    extra_key: str = "",
) -> None:
    """Raise HTTP 429 if more than `max_attempts` occurred within `window_seconds`.

    `bucket` namespaces the limit (e.g. "login"); `extra_key` lets you scope it
    further (e.g. the target email) so one attacker can't lock out everyone.
    """
    now = time.time()
    ip = _client_ip(request)
    key = f"{bucket}:{ip}:{extra_key}"
    dq = _hits[key]

    # Drop timestamps outside the window
    cutoff = now - window_seconds
    while dq and dq[0] < cutoff:
        dq.popleft()

    if len(dq) >= max_attempts:
        retry_after = int(window_seconds - (now - dq[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    dq.append(now)

    # Opportunistic cleanup to bound memory: drop empty buckets occasionally
    if len(_hits) > 10000:
        for k in list(_hits.keys()):
            if not _hits[k]:
                del _hits[k]


def clear_rate_limit(request: Request, *, bucket: str, extra_key: str = "") -> None:
    """Reset a bucket (e.g. after a successful login) so good users aren't penalised."""
    ip = _client_ip(request)
    _hits.pop(f"{bucket}:{ip}:{extra_key}", None)
