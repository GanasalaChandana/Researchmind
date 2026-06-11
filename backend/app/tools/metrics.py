"""Prometheus metrics for ResearchMind."""
import time
from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST

# Use a dedicated registry to avoid conflicts with default global registry in tests
REGISTRY = CollectorRegistry(auto_describe=True)

# ── Counters ──────────────────────────────────────────────────────────────────
research_sessions_total = Counter(
    "researchmind_research_sessions_total",
    "Total research sessions by status",
    ["status"],  # started | completed | failed
    registry=REGISTRY,
)

groq_calls_total = Counter(
    "researchmind_groq_calls_total",
    "Total Groq API calls",
    ["agent", "status"],  # agent: orchestrator|reader|synthesizer; status: ok|error|rate_limited
    registry=REGISTRY,
)

cache_hits_total = Counter(
    "researchmind_cache_hits_total",
    "Total research cache hits",
    registry=REGISTRY,
)

cache_misses_total = Counter(
    "researchmind_cache_misses_total",
    "Total research cache misses",
    registry=REGISTRY,
)

export_requests_total = Counter(
    "researchmind_export_requests_total",
    "Total export requests by format",
    ["format"],  # markdown | html | pdf
    registry=REGISTRY,
)

# ── Histograms ────────────────────────────────────────────────────────────────
research_duration_seconds = Histogram(
    "researchmind_research_duration_seconds",
    "End-to-end research pipeline duration in seconds",
    buckets=[5, 10, 20, 30, 45, 60, 90, 120, 180, 300],
    registry=REGISTRY,
)

http_request_duration_seconds = Histogram(
    "researchmind_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path", "status_code"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registry=REGISTRY,
)

# ── Gauges ────────────────────────────────────────────────────────────────────
active_sse_connections = Gauge(
    "researchmind_active_sse_connections",
    "Number of currently active SSE streaming connections",
    registry=REGISTRY,
)


def get_metrics_output() -> tuple[bytes, str]:
    """Return (body_bytes, content_type) for the /metrics endpoint."""
    return generate_latest(REGISTRY), CONTENT_TYPE_LATEST


class ResearchTimer:
    """Context manager that records research pipeline duration."""
    def __init__(self):
        self._start: float = 0.0

    def __enter__(self):
        self._start = time.perf_counter()
        return self

    def __exit__(self, *_):
        elapsed = time.perf_counter() - self._start
        research_duration_seconds.observe(elapsed)
