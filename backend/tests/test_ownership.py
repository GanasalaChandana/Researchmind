"""Ownership checks: a session started while logged in is private to that account;
a session started anonymously stays reachable by its random id."""
import pytest
from conftest import register


def _login(client, email):
    token = register(client, email=email).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def owned(client):
    """Alice's logged-in session, plus Alice's and Bob's auth headers."""
    alice = _login(client, "alice@example.com")
    bob = _login(client, "bob@example.com")
    sid = client.post("/research/start", json={"topic": "owned topic here"}, headers=alice).json()["session_id"]
    return sid, alice, bob


def test_owner_can_read_session_report_and_versions(client, owned):
    sid, alice, _ = owned
    for path in (f"/research/{sid}", f"/research/{sid}/report", f"/research/{sid}/versions"):
        assert client.get(path, headers=alice).status_code == 200, path


def test_no_login_gets_401_on_owned_session(client, owned):
    sid, _, _ = owned
    for path in (f"/research/{sid}", f"/research/{sid}/report", f"/research/{sid}/versions",
                 f"/research/{sid}/webhooks", f"/research/{sid}/shares"):
        assert client.get(path).status_code == 401, path


def test_other_user_gets_404_on_owned_session(client, owned):
    sid, _, bob = owned
    for path in (f"/research/{sid}", f"/research/{sid}/report", f"/research/{sid}/versions",
                 f"/research/{sid}/webhooks", f"/research/{sid}/shares"):
        assert client.get(path, headers=bob).status_code == 404, path


def test_other_user_cannot_delete_retry_share_or_add_webhook(client, owned):
    sid, alice, bob = owned
    assert client.delete(f"/research/{sid}", headers=bob).status_code == 404
    assert client.delete(f"/research/{sid}").status_code == 401
    assert client.post(f"/research/{sid}/retry", headers=bob).status_code == 404
    assert client.post(f"/research/{sid}/share", headers=bob).status_code == 404
    assert client.post(f"/research/{sid}/share").status_code == 401
    hook = {"url": "https://example.com/hook", "events": ["completed"]}
    assert client.post(f"/research/{sid}/webhooks", json=hook, headers=bob).status_code == 404
    assert client.post(f"/research/{sid}/webhooks", json=hook).status_code == 401
    # Alice's session survived all of that.
    assert client.get(f"/research/{sid}", headers=alice).status_code == 200


def test_owner_can_share_retry_and_delete(client, owned):
    sid, alice, _ = owned
    # Share tokens need the database, which tests don't have (500 there); the point is
    # that the owner is not refused.
    assert client.post(f"/research/{sid}/share", headers=alice).status_code not in (401, 403, 404)
    assert client.get(f"/research/{sid}/shares", headers=alice).status_code not in (401, 403, 404)
    retry = client.post(f"/research/{sid}/retry", headers=alice)
    assert retry.status_code == 200
    # The retried session belongs to Alice too (it used to be created ownerless).
    new_id = retry.json()["session_id"]
    assert client.get(f"/research/{new_id}", headers=alice).status_code == 200
    assert client.get(f"/research/{new_id}").status_code == 401
    assert client.delete(f"/research/{sid}", headers=alice).status_code == 200
    assert client.get(f"/research/{sid}", headers=alice).status_code == 404


def test_anonymous_session_stays_reachable_by_id(client):
    sid = client.post("/research/start", json={"topic": "anonymous topic"}).json()["session_id"]
    assert client.get(f"/research/{sid}").status_code == 200
    assert client.get(f"/research/{sid}/report").status_code == 200
    bob = _login(client, "bob@example.com")
    assert client.get(f"/research/{sid}", headers=bob).status_code == 200


def test_unknown_session_is_404(client):
    assert client.get("/research/does-not-exist").status_code == 404
    assert client.delete("/research/does-not-exist").status_code == 404


def test_stream_refuses_to_rerun_a_completed_session(client):
    from app import main
    sid = client.post("/research/start", json={"topic": "finished topic"}).json()["session_id"]
    main._mem[sid]["status"] = "completed"
    main._mem[sid]["report"] = {"summary": "keep me"}
    r = client.get(f"/research/{sid}/stream", params={"topic": "something else"})
    assert r.status_code == 409
    assert main._mem[sid]["report"] == {"summary": "keep me"}


def test_stream_of_owned_session_requires_the_owner(client, owned):
    sid, alice, bob = owned
    params = {"topic": "owned topic here"}
    assert client.get(f"/research/{sid}/stream", params=params).status_code == 401
    assert client.get(f"/research/{sid}/stream", params=params, headers=bob).status_code == 404
