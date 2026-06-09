"""Webhook delivery — in-memory per-session (public API) + DB-backed user-level."""
import asyncio
import json
import hmac
import hashlib
import time
import secrets
from datetime import datetime, timezone
from typing import Optional
import httpx

# In-memory per-session registry (backward compat with public API)
_webhooks: dict[str, list[dict]] = {}

MAX_RETRIES = 3
RETRY_DELAYS = [5, 30, 120]  # seconds between retry attempts


def _sign_payload(payload: str, secret: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


# ─── In-memory per-session API (public API backward compat) ──────────────────

async def register_webhook(
    session_id: str,
    url: str,
    events: list[str],
    secret: Optional[str] = None,
) -> dict:
    webhook_id = f"wh_{secrets.token_hex(6)}"
    webhook = {
        "id": webhook_id,
        "url": url,
        "events": events,
        "secret": secret,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "delivery_count": 0,
        "last_delivery": None,
        "last_status": None,
    }
    _webhooks.setdefault(session_id, []).append(webhook)
    return {k: v for k, v in webhook.items() if k != "secret"}


async def list_webhooks(session_id: str) -> list[dict]:
    return [
        {k: v for k, v in wh.items() if k != "secret"}
        for wh in _webhooks.get(session_id, [])
    ]


async def delete_webhook(session_id: str, webhook_id: str) -> bool:
    if session_id not in _webhooks:
        return False
    original = _webhooks[session_id]
    _webhooks[session_id] = [w for w in original if w["id"] != webhook_id]
    return len(_webhooks[session_id]) < len(original)


# ─── HTTP delivery helpers ────────────────────────────────────────────────────

async def _post_once(
    webhook: dict,
    body: str,
) -> tuple[bool, Optional[int], Optional[str], int]:
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "ResearchMind-Webhooks/1.0",
    }
    if webhook.get("secret"):
        sig = _sign_payload(body, webhook["secret"])
        headers["X-ResearchMind-Signature"] = f"sha256={sig}"

    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(webhook["url"], content=body, headers=headers)
        dur = int((time.monotonic() - t0) * 1000)
        ok = 200 <= resp.status_code < 300
        return ok, resp.status_code, (None if ok else f"HTTP {resp.status_code}"), dur
    except Exception as exc:
        dur = int((time.monotonic() - t0) * 1000)
        return False, None, str(exc)[:200], dur


async def _deliver_in_memory(webhook: dict, payload: dict, attempt: int = 0):
    body = json.dumps(payload)
    ok, status_code, err, _ = await _post_once(webhook, body)
    if ok:
        webhook["delivery_count"] = webhook.get("delivery_count", 0) + 1
        webhook["last_delivery"] = datetime.now(timezone.utc).isoformat()
        webhook["last_status"] = status_code
        return
    if attempt < MAX_RETRIES - 1:
        await asyncio.sleep(RETRY_DELAYS[attempt])
        await _deliver_in_memory(webhook, payload, attempt + 1)
    else:
        webhook["last_status"] = f"error: {err}"


async def _deliver_db(webhook: dict, payload: dict, session_id: str):
    """Deliver a DB-backed webhook with retry and delivery logging."""
    from ..database import log_webhook_delivery, update_webhook_stats

    body = json.dumps(payload)
    for attempt in range(1, MAX_RETRIES + 1):
        ok, status_code, err, dur = await _post_once(webhook, body)
        try:
            await log_webhook_delivery(
                webhook_id=webhook["id"],
                session_id=session_id,
                event=payload["event"],
                status_code=status_code,
                success=ok,
                attempt=attempt,
                error=err,
                duration_ms=dur,
            )
            await update_webhook_stats(webhook["id"], ok)
        except Exception:
            pass
        if ok:
            return
        if attempt < MAX_RETRIES:
            await asyncio.sleep(RETRY_DELAYS[attempt - 1])


# ─── Public fire function ─────────────────────────────────────────────────────

async def fire_webhook_event(
    session_id: str,
    event: str,
    data: dict,
    user_id: Optional[str] = None,
):
    """Fire webhooks for a session event. Called via asyncio.create_task()."""
    payload = {
        "event": event,
        "session_id": session_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "delivery_id": f"del_{secrets.token_hex(8)}",
        "data": data,
    }

    # In-memory per-session webhooks (public API)
    in_mem = [
        _deliver_in_memory(wh, payload)
        for wh in _webhooks.get(session_id, [])
        if event in wh.get("events", [])
    ]

    # DB-backed user-level webhooks
    db_tasks = []
    if user_id:
        try:
            from ..database import get_user_webhooks_for_event
            db_webhooks = await get_user_webhooks_for_event(user_id, event)
            db_tasks = [_deliver_db(wh, payload, session_id) for wh in db_webhooks]
        except Exception:
            pass

    all_tasks = in_mem + db_tasks
    if all_tasks:
        await asyncio.gather(*all_tasks, return_exceptions=True)
