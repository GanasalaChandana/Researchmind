"""Thread-safe async circuit breaker for external API calls.

States:
  CLOSED   — normal operation, calls pass through
  OPEN     — too many failures, calls rejected immediately (fast-fail)
  HALF_OPEN — trial period: one probe call allowed; success → CLOSED, failure → OPEN

Usage:
    from .circuit_breaker import CircuitBreaker
    _cb = CircuitBreaker("groq", failure_threshold=5, recovery_timeout=60)

    async def call():
        async with _cb:
            return groq_with_retry(client, ...)
"""
import asyncio
import logging
import time
from enum import Enum

logger = logging.getLogger(__name__)


class _State(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerOpen(Exception):
    """Raised when a call is rejected because the circuit is open."""


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        success_threshold: int = 2,
    ):
        self.name = name
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._success_threshold = success_threshold

        self._state = _State.CLOSED
        self._failures = 0
        self._successes = 0
        self._opened_at: float = 0.0
        self._lock = asyncio.Lock()

    @property
    def state(self) -> str:
        return self._state.value

    async def _transition(self, new_state: _State) -> None:
        old = self._state
        self._state = new_state
        if old != new_state:
            logger.warning(
                "CircuitBreaker[%s]: %s → %s",
                self.name, old.value, new_state.value,
            )

    async def __aenter__(self):
        async with self._lock:
            if self._state == _State.OPEN:
                elapsed = time.monotonic() - self._opened_at
                if elapsed >= self._recovery_timeout:
                    await self._transition(_State.HALF_OPEN)
                    self._successes = 0
                else:
                    raise CircuitBreakerOpen(
                        f"{self.name} circuit is OPEN — "
                        f"retry in {self._recovery_timeout - elapsed:.0f}s"
                    )
            elif self._state == _State.HALF_OPEN:
                # Only one probe at a time — others fast-fail while probing
                pass
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        async with self._lock:
            if exc_type is not None and exc_type is not CircuitBreakerOpen:
                # A real failure
                self._failures += 1
                self._successes = 0
                if self._state == _State.HALF_OPEN or self._failures >= self._failure_threshold:
                    self._opened_at = time.monotonic()
                    await self._transition(_State.OPEN)
                    self._failures = 0
            else:
                # Success
                if self._state == _State.HALF_OPEN:
                    self._successes += 1
                    if self._successes >= self._success_threshold:
                        await self._transition(_State.CLOSED)
                        self._failures = 0
                elif self._state == _State.CLOSED:
                    # Gradually reduce failure count on consecutive successes
                    if self._failures > 0:
                        self._failures = max(0, self._failures - 1)
        return False  # never suppress exceptions


# ── Singletons — one breaker per external service ────────────────────────────

groq_breaker = CircuitBreaker(
    name="groq",
    failure_threshold=5,
    recovery_timeout=60.0,
    success_threshold=2,
)

tavily_breaker = CircuitBreaker(
    name="tavily",
    failure_threshold=5,
    recovery_timeout=60.0,
    success_threshold=2,
)
