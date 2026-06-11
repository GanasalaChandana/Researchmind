"""Tests for Prometheus /metrics endpoint and PDF export."""
import json


# ── GET /metrics ──────────────────────────────────────────────────────────────

def test_metrics_endpoint_returns_200(client):
    r = client.get("/metrics")
    assert r.status_code == 200


def test_metrics_content_type_is_prometheus(client):
    r = client.get("/metrics")
    assert "text/plain" in r.headers["content-type"]


def test_metrics_contains_researchmind_prefix(client):
    r = client.get("/metrics")
    assert b"researchmind_" in r.content


def test_metrics_session_counter_present(client):
    r = client.get("/metrics")
    assert b"researchmind_research_sessions_total" in r.content


def test_metrics_sse_gauge_present(client):
    r = client.get("/metrics")
    assert b"researchmind_active_sse_connections" in r.content


def test_metrics_increments_after_start(client):
    client.post("/research/start", json={"topic": "metrics test", "depth": 1})
    r = client.get("/metrics")
    assert b"researchmind_research_sessions_total" in r.content


# ── PDF export ────────────────────────────────────────────────────────────────

def _make_session_with_report(client):
    """Create a completed in-memory session with a minimal report."""
    session_id = "test-pdf-session-id"
    from app import main, database
    report = {
        "session_id": session_id,
        "topic": "PDF Export Test",
        "summary": "This is a test summary for PDF generation.",
        "sections": [{"heading": "Introduction", "content": "Test content here."}],
        "sources": [{"title": "Test Source", "url": "https://example.com", "summary": "A source."}],
        "knowledge_graph": {"entities": [], "relationships": []},
        "created_at": "2026-06-11T12:00:00+00:00",
    }
    main._mem[session_id] = {
        "id": session_id,
        "topic": "PDF Export Test",
        "status": "completed",
        "report": json.dumps(report),
        "user_id": None,
        "is_favorite": False,
        "created_at": "2026-06-11T12:00:00+00:00",
    }
    return session_id


def test_pdf_export_returns_200(client):
    session_id = _make_session_with_report(client)
    r = client.get(f"/research/{session_id}/export/pdf")
    assert r.status_code == 200


def test_pdf_export_content_type(client):
    session_id = _make_session_with_report(client)
    r = client.get(f"/research/{session_id}/export/pdf")
    assert r.headers["content-type"] == "application/pdf"


def test_pdf_export_content_disposition(client):
    session_id = _make_session_with_report(client)
    r = client.get(f"/research/{session_id}/export/pdf")
    assert "attachment" in r.headers["content-disposition"]
    assert "report-" in r.headers["content-disposition"]


def test_pdf_export_non_empty(client):
    session_id = _make_session_with_report(client)
    r = client.get(f"/research/{session_id}/export/pdf")
    assert len(r.content) > 1000  # real PDF is always several KB


def test_pdf_export_starts_with_pdf_magic(client):
    session_id = _make_session_with_report(client)
    r = client.get(f"/research/{session_id}/export/pdf")
    assert r.content[:4] == b"%PDF"


def test_pdf_export_missing_session_returns_404(client):
    r = client.get("/research/nonexistent-session/export/pdf")
    assert r.status_code == 404


def test_unsupported_format_returns_400(client):
    session_id = _make_session_with_report(client)
    r = client.get(f"/research/{session_id}/export/xyz")
    assert r.status_code == 400


# ── DOCX export ───────────────────────────────────────────────────────────────

def test_docx_export_returns_200(client):
    session_id = _make_session_with_report(client)
    r = client.get(f"/research/{session_id}/export/docx")
    assert r.status_code == 200


def test_docx_export_content_type(client):
    session_id = _make_session_with_report(client)
    r = client.get(f"/research/{session_id}/export/docx")
    assert "wordprocessingml" in r.headers["content-type"]


def test_docx_export_content_disposition(client):
    session_id = _make_session_with_report(client)
    r = client.get(f"/research/{session_id}/export/docx")
    assert "attachment" in r.headers["content-disposition"]
    assert ".docx" in r.headers["content-disposition"]


def test_docx_export_non_empty(client):
    session_id = _make_session_with_report(client)
    r = client.get(f"/research/{session_id}/export/docx")
    assert len(r.content) > 1000


def test_docx_export_starts_with_zip_magic(client):
    """DOCX files are ZIP archives — magic bytes are PK\x03\x04."""
    session_id = _make_session_with_report(client)
    r = client.get(f"/research/{session_id}/export/docx")
    assert r.content[:2] == b"PK"


def test_docx_missing_session_returns_404(client):
    r = client.get("/research/nonexistent-id/export/docx")
    assert r.status_code == 404
