"""Webhook delivery system for ResearchMind Public API"""
import asyncio
import json
import hmac
import hashlib
import time
from datetime import datetime, timezone
from typing import Optional
import urllib.request
import urllib.error

# In-memory webhook registry: session_id -> list of webhook configs
_webhooks: dict[str, list[dict]] = {}
# Global registry: api_key -> list of webhook configs (persistent subscriptions)
_global_webhooks: dict[str, list[dict]] = {}

MAX_RETRIES = 3
RETRY_DELAYS = [5, 15, 30]  # seconds between retries


def _sign_payload(payload: str, secret: str) -> str:
    """Create HMAC-SHA256 signature for webhook payload"""
    return hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()


async def register_webhook(
    session_id: str,
    url: str,
    events: list[str],
    secret: Optional[str] = None,
) -> dict:
    """Register a webhook for a specific session

    Args:
        session_id: Research session to watch
        url: URL to POST events to
        events: List of event types ('completed', 'failed', 'progress')
        secret: Optional secret for HMAC signature verification

    Returns:
        Webhook registration dict with id
    """
    webhook_id = f"wh_{int(time.time())}_{session_id[:8]}"
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

    if session_id not in _webhooks:
        _webhooks[session_id] = []
    _webhooks[session_id].append(webhook)

    return {k: v for k, v in webhook.items() if k != "secret"}


async def register_global_webhook(
    api_key: str,
    url: str,
    events: list[str],
    secret: Optional[str] = None,
) -> dict:
    """Register a webhook for ALL future sessions for an API key"""
    webhook_id = f"wh_global_{int(time.time())}"
    webhook = {
        "id": webhook_id,
        "url": url,
        "events": events,
        "secret": secret,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "delivery_count": 0,
    }
    if api_key not in _global_webhooks:
        _global_webhooks[api_key] = []
    _global_webhooks[api_key].append(webhook)

    return {k: v for k, v in webhook.items() if k != "secret"}


async def _deliver_webhook(webhook: dict, payload: dict, attempt: int = 0):
    """Deliver a single webhook with retry logic"""
    body = json.dumps(payload)
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "ResearchMind-Webhooks/1.0",
        "X-ResearchMind-Event": payload.get("event", "unknown"),
        "X-ResearchMind-Delivery": payload.get("delivery_id", ""),
        "X-ResearchMind-Timestamp": str(int(time.time())),
    }

    # Add HMAC signature if secret provided
    if webhook.get("secret"):
        sig = _sign_payload(body, webhook["secret"])
        headers["X-ResearchMind-Signature"] = f"sha256={sig}"

    req = urllib.request.Request(
        webhook["url"],
        data=body.encode(),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            webhook["delivery_count"] = webhook.get("delivery_count", 0) + 1
            webhook["last_delivery"] = datetime.now(timezone.utc).isoformat()
            webhook["last_status"] = resp.status
            return True
    except Exception as e:
        if attempt < MAX_RETRIES - 1:
            delay = RETRY_DELAYS[attempt]
            await asyncio.sleep(delay)
            return await _deliver_webhook(webhook, payload, attempt + 1)
        else:
            webhook["last_status"] = f"error: {str(e)}"
            return False


async def fire_webhook_event(
    session_id: str,
    event: str,
    data: dict,
):
    """Fire a webhook event for a session (non-blocking)

    Args:
        session_id: The research session ID
        event: Event type ('completed', 'failed', 'progress')
        data: Event payload data
    """
    webhooks_for_session = _webhooks.get(session_id, [])
    if not webhooks_for_session:
        return

    payload = {
        "event": event,
        "session_id": session_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "delivery_id": f"{session_id[:8]}_{int(time.time())}",
        "data": data,
    }

    # Fire all matching webhooks concurrently (non-blocking)
    tasks = [
        _deliver_webhook(wh, payload)
        for wh in webhooks_for_session
        if event in wh.get("events", [])
    ]

    if tasks:
        asyncio.gather(*tasks, return_exceptions=True)


async def list_webhooks(session_id: str) -> list[dict]:
    """List all webhooks for a session"""
    return [
        {k: v for k, v in wh.items() if k != "secret"}
        for wh in _webhooks.get(session_id, [])
    ]


async def delete_webhook(session_id: str, webhook_id: str) -> bool:
    """Delete a specific webhook"""
    if session_id not in _webhooks:
        return False
    original = _webhooks[session_id]
    _webhooks[session_id] = [w for w in original if w["id"] != webhook_id]
    return len(_webhooks[session_id]) < len(original)
