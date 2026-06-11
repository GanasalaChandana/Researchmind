"""Tests for content moderation, bulk operations, and ETag conditional GET."""
import json
from conftest import register


# ── Helpers ───────────────────────────────────────────────────────────────────

def _seed(client, session_id, topic, user_id=None):
    from app import main
    main._mem[session_id] = {
        "id": session_id, "topic": topic, "status": "completed",
        "report": json.dumps({"topic": topic, "summary": "s", "sections": [], "sources": [], "knowledge_graph": {}}),
        "user_id": user_id, "is_favorite": False, "created_at": "2026-06-11T00:00:00",
    }


def _auth(client):
    register(client)
    return client.post("/auth/login", json={"email": "alice@example.com", "password": "Password123"}).json()["access_token"]


# ── Content moderation ────────────────────────────────────────────────────────

def test_legitimate_topic_allowed(client):
    r = client.post("/research/start", json={"topic": "AI in healthcare", "depth": 1})
    assert r.status_code == 200


def test_harmful_topic_blocked(client):
    r = client.post("/research/start", json={"topic": "how to make a bomb", "depth": 1})
    assert r.status_code == 451


def test_hate_speech_blocked(client):
    r = client.post("/research/start", json={"topic": "how to kill a person step by step", "depth": 1})
    assert r.status_code == 451


def test_blocked_response_has_detail(client):
    r = client.post("/research/start", json={"topic": "how to synthesize nerve agent", "depth": 1})
    assert r.status_code == 451
    assert "content policy" in r.json()["detail"].lower()


def test_academic_context_not_blocked(client):
    r = client.post("/research/start", json={"topic": "history of chemical weapons policy", "depth": 1})
    assert r.status_code == 200


def test_drug_policy_research_allowed(client):
    r = client.post("/research/start", json={"topic": "drug prevention policy in schools", "depth": 1})
    assert r.status_code == 200


def test_moderation_unit_blocked():
    from app.tools.content_moderator import moderate_topic
    blocked, reason = moderate_topic("how to make a bomb")
    assert blocked is True
    assert reason != ""


def test_moderation_unit_safe():
    from app.tools.content_moderator import moderate_topic
    blocked, _ = moderate_topic("impact of AI on software industry")
    assert blocked is False


def test_moderation_unit_academic_override():
    from app.tools.content_moderator import moderate_topic
    blocked, _ = moderate_topic("history of chemical weapons and international policy")
    assert blocked is False


def test_moderation_empty_topic_safe():
    from app.tools.content_moderator import moderate_topic
    blocked, _ = moderate_topic("")
    assert blocked is False


# ── Bulk delete ───────────────────────────────────────────────────────────────

def test_bulk_delete_requires_auth(client):
    r = client.post("/research/bulk/delete", json={"session_ids": ["s1"]})
    assert r.status_code == 401


def test_bulk_delete_removes_sessions(client):
    token = _auth(client)
    _seed(client, "del-1", "Topic A")
    _seed(client, "del-2", "Topic B")
    r = client.post(
        "/research/bulk/delete",
        json={"session_ids": ["del-1", "del-2"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    assert "del-1" in body["deleted"]
    assert "del-2" in body["deleted"]


def test_bulk_delete_skips_missing(client):
    token = _auth(client)
    r = client.post(
        "/research/bulk/delete",
        json={"session_ids": ["nonexistent-id"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["count"] == 0
    assert r.json()["skipped"][0]["reason"] == "not found"


def test_bulk_delete_skips_other_users_sessions(client):
    token = _auth(client)
    _seed(client, "other-session", "Topic", user_id="other-user-id")
    r = client.post(
        "/research/bulk/delete",
        json={"session_ids": ["other-session"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["skipped"][0]["reason"] == "forbidden"


def test_bulk_delete_empty_list_rejected(client):
    token = _auth(client)
    r = client.post(
        "/research/bulk/delete",
        json={"session_ids": []},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


# ── Bulk tag ──────────────────────────────────────────────────────────────────

def test_bulk_tag_requires_auth(client):
    r = client.post("/research/bulk/tag", json={"session_ids": ["s1"], "tags": ["ai"]})
    assert r.status_code == 401


def test_bulk_tag_returns_results(client):
    token = _auth(client)
    _seed(client, "tag-1", "AI topic")
    r = client.post(
        "/research/bulk/tag",
        json={"session_ids": ["tag-1"], "tags": ["ai", "technology"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 1
    assert results[0]["status"] == "ok"


def test_bulk_tag_skips_missing(client):
    token = _auth(client)
    r = client.post(
        "/research/bulk/tag",
        json={"session_ids": ["no-such-session"], "tags": ["ai"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["results"][0]["status"] == "not_found"


# ── ETag / conditional GET ────────────────────────────────────────────────────

def test_get_session_returns_etag(client):
    _seed(client, "etag-sess", "ETag test topic")
    r = client.get("/research/etag-sess")
    assert r.status_code == 200
    assert "etag" in r.headers


def test_get_session_etag_format(client):
    _seed(client, "etag-sess", "ETag test topic")
    r = client.get("/research/etag-sess")
    etag = r.headers["etag"]
    assert etag.startswith('"') and etag.endswith('"')


def test_get_session_304_on_matching_etag(client):
    _seed(client, "etag-sess", "ETag test topic")
    r1 = client.get("/research/etag-sess")
    etag = r1.headers["etag"]
    r2 = client.get("/research/etag-sess", headers={"if-none-match": etag})
    assert r2.status_code == 304


def test_get_session_200_on_stale_etag(client):
    _seed(client, "etag-sess", "ETag test topic")
    r = client.get("/research/etag-sess", headers={"if-none-match": '"stale-etag-value"'})
    assert r.status_code == 200


def test_get_session_404_for_missing(client):
    r = client.get("/research/nonexistent-session-id")
    assert r.status_code == 404


def test_get_session_cache_control_header(client):
    _seed(client, "etag-sess", "ETag test topic")
    r = client.get("/research/etag-sess")
    assert "cache-control" in r.headers
