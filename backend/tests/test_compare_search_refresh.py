"""Tests for session comparison, full-text search, and research refresh."""
import json
from conftest import register


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_session(client, session_id: str, topic: str, summary: str = "", sections=None, sources=None):
    from app import main
    report = {
        "session_id": session_id,
        "topic": topic,
        "summary": summary or f"Summary about {topic}.",
        "sections": sections or [{"heading": "Overview", "content": f"Content about {topic}."}],
        "sources": sources or [{"title": "Source A", "url": "https://example.com", "summary": "s"}],
        "knowledge_graph": {"entities": [{"id": "e1", "name": topic, "type": "concept", "description": ""}], "relationships": []},
        "created_at": "2026-06-11T12:00:00+00:00",
    }
    main._mem[session_id] = {
        "id": session_id, "topic": topic, "status": "completed",
        "report": json.dumps(report), "user_id": None,
        "is_favorite": False, "created_at": "2026-06-11T12:00:00+00:00",
    }
    return session_id


# ── GET /research/compare ─────────────────────────────────────────────────────

def test_compare_returns_200(client):
    a = _make_session(client, "sess-a", "AI in healthcare")
    b = _make_session(client, "sess-b", "Machine learning in medicine")
    r = client.get(f"/research/compare?a={a}&b={b}")
    assert r.status_code == 200


def test_compare_returns_expected_fields(client):
    a = _make_session(client, "sess-a", "AI in healthcare")
    b = _make_session(client, "sess-b", "Blockchain finance")
    r = client.get(f"/research/compare?a={a}&b={b}")
    body = r.json()
    assert "overall_similarity" in body
    assert "verdict" in body
    assert "summary" in body
    assert "sections" in body
    assert "sources" in body
    assert "entities" in body


def test_compare_identical_sessions_score_high(client):
    a = _make_session(client, "sess-a", "AI in healthcare", summary="AI transforms healthcare by enabling faster diagnoses.")
    b = _make_session(client, "sess-b", "AI in healthcare", summary="AI transforms healthcare by enabling faster diagnoses.")
    r = client.get(f"/research/compare?a={a}&b={b}")
    assert r.json()["overall_similarity"] >= 0.7


def test_compare_distinct_sessions_score_low(client):
    a = _make_session(
        client, "sess-a", "Quantum computing",
        summary="Quantum bits process information differently from classical bits.",
        sections=[{"heading": "Qubits", "content": "Superposition and entanglement."}],
        sources=[{"title": "Physics Paper", "url": "https://physics.org/quant", "summary": "q"}],
    )
    b = _make_session(
        client, "sess-b", "Ancient Roman history",
        summary="Rome was founded in 753 BC and grew into a vast empire.",
        sections=[{"heading": "Republic", "content": "The Senate governed Rome."}],
        sources=[{"title": "History Book", "url": "https://history.org/rome", "summary": "r"}],
    )
    r = client.get(f"/research/compare?a={a}&b={b}")
    assert r.json()["overall_similarity"] < 0.5


def test_compare_same_id_returns_400(client):
    a = _make_session(client, "sess-a", "AI")
    r = client.get(f"/research/compare?a={a}&b={a}")
    assert r.status_code == 400


def test_compare_missing_session_returns_404(client):
    a = _make_session(client, "sess-a", "AI")
    r = client.get(f"/research/compare?a={a}&b=nonexistent-id")
    assert r.status_code == 404


def test_compare_verdict_field_values(client):
    a = _make_session(client, "sess-a", "AI")
    b = _make_session(client, "sess-b", "Blockchain")
    r = client.get(f"/research/compare?a={a}&b={b}")
    assert r.json()["verdict"] in ("highly similar", "moderately similar", "distinct")


def test_compare_shared_sources_detected(client):
    shared_src = [{"title": "Shared Paper", "url": "https://shared.com", "summary": "both use this"}]
    a = _make_session(client, "sess-a", "AI", sources=shared_src)
    b = _make_session(client, "sess-b", "ML", sources=shared_src)
    r = client.get(f"/research/compare?a={a}&b={b}")
    assert len(r.json()["sources"]["shared"]) >= 1


# ── GET /research/search ──────────────────────────────────────────────────────

def test_search_returns_200(client):
    _make_session(client, "s1", "AI in healthcare")
    r = client.get("/research/search?q=healthcare")
    assert r.status_code == 200


def test_search_returns_matching_session(client):
    _make_session(client, "s1", "Quantum computing advances")
    r = client.get("/research/search?q=Quantum")
    body = r.json()
    assert body["total"] >= 1
    assert any("Quantum" in res["topic"] for res in body["results"])


def test_search_no_match_returns_empty(client):
    _make_session(client, "s1", "AI in healthcare")
    r = client.get("/research/search?q=xyznonexistenttopic999")
    assert r.json()["total"] == 0


def test_search_results_have_score_and_matches(client):
    _make_session(client, "s1", "AI agents for stock trading")
    r = client.get("/research/search?q=stock")
    results = r.json()["results"]
    assert len(results) >= 1
    assert "score" in results[0]
    assert "matches" in results[0]


def test_search_results_sorted_by_score(client):
    _make_session(client, "s1", "AI stock trading", summary="Stock markets use AI. Stock prediction. Stock analysis.")
    _make_session(client, "s2", "AI in healthcare", summary="Hospitals use AI for diagnosis.")
    r = client.get("/research/search?q=stock")
    results = r.json()["results"]
    if len(results) >= 2:
        assert results[0]["score"] >= results[1]["score"]


def test_search_respects_limit(client):
    for i in range(5):
        _make_session(client, f"s{i}", f"AI topic {i}")
    r = client.get("/research/search?q=AI&limit=2")
    assert len(r.json()["results"]) <= 2


def test_search_missing_query_returns_422(client):
    r = client.get("/research/search")
    assert r.status_code == 422


# ── POST /research/{id}/refresh ───────────────────────────────────────────────

def test_refresh_requires_auth(client):
    _make_session(client, "s1", "AI")
    r = client.post("/research/s1/refresh")
    assert r.status_code == 401


def test_refresh_returns_new_session_id(client):
    register(client)
    token = client.post("/auth/login", json={"email": "alice@example.com", "password": "Password123"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    from app import main
    main._mem["orig-session"] = {
        "id": "orig-session", "topic": "AI in finance", "status": "completed",
        "report": "{}", "user_id": None, "is_favorite": False, "created_at": "2026-06-11T00:00:00",
    }
    r = client.post("/research/orig-session/refresh", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert "new_session_id" in body
    assert body["new_session_id"] != "orig-session"
    assert body["original_session_id"] == "orig-session"
    assert body["topic"] == "AI in finance"


def test_refresh_missing_session_returns_404(client):
    register(client)
    token = client.post("/auth/login", json={"email": "alice@example.com", "password": "Password123"}).json()["access_token"]
    r = client.post("/research/nonexistent/refresh", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 404


def test_refresh_running_session_returns_409(client):
    register(client)
    token = client.post("/auth/login", json={"email": "alice@example.com", "password": "Password123"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    from app import main
    main._mem["running-session"] = {
        "id": "running-session", "topic": "AI", "status": "running",
        "report": None, "user_id": None, "is_favorite": False, "created_at": "2026-06-11T00:00:00",
    }
    r = client.post("/research/running-session/refresh", headers=headers)
    assert r.status_code == 409


# ── report_compare unit tests ─────────────────────────────────────────────────

def test_compare_reports_unit():
    from app.tools.report_compare import compare_reports
    a = {"topic": "AI", "summary": "AI is transforming industries.", "sections": [], "sources": [], "knowledge_graph": {}}
    b = {"topic": "ML", "summary": "Machine learning changes how we work.", "sections": [], "sources": [], "knowledge_graph": {}}
    result = compare_reports(a, b, "id-a", "id-b")
    assert 0 <= result["overall_similarity"] <= 1
    assert result["verdict"] in ("highly similar", "moderately similar", "distinct")


# ── report_search unit tests ──────────────────────────────────────────────────

def test_search_report_unit_match():
    from app.tools.report_search import search_report
    report = {"topic": "quantum computing", "summary": "Quantum bits.", "sections": [], "sources": []}
    r = search_report(report, "quantum")
    assert r["matched"] is True
    assert r["score"] > 0


def test_search_report_unit_no_match():
    from app.tools.report_search import search_report
    report = {"topic": "ancient history", "summary": "Rome was great.", "sections": [], "sources": []}
    r = search_report(report, "quantum")
    assert r["matched"] is False
