"""Tests for webhook HMAC signing and signature verification."""
import hmac
import hashlib
import time

from app.tools.webhooks import _sign_payload, verify_webhook_signature, _SERVER_SIGNING_SECRET


# ── Signature generation ──────────────────────────────────────────────────────

def test_sign_payload_is_deterministic():
    sig1 = _sign_payload("body", "secret", "1234567890")
    sig2 = _sign_payload("body", "secret", "1234567890")
    assert sig1 == sig2


def test_sign_payload_differs_with_different_secret():
    s1 = _sign_payload("body", "secret1", "123")
    s2 = _sign_payload("body", "secret2", "123")
    assert s1 != s2


def test_sign_payload_differs_with_different_timestamp():
    s1 = _sign_payload("body", "secret", "111")
    s2 = _sign_payload("body", "secret", "222")
    assert s1 != s2


def test_sign_payload_differs_with_different_body():
    s1 = _sign_payload("body1", "secret", "123")
    s2 = _sign_payload("body2", "secret", "123")
    assert s1 != s2


def test_sign_payload_returns_hex_string():
    sig = _sign_payload("body", "secret", "123")
    assert all(c in "0123456789abcdef" for c in sig)
    assert len(sig) == 64  # SHA-256 hex


# ── Signature verification ────────────────────────────────────────────────────

def test_verify_valid_signature():
    ts = str(int(time.time()))
    body = '{"event":"completed"}'
    secret = "my-webhook-secret"
    sig = _sign_payload(body, secret, ts)
    assert verify_webhook_signature(body, sig, secret, ts) is True


def test_verify_rejects_wrong_secret():
    ts = str(int(time.time()))
    body = '{"event":"completed"}'
    sig = _sign_payload(body, "real-secret", ts)
    assert verify_webhook_signature(body, sig, "wrong-secret", ts) is False


def test_verify_rejects_tampered_body():
    ts = str(int(time.time()))
    sig = _sign_payload('{"event":"completed"}', "secret", ts)
    assert verify_webhook_signature('{"event":"hacked"}', sig, "secret", ts) is False


def test_verify_rejects_replay_attack():
    old_ts = str(int(time.time()) - 400)  # 400 seconds ago > 300s window
    body = '{"event":"completed"}'
    sig = _sign_payload(body, "secret", old_ts)
    assert verify_webhook_signature(body, sig, "secret", old_ts, max_age_seconds=300) is False


def test_verify_accepts_recent_timestamp():
    ts = str(int(time.time()) - 60)  # 60s ago, within window
    body = '{"event":"completed"}'
    sig = _sign_payload(body, "secret", ts)
    assert verify_webhook_signature(body, sig, "secret", ts) is True


# ── Server signing secret ─────────────────────────────────────────────────────

def test_server_signing_secret_is_set():
    assert isinstance(_SERVER_SIGNING_SECRET, str)
    assert len(_SERVER_SIGNING_SECRET) == 64  # 32 bytes hex


def test_server_signing_secret_is_stable():
    """Same import, same secret — not regenerated each call."""
    from app.tools.webhooks import _SERVER_SIGNING_SECRET as s2
    assert _SERVER_SIGNING_SECRET == s2
