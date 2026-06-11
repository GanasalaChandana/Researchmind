"""Tests for the trending topics and research input-validation endpoints."""
from conftest import register


# ── GET /research/trending ───────────────────────────────────────────────────

def test_trending_returns_list(client):
    r = client.get("/research/trending")
    assert r.status_code == 200
    body = r.json()
    assert "trending" in body
    assert isinstance(body["trending"], list)


def test_trending_empty_when_no_sessions(client):
    r = client.get("/research/trending")
    assert r.json()["trending"] == []


def test_trending_rejects_days_too_high(client):
    r = client.get("/research/trending?days=999")
    assert r.status_code == 422


def test_trending_rejects_days_zero(client):
    r = client.get("/research/trending?days=0")
    assert r.status_code == 422


def test_trending_rejects_limit_too_high(client):
    r = client.get("/research/trending?limit=999")
    assert r.status_code == 422


def test_trending_custom_params_accepted(client):
    r = client.get("/research/trending?days=30&limit=5")
    assert r.status_code == 200


# ── GET /health ──────────────────────────────────────────────────────────────

def test_health_no_db(client):
    """Without DATABASE_URL the health check should report ok (in-memory mode)."""
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["checks"]["db_configured"] is False


# ── ResearchRequest validation ───────────────────────────────────────────────

def test_research_start_strips_topic_whitespace(client):
    r = client.post("/research/start", json={"topic": "  AI ethics  ", "depth": 3})
    assert r.status_code == 200


def test_research_start_missing_topic(client):
    r = client.post("/research/start", json={"depth": 3})
    assert r.status_code == 422


def test_research_start_depth_boundary(client):
    assert client.post("/research/start", json={"topic": "t", "depth": 1}).status_code == 200
    assert client.post("/research/start", json={"topic": "t", "depth": 10}).status_code == 200
    assert client.post("/research/start", json={"topic": "t", "depth": 11}).status_code == 422
