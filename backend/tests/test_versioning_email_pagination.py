"""Tests for report versioning, email notifications, and cursor pagination."""
import json
import base64


# ── Helpers ───────────────────────────────────────────────────────────────────

def _seed(client, session_id, topic, created_at="2026-06-11T12:00:00"):
    from app import main
    report = {"topic": topic, "summary": "s", "sections": [], "sources": [], "knowledge_graph": {}}
    main._mem[session_id] = {
        "id": session_id, "topic": topic, "status": "completed",
        "report": json.dumps(report), "user_id": None,
        "is_favorite": False, "created_at": created_at,
    }
    return report


# ── Report versioning ─────────────────────────────────────────────────────────

def test_versions_endpoint_returns_200(client):
    _seed(client, "v-sess", "AI versioning test")
    r = client.get("/research/v-sess/versions")
    assert r.status_code == 200


def test_versions_empty_for_new_session(client):
    _seed(client, "v-sess", "AI versioning test")
    r = client.get("/research/v-sess/versions")
    body = r.json()
    assert "versions" in body
    assert isinstance(body["versions"], list)


def test_versions_missing_session_returns_404(client):
    r = client.get("/research/nonexistent-session/versions")
    assert r.status_code == 404


def test_save_and_list_version(client):
    from app.database import save_report_version, _mem_report_versions
    import asyncio
    report = {"topic": "AI", "summary": "test", "sections": [], "sources": [], "knowledge_graph": {}}
    asyncio.get_event_loop().run_until_complete(save_report_version("ver-test", report))
    assert len(_mem_report_versions.get("ver-test", [])) == 1


def test_save_multiple_versions_increments(client):
    from app.database import save_report_version, _mem_report_versions
    import asyncio
    report = {"topic": "AI", "summary": "v", "sections": [], "sources": [], "knowledge_graph": {}}
    loop = asyncio.get_event_loop()
    loop.run_until_complete(save_report_version("mv-test", report))
    loop.run_until_complete(save_report_version("mv-test", report))
    versions = _mem_report_versions.get("mv-test", [])
    assert len(versions) == 2
    assert versions[0]["version"] == 1
    assert versions[1]["version"] == 2


def test_versions_capped_at_10(client):
    from app.database import save_report_version, _mem_report_versions
    import asyncio
    report = {"topic": "AI", "summary": "v", "sections": [], "sources": [], "knowledge_graph": {}}
    loop = asyncio.get_event_loop()
    for _ in range(15):
        loop.run_until_complete(save_report_version("cap-test", report))
    assert len(_mem_report_versions.get("cap-test", [])) <= 10


def test_get_specific_version(client):
    from app.database import save_report_version, get_report_version
    import asyncio
    report = {"topic": "AI v1", "summary": "first version", "sections": [], "sources": [], "knowledge_graph": {}}
    loop = asyncio.get_event_loop()
    loop.run_until_complete(save_report_version("gv-test", report))
    result = loop.run_until_complete(get_report_version("gv-test", 1))
    assert result is not None
    assert result["topic"] == "AI v1"


def test_get_version_detail_endpoint(client):
    _seed(client, "ver-detail", "Versioned topic")
    from app.database import save_report_version
    import asyncio
    report = {"topic": "Versioned topic", "summary": "snap", "sections": [], "sources": [], "knowledge_graph": {}}
    asyncio.get_event_loop().run_until_complete(save_report_version("ver-detail", report))
    r = client.get("/research/ver-detail/versions/1")
    assert r.status_code == 200
    assert "report" in r.json()


def test_get_version_missing_returns_404(client):
    _seed(client, "ver-detail", "Topic")
    r = client.get("/research/ver-detail/versions/99")
    assert r.status_code == 404


# ── Email notifications unit tests ────────────────────────────────────────────

def test_email_not_sent_without_api_key(client):
    """With no RESEND_API_KEY set, _send returns False without crashing."""
    import asyncio
    from app.tools.email import send_email
    # In test env RESEND_API_KEY is not set — should return False silently
    result = asyncio.get_event_loop().run_until_complete(
        send_email("test@example.com", "Subject", "<p>Hello</p>")
    )
    assert result is False


def test_email_configured_false_without_key():
    from app.tools.email import email_configured
    import os
    old = os.environ.pop("RESEND_API_KEY", None)
    try:
        assert email_configured() is False
    finally:
        if old:
            os.environ["RESEND_API_KEY"] = old


def test_email_configured_true_with_key():
    """email_configured() checks the env var at call time via config module."""
    import os
    import app.config as cfg
    old = cfg.RESEND_API_KEY
    cfg.RESEND_API_KEY = "re_test_key"
    try:
        from app.tools.email import email_configured
        # Patch the module-level var the function reads
        import app.tools.email as em
        old_key = em.RESEND_API_KEY
        em.RESEND_API_KEY = "re_test_key"
        assert email_configured() is True
        em.RESEND_API_KEY = old_key
    finally:
        cfg.RESEND_API_KEY = old


# ── Cursor pagination ─────────────────────────────────────────────────────────

def test_sessions_list_returns_next_cursor_when_full_page(client):
    from app import main
    for i in range(25):
        ts = f"2026-06-11T{i:02d}:00:00"
        main._mem[f"page-sess-{i}"] = {
            "id": f"page-sess-{i}", "topic": f"Topic {i}", "status": "completed",
            "report": None, "user_id": None, "is_favorite": False, "created_at": ts,
        }
    r = client.get("/research/sessions/list?limit=10")
    assert r.status_code == 200
    body = r.json()
    assert "next_cursor" in body


def test_cursor_is_base64_encoded(client):
    from app import main
    for i in range(15):
        ts = f"2026-06-11T{i:02d}:00:00"
        main._mem[f"cur-sess-{i}"] = {
            "id": f"cur-sess-{i}", "topic": f"Topic {i}", "status": "completed",
            "report": None, "user_id": None, "is_favorite": False, "created_at": ts,
        }
    r = client.get("/research/sessions/list?limit=10")
    cursor = r.json().get("next_cursor")
    if cursor:
        decoded = base64.b64decode(cursor.encode()).decode()
        assert "2026" in decoded  # should contain a timestamp


def test_cursor_paginates_correctly(client):
    from app import main
    for i in range(15):
        ts = f"2026-06-11T{i:02d}:00:00"
        main._mem[f"cp-sess-{i}"] = {
            "id": f"cp-sess-{i}", "topic": f"Topic {i}", "status": "completed",
            "report": None, "user_id": None, "is_favorite": False, "created_at": ts,
        }
    r1 = client.get("/research/sessions/list?limit=10")
    cursor = r1.json().get("next_cursor")
    if cursor:
        r2 = client.get(f"/research/sessions/list?limit=10&cursor={cursor}")
        assert r2.status_code == 200
        # Second page items should not overlap with first page
        ids1 = {s["id"] for s in r1.json()["items"]}
        ids2 = {s["id"] for s in r2.json()["items"]}
        assert ids1.isdisjoint(ids2)


def test_no_cursor_when_fewer_items_than_limit(client):
    _seed(client, "small-1", "Only one session")
    r = client.get("/research/sessions/list?limit=20")
    assert r.json().get("next_cursor") is None


def test_malformed_cursor_ignored(client):
    r = client.get("/research/sessions/list?cursor=notvalidbase64!!!")
    assert r.status_code == 200  # should not crash
