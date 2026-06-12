"""Auto-tag a completed research report.

Extracts meaningful tags from the report topic, section headings, and top
knowledge-graph entities.  Returns up to 6 lowercase slug-safe tags.
"""
import re
import logging
from typing import Any

logger = logging.getLogger(__name__)

_STOP = {
    "a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or",
    "but", "is", "are", "was", "were", "be", "been", "being", "with",
    "from", "by", "as", "into", "through", "about", "how", "what", "why",
    "does", "do", "its", "it", "this", "that", "these", "those", "can",
    "will", "would", "could", "should", "may", "might", "has", "have",
    "had", "not", "no", "their", "which", "when", "where", "who",
}


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _tokens(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-zA-Z]{3,}", text) if w.lower() not in _STOP]


def extract_tags(report: dict[str, Any], max_tags: int = 6) -> list[str]:
    """Return up to *max_tags* slugged tags derived from the report."""
    candidates: list[tuple[int, str]] = []  # (priority, slug)

    # 1. Topic bi-grams and uni-grams (highest priority)
    topic: str = report.get("topic", "")
    topic_tokens = _tokens(topic)
    if len(topic_tokens) >= 2:
        bigram = _slug(" ".join(topic_tokens[:2]))
        if len(bigram) >= 4:
            candidates.append((0, bigram))
    for tok in topic_tokens[:4]:
        candidates.append((1, tok.lower()))

    # 2. Top KG entities (medium priority)
    entities: list[dict] = (report.get("knowledge_graph") or {}).get("entities", [])
    for ent in entities[:8]:
        name: str = ent.get("name", "")
        slug = _slug(name)
        if 3 <= len(slug) <= 30:
            candidates.append((2, slug))

    # 3. Section headings — first word of each heading (lower priority)
    for section in (report.get("sections") or [])[:5]:
        heading: str = section.get("heading", "")
        toks = _tokens(heading)
        if toks:
            candidates.append((3, toks[0].lower()))

    # Deduplicate while preserving priority order
    seen: set[str] = set()
    result: list[str] = []
    for _, slug in sorted(candidates, key=lambda x: x[0]):
        if slug not in seen and len(slug) >= 3:
            seen.add(slug)
            result.append(slug)
        if len(result) >= max_tags:
            break

    return result
