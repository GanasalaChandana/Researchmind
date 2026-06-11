"""Tests for the async circuit breaker."""
import asyncio
import pytest
from app.tools.circuit_breaker import CircuitBreaker, CircuitBreakerOpen, _State


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ── Basic state transitions ───────────────────────────────────────────────────

def test_initial_state_is_closed():
    cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout=60)
    assert cb.state == "closed"


def test_success_keeps_closed():
    cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout=60)
    async def _go():
        async with cb:
            pass
    run(_go())
    assert cb.state == "closed"


def test_opens_after_threshold_failures():
    cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout=60)
    async def _fail():
        for _ in range(3):
            try:
                async with cb:
                    raise ValueError("boom")
            except (ValueError, CircuitBreakerOpen):
                pass
    run(_fail())
    assert cb.state == "open"


def test_open_circuit_raises_immediately():
    cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=60)
    async def _go():
        # Trip it
        try:
            async with cb:
                raise RuntimeError("fail")
        except RuntimeError:
            pass
        # Now should be open
        async with cb:
            pass  # should raise CircuitBreakerOpen
    with pytest.raises(CircuitBreakerOpen):
        run(_go())


def test_recovers_to_half_open_after_timeout():
    import time
    cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=0.05)
    async def _go():
        try:
            async with cb:
                raise RuntimeError("fail")
        except RuntimeError:
            pass
        assert cb.state == "open"
        await asyncio.sleep(0.1)
        # Next enter should transition to half-open
        async with cb:
            pass
        return cb.state
    state = run(_go())
    assert state in ("closed", "half_open")


def test_half_open_success_closes_circuit():
    import time
    cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=0.05, success_threshold=1)
    async def _go():
        try:
            async with cb:
                raise RuntimeError("fail")
        except RuntimeError:
            pass
        await asyncio.sleep(0.1)
        async with cb:
            pass  # success probe
    run(_go())
    assert cb.state == "closed"


def test_half_open_failure_reopens():
    cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=0.05)
    async def _go():
        try:
            async with cb:
                raise RuntimeError("fail")
        except RuntimeError:
            pass
        await asyncio.sleep(0.1)
        try:
            async with cb:
                raise RuntimeError("fail again")
        except (RuntimeError, CircuitBreakerOpen):
            pass
    run(_go())
    assert cb.state == "open"


# ── Health check exposes breaker state ───────────────────────────────────────

def test_health_includes_circuit_breakers(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert "circuit_breakers" in body["checks"]
    assert "groq" in body["checks"]["circuit_breakers"]
    assert "tavily" in body["checks"]["circuit_breakers"]


def test_health_breakers_start_closed(client):
    r = client.get("/health")
    cbs = r.json()["checks"]["circuit_breakers"]
    assert cbs["groq"] == "closed"
    assert cbs["tavily"] == "closed"
