"""Regression tests for SSRF protection, stream guard and async Groq wrapper."""
import asyncio

import pytest


def _run(coro):
    # Not asyncio.run(): it unsets the thread's current loop, which older tests rely on.
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()

from app.tools.url_safety import is_public_url_literal, is_safe_public_url


@pytest.mark.parametrize("url", [
    "http://localhost/admin",
    "http://127.0.0.1:8000/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://service.internal/",
    "file:///etc/passwd",
    "ftp://example.com/",
    "https://user:pw@example.com/",
    "not a url",
])
def test_blocks_non_public_urls(url):
    assert is_public_url_literal(url) is False
    assert _run(is_safe_public_url(url)) is False


def test_allows_public_literal_and_hostname_literal_check():
    assert is_public_url_literal("https://example.com/hook") is True
    assert is_public_url_literal("https://8.8.8.8/") is True


def test_hostname_resolving_to_private_ip_is_blocked(monkeypatch):
    import socket
    monkeypatch.setattr(socket, "getaddrinfo",
                        lambda host, port, *a, **k: [(2, 1, 6, "", ("10.1.2.3", port))])
    assert _run(is_safe_public_url("https://evil.example.com/")) is False


def test_hostname_resolving_to_public_ip_is_allowed(monkeypatch):
    import socket
    monkeypatch.setattr(socket, "getaddrinfo",
                        lambda host, port, *a, **k: [(2, 1, 6, "", ("93.184.216.34", port))])
    assert _run(is_safe_public_url("https://example.com/")) is True


def test_read_url_refuses_internal_address():
    from app.tools.url_reader import read_url
    assert _run(read_url("http://169.254.169.254/latest/meta-data/")) == ""


def test_webhook_registration_rejects_private_host(client):
    start = client.post("/research/start", json={"topic": "quantum computing basics"})
    sid = start.json()["session_id"]
    r = client.post(f"/research/{sid}/webhooks", json={"url": "https://127.0.0.1/hook"})
    assert r.status_code == 422


def test_stream_rejects_unknown_session(client):
    r = client.get("/research/does-not-exist/stream", params={"topic": "anything"})
    assert r.status_code == 404


def test_stream_is_rate_limited(client):
    codes = [client.get(f"/research/nope-{i}/stream", params={"topic": "x"}).status_code for i in range(32)]
    assert codes[0] == 404 and codes[-1] == 429


def test_groq_retry_backs_off_without_blocking_and_retries(monkeypatch):
    from app.tools import groq_retry
    from app.tools.circuit_breaker import groq_breaker

    sleeps = []

    async def fake_sleep(s):
        sleeps.append(s)
    monkeypatch.setattr(groq_retry.asyncio, "sleep", fake_sleep)

    calls = {"n": 0}

    class _Completions:
        def create(self, **kw):
            calls["n"] += 1
            if calls["n"] < 3:
                raise Exception("429 rate_limit exceeded")
            return "ok"

    class _Client:
        chat = type("C", (), {"completions": _Completions()})()

    assert _run(groq_retry.groq_with_retry(_Client(), model="m", messages=[])) == "ok"
    assert calls["n"] == 3 and sleeps == [2, 4]
    assert groq_breaker.state == "closed"


def test_groq_retry_honours_open_circuit(monkeypatch):
    from app.tools import groq_retry
    from app.tools.circuit_breaker import CircuitBreaker, CircuitBreakerOpen

    breaker = CircuitBreaker("t", failure_threshold=1, recovery_timeout=60)
    monkeypatch.setattr(groq_retry, "groq_breaker", breaker)

    class _Completions:
        def create(self, **kw):
            raise Exception("boom")

    class _Client:
        chat = type("C", (), {"completions": _Completions()})()

    async def run():
        with pytest.raises(Exception, match="boom"):
            await groq_retry.groq_with_retry(_Client(), model="m", messages=[])
        with pytest.raises(CircuitBreakerOpen):
            await groq_retry.groq_with_retry(_Client(), model="m", messages=[])
    _run(run())


def test_health_is_liveness_only_and_ready_is_strict(client, monkeypatch):
    """A broken DB must not fail /health (platform healthcheck), only /health/ready."""
    from app import main

    async def boom():
        raise RuntimeError("db paused")
    monkeypatch.setenv("DATABASE_URL", "postgresql://x")
    monkeypatch.setattr(main, "get_pool", boom)
    live = client.get("/health")
    assert live.status_code == 200 and live.json()["status"] == "degraded"
    assert client.get("/health/ready").status_code == 503
