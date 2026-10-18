"""Regression: patching key takeaways must not re-trigger takeaway extraction (endless Groq loop)."""
import asyncio

from app import main


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _patch(monkeypatch):
    scheduled = []
    monkeypatch.setattr(main, "_bg_task", lambda c: (scheduled.append(c), c.close()))

    async def _noop(*a, **k):
        return None

    monkeypatch.setattr(main, "update_session", _noop)
    return scheduled


def test_update_schedules_followups_by_default(monkeypatch):
    scheduled = _patch(monkeypatch)
    _run(main._update("sid-1", "completed", {"summary": "x", "sections": []}))
    assert len(scheduled) == 3  # version snapshot, auto-tag, key takeaways


def test_update_with_snapshot_false_schedules_nothing(monkeypatch):
    scheduled = _patch(monkeypatch)
    _run(main._update("sid-1", "completed", {"summary": "x", "key_takeaways": ["a"]}, snapshot=False))
    assert scheduled == []


def test_takeaways_skipped_when_already_present():
    # Returns before any Groq call (would fail without an API key if it didn't).
    assert _run(main._extract_key_takeaways("sid", "t", {"key_takeaways": ["done"]})) is None
