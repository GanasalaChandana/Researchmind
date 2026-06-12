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
    user_id: str = "",
) -> None:
    """Raise HTTP 429 if more than `max_attempts` occurred within `window_seconds`.

    When `user_id` is provided the limit is keyed by user (not IP), so it applies
    consistently regardless of which IP the user connects from and prevents shared-IP
    accounts from consuming each other's quota.

    On success, attaches X-RateLimit-* headers to the request state so the
    response middleware can forward them to the client.
    """
    now = time.time()
    # Authenticated requests: key by user_id so the limit follows the account,
    # not the network. Unauthenticated: fall back to IP.
    if user_id:
        key = f"{bucket}:user:{user_id}:{extra_key}"
    else:
        ip = _client_ip(request)
        key = f"{bucket}:ip:{ip}:{extra_key}"
    dq = _hits[key]

    # Drop timestamps outside the window
    cutoff = now - window_seconds
    while dq and dq[0] < cutoff:
        dq.popleft()

    remaining = max_attempts - len(dq)
    reset_ts = int(dq[0] + window_seconds) + 1 if dq else int(now + window_seconds)

    if remaining <= 0:
        retry_after = int(window_seconds - (now - dq[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts. Try again in {retry_after} seconds.",
            headers={
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(max_attempts),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(reset_ts),
            },
        )

    dq.append(now)
    remaining -= 1  # account for this request

    # Stash on request.state so the middleware can add them to the response
    request.state.rate_limit_headers = {
        "X-RateLimit-Limit": str(max_attempts),
        "X-RateLimit-Remaining": str(remaining),
        "X-RateLimit-Reset": str(reset_ts),
    }

    # Opportunistic cleanup to bound memory: drop empty buckets occasionally
    if len(_hits) > 10000:
        for k in list(_hits.keys()):
            if not _hits[k]:
                del _hits[k]


def clear_rate_limit(
    request: Request, *, bucket: str, extra_key: str = "", user_id: str = ""
) -> None:
    """Reset a bucket (e.g. after a successful login) so good users aren't penalised."""
    if user_id:
        _hits.pop(f"{bucket}:user:{user_id}:{extra_key}", None)
    else:
        ip = _client_ip(request)
        _hits.pop(f"{bucket}:ip:{ip}:{extra_key}", None)
