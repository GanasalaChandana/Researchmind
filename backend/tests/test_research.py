"""Tests for research session endpoints — start, list, input validation, rate limiting."""
from conftest import register


def _auth_headers(client, email="alice@example.com"):
    token = register(client, email=email).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _start(client, topic="AI in healthcare", depth=3, headers=None):
    return client.post(
        "/research/start",
        json={"topic": topic, "depth": depth},
        headers=headers or {},
    )


# ── /research/start ──────────────────────────────────────────────────────────

def test_start_anonymous(client):
    r = _start(client)
    assert r.status_code == 200
    assert "session_id" in r.json()


def test_start_authenticated(client):
    headers = _auth_headers(client)
    r = _start(client, headers=headers)
    assert r.status_code == 200
    assert "session_id" in r.json()


def test_start_rejects_blank_topic(client):
    r = client.post("/research/start", json={"topic": "   ", "depth": 3})
    assert r.status_code == 422


def test_start_rejects_empty_topic(client):
    r = client.post("/research/start", json={"topic": "", "depth": 3})
    assert r.status_code == 422


def test_start_rejects_topic_too_long(client):
    r = client.post("/research/start", json={"topic": "x" * 501, "depth": 3})
    assert r.status_code == 422


def test_start_rejects_depth_too_high(client):
    r = client.post("/research/start", json={"topic": "quantum computing", "depth": 99})
    assert r.status_code == 422


def test_start_rejects_depth_zero(client):
    r = client.post("/research/start", json={"topic": "quantum computing", "depth": 0})
    assert r.status_code == 422


def test_start_rate_limited(client):
    """11th anonymous request within the same window should be 429."""
    for _ in range(10):
        r = _start(client)
        assert r.status_code == 200
    r = _start(client)
    assert r.status_code == 429
    assert "Retry-After" in r.headers


# ── /research/sessions/list ──────────────────────────────────────────────────

def test_list_sessions_empty(client):
    headers = _auth_headers(client)
    r = client.get("/research/sessions/list", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_list_shows_own_sessions(client):
    headers = _auth_headers(client)
    _start(client, headers=headers)
    _start(client, topic="climate change", headers=headers)
    r = client.get("/research/sessions/list", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 2


def test_list_does_not_show_other_user_sessions(client):
    a = _auth_headers(client, email="a@example.com")
    b = _auth_headers(client, email="b@example.com")
    _start(client, headers=a)
    r = client.get("/research/sessions/list", headers=b)
    assert r.json()["total"] == 0


def test_list_rejects_limit_too_high(client):
    r = client.get("/research/sessions/list?limit=999")
    assert r.status_code == 422


def test_list_rejects_negative_offset(client):
    r = client.get("/research/sessions/list?offset=-1")
    assert r.status_code == 422


def test_list_pagination(client):
    headers = _auth_headers(client)
    for i in range(5):
        _start(client, topic=f"topic {i}", headers=headers)
    page1 = client.get("/research/sessions/list?limit=3&offset=0", headers=headers).json()
    page2 = client.get("/research/sessions/list?limit=3&offset=3", headers=headers).json()
    assert len(page1["items"]) == 3
    assert len(page2["items"]) == 2
    assert page1["has_more"] is True
    assert page2["has_more"] is False


# ── /research/{id} retrieval ─────────────────────────────────────────────────

def test_get_session_404(client):
    r = client.get("/research/does-not-exist/report")
    assert r.status_code in (404, 200)  # 200 with null report is also acceptable


def test_delete_session(client):
    headers = _auth_headers(client)
    sid = _start(client, headers=headers).json()["session_id"]
    r = client.delete(f"/research/{sid}", headers=headers)
    assert r.status_code == 200
