"""Tests for the research-session favorites/pinning feature."""
from conftest import register


def _auth_headers(client, email="alice@example.com"):
    token = register(client, email=email).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _start_session(client, headers=None, topic="Test topic"):
    r = client.post("/research/start", json={"topic": topic, "depth": 3}, headers=headers or {})
    assert r.status_code == 200
    return r.json()["session_id"]


def test_favorite_toggle_and_filter(client):
    headers = _auth_headers(client)
    sid = _start_session(client, headers)

    # Not favorited initially
    favs = client.get("/research/sessions/list?favorites=true", headers=headers).json()
    assert all(s["id"] != sid for s in favs)

    # Favorite it
    r = client.post(f"/research/{sid}/favorite", json={"is_favorite": True}, headers=headers)
    assert r.status_code == 200
    assert r.json()["is_favorite"] is True

    # Now shows up in the favorites filter
    favs = client.get("/research/sessions/list?favorites=true", headers=headers).json()
    assert any(s["id"] == sid for s in favs)

    # Unfavorite → gone from favorites
    client.post(f"/research/{sid}/favorite", json={"is_favorite": False}, headers=headers)
    favs = client.get("/research/sessions/list?favorites=true", headers=headers).json()
    assert all(s["id"] != sid for s in favs)


def test_favorite_requires_auth(client):
    sid = _start_session(client)  # anonymous session
    r = client.post(f"/research/{sid}/favorite", json={"is_favorite": True})
    assert r.status_code == 401


def test_cannot_favorite_another_users_session(client):
    a_headers = _auth_headers(client, email="a@example.com")
    sid = _start_session(client, a_headers)

    b_headers = _auth_headers(client, email="b@example.com")
    r = client.post(f"/research/{sid}/favorite", json={"is_favorite": True}, headers=b_headers)
    assert r.status_code == 403


def test_favorite_missing_session_404(client):
    headers = _auth_headers(client)
    r = client.post("/research/does-not-exist/favorite", json={"is_favorite": True}, headers=headers)
    assert r.status_code == 404
