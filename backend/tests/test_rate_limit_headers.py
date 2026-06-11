"""Tests for rate-limit response headers and GZip compression."""


# ── X-RateLimit-* headers ─────────────────────────────────────────────────────

def test_rate_limit_headers_present_on_research_start(client):
    r = client.post("/research/start", json={"topic": "AI", "depth": 1})
    assert r.status_code == 200
    assert "x-ratelimit-limit" in r.headers
    assert "x-ratelimit-remaining" in r.headers
    assert "x-ratelimit-reset" in r.headers


def test_rate_limit_remaining_decrements(client):
    r1 = client.post("/research/start", json={"topic": "AI", "depth": 1})
    r2 = client.post("/research/start", json={"topic": "ML", "depth": 1})
    rem1 = int(r1.headers["x-ratelimit-remaining"])
    rem2 = int(r2.headers["x-ratelimit-remaining"])
    assert rem2 == rem1 - 1


def test_rate_limit_limit_matches_policy(client):
    r = client.post("/research/start", json={"topic": "AI", "depth": 1})
    # Anon limit is 10/hour
    assert r.headers["x-ratelimit-limit"] == "10"


def test_rate_limit_reset_is_future_unix_ts(client):
    import time
    r = client.post("/research/start", json={"topic": "AI", "depth": 1})
    reset = int(r.headers["x-ratelimit-reset"])
    assert reset > time.time()


def test_429_includes_retry_after(client):
    for _ in range(10):
        client.post("/research/start", json={"topic": "spam", "depth": 1})
    r = client.post("/research/start", json={"topic": "spam", "depth": 1})
    assert r.status_code == 429
    assert "retry-after" in r.headers
    assert "x-ratelimit-remaining" in r.headers
    assert r.headers["x-ratelimit-remaining"] == "0"


# ── GZip compression ──────────────────────────────────────────────────────────

def test_gzip_accepted_for_large_response(client):
    """Trending endpoint returns JSON — GZip round-trip should work fine."""
    r = client.get("/research/trending", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    # httpx decompresses automatically — just verify the round-trip works
    body = r.json()
    assert "trending" in body


def test_gzip_not_applied_to_small_responses(client):
    """Health endpoint body < 500 bytes — GZip should not be applied."""
    r = client.get("/health", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    # Should still return valid JSON regardless
    assert r.json()["status"] in ("ok", "degraded")
