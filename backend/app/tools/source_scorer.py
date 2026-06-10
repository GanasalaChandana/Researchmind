"""
Source quality scoring.

Produces a composite quality_score (0–100) for each source based on:
  - Domain authority tier  (50 pts max)
  - Recency signals        (30 pts max)
  - URL structure signals  (20 pts max)
"""

import re
from urllib.parse import urlparse
from datetime import datetime


# ── Domain authority tiers ────────────────────────────────────────────────────

_HIGH_AUTHORITY = {
    # Academic / research
    "scholar.google.com", "pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov",
    "arxiv.org", "semanticscholar.org", "researchgate.net", "jstor.org",
    "sciencedirect.com", "springer.com", "nature.com", "science.org",
    "cell.com", "thelancet.com", "bmj.com", "nejm.org", "jamanetwork.com",
    "ieeexplore.ieee.org", "dl.acm.org", "ssrn.com",
    # Government / official
    "who.int", "cdc.gov", "nih.gov", "fda.gov", "nasa.gov", "un.org",
    "worldbank.org", "imf.org", "europa.eu", "gov.uk",
    # Major encyclopedias / references
    "wikipedia.org", "britannica.com",
    # Major tech / news
    "nytimes.com", "bbc.com", "bbc.co.uk", "reuters.com", "apnews.com",
    "theguardian.com", "economist.com", "ft.com", "wsj.com",
    "techcrunch.com", "wired.com", "mit.edu", "stanford.edu", "harvard.edu",
}

_MEDIUM_AUTHORITY = {
    "medium.com", "substack.com", "towardsdatascience.com", "hackernoon.com",
    "zdnet.com", "cnet.com", "theverge.com", "arstechnica.com", "slashdot.org",
    "stackoverflow.com", "github.com", "gitlab.com",
    "forbes.com", "businessinsider.com", "cnbc.com", "bloomberg.com",
    "healthline.com", "webmd.com", "mayoclinic.org",
    "investopedia.com", "statista.com",
}

# Everything else defaults to "low"

# ── Recency patterns ──────────────────────────────────────────────────────────

_YEAR_PATTERN = re.compile(r"\b(20\d{2})\b")
_CURRENT_YEAR = datetime.now().year


def _domain_tier(url: str) -> tuple[str, float]:
    """Return (tier_label, score_0_to_50)."""
    try:
        host = urlparse(url).hostname or ""
        host = host.lstrip("www.")
    except Exception:
        return "low", 5.0

    if host in _HIGH_AUTHORITY or any(host.endswith("." + h) for h in _HIGH_AUTHORITY):
        return "high", 50.0
    if host in _MEDIUM_AUTHORITY or any(host.endswith("." + h) for h in _MEDIUM_AUTHORITY):
        return "medium", 30.0

    # .edu / .gov / .org get a slight bump
    if host.endswith(".edu"):
        return "high", 45.0
    if host.endswith(".gov"):
        return "high", 48.0
    if host.endswith(".org"):
        return "medium", 28.0

    return "low", 10.0


def _recency_score(url: str, title: str) -> float:
    """Return 0–1 based on year signals found in URL or title."""
    text = f"{url} {title}"
    years = [int(y) for y in _YEAR_PATTERN.findall(text)]
    if not years:
        # No date signal — assume moderately old
        return 0.4

    latest = max(years)
    age = _CURRENT_YEAR - latest

    if age <= 0:   return 1.0
    if age == 1:   return 0.85
    if age == 2:   return 0.70
    if age == 3:   return 0.55
    if age <= 5:   return 0.40
    if age <= 10:  return 0.25
    return 0.10


def _url_structure_score(url: str) -> float:
    """Return 0–20 based on URL quality signals."""
    score = 10.0  # baseline

    # HTTPS is a positive signal
    if url.startswith("https://"):
        score += 4.0

    # Very long URLs / lots of query params = lower quality
    if len(url) > 200:
        score -= 3.0
    if url.count("?") > 1 or url.count("&") > 3:
        score -= 2.0

    # Paths that suggest real content
    if any(seg in url for seg in ["/article/", "/paper/", "/research/", "/study/", "/report/"]):
        score += 4.0
    elif any(seg in url for seg in ["/blog/", "/post/", "/news/"]):
        score += 2.0

    # PDF links are usually primary sources
    if url.endswith(".pdf"):
        score += 4.0

    return max(0.0, min(20.0, score))


# ── Public API ────────────────────────────────────────────────────────────────

def score_source(url: str, title: str = "") -> dict:
    """
    Return a dict with quality_score, domain_authority, recency_score.
    Designed to be called for each source during/after reading.
    """
    tier_label, domain_pts = _domain_tier(url)
    recency = _recency_score(url, title)
    recency_pts = recency * 30.0
    structure_pts = _url_structure_score(url)

    composite = round(domain_pts + recency_pts + structure_pts, 1)
    composite = max(0.0, min(100.0, composite))

    return {
        "quality_score": composite,
        "domain_authority": tier_label,
        "recency_score": round(recency, 2),
    }
