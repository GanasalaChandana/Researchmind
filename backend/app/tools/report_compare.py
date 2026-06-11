"""Side-by-side comparison of two research reports.

Produces a structured diff covering:
  - Topic similarity
  - Summary agreements and contradictions (sentence-level)
  - Section overlap (headings present in one but not the other)
  - Source overlap (shared URLs / unique to each)
  - Entity overlap from the knowledge graph
"""
import re
from difflib import SequenceMatcher


def _similarity(a: str, b: str) -> float:
    """0-1 string similarity using difflib SequenceMatcher."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _sentences(text: str) -> list[str]:
    """Split text into sentences."""
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 20]


def _compare_summaries(sum_a: str, sum_b: str) -> dict:
    """Find agreement and contradiction signals between two summaries."""
    sents_a = _sentences(sum_a)
    sents_b = _sentences(sum_b)

    agreements: list[str] = []
    unique_a: list[str] = []
    unique_b: list[str] = []

    for sa in sents_a:
        best = max((_similarity(sa, sb) for sb in sents_b), default=0.0)
        if best >= 0.55:
            agreements.append(sa)
        else:
            unique_a.append(sa)

    for sb in sents_b:
        best = max((_similarity(sb, sa) for sa in sents_a), default=0.0)
        if best < 0.55:
            unique_b.append(sb)

    overall_similarity = _similarity(sum_a, sum_b)
    return {
        "similarity_score": round(overall_similarity, 2),
        "agreements": agreements[:5],
        "only_in_a": unique_a[:5],
        "only_in_b": unique_b[:5],
    }


def _compare_sections(secs_a: list[dict], secs_b: list[dict]) -> dict:
    """Compare section headings across both reports."""
    headings_a = {s.get("heading", "").lower().strip() for s in secs_a if s.get("heading")}
    headings_b = {s.get("heading", "").lower().strip() for s in secs_b if s.get("heading")}

    shared = sorted(headings_a & headings_b)
    only_a = sorted(headings_a - headings_b)
    only_b = sorted(headings_b - headings_a)

    overlap = len(shared) / max(len(headings_a | headings_b), 1)
    return {
        "overlap_score": round(overlap, 2),
        "shared_sections": shared,
        "only_in_a": only_a,
        "only_in_b": only_b,
    }


def _compare_sources(srcs_a: list, srcs_b: list) -> dict:
    """Find shared and unique sources by URL."""
    def _url(s):
        return s.get("url", "") if isinstance(s, dict) else getattr(s, "url", "")
    def _title(s):
        return s.get("title", "") if isinstance(s, dict) else getattr(s, "title", "")

    urls_a = {_url(s): _title(s) for s in srcs_a if _url(s)}
    urls_b = {_url(s): _title(s) for s in srcs_b if _url(s)}

    shared_urls = set(urls_a) & set(urls_b)
    only_a_urls = set(urls_a) - set(urls_b)
    only_b_urls = set(urls_b) - set(urls_a)

    overlap = len(shared_urls) / max(len(set(urls_a) | set(urls_b)), 1)
    return {
        "overlap_score": round(overlap, 2),
        "shared": [{"url": u, "title": urls_a[u]} for u in sorted(shared_urls)][:10],
        "only_in_a": [{"url": u, "title": urls_a[u]} for u in sorted(only_a_urls)][:10],
        "only_in_b": [{"url": u, "title": urls_b[u]} for u in sorted(only_b_urls)][:10],
    }


def _compare_entities(kg_a: dict, kg_b: dict) -> dict:
    """Find shared and unique knowledge graph entities by name."""
    def _names(kg):
        ents = kg.get("entities", []) if isinstance(kg, dict) else []
        return {e.get("name", "").lower().strip() for e in ents if e.get("name")}

    names_a = _names(kg_a)
    names_b = _names(kg_b)
    shared = sorted(names_a & names_b)
    only_a = sorted(names_a - names_b)
    only_b = sorted(names_b - names_a)
    overlap = len(shared) / max(len(names_a | names_b), 1)
    return {
        "overlap_score": round(overlap, 2),
        "shared_entities": shared[:20],
        "only_in_a": only_a[:10],
        "only_in_b": only_b[:10],
    }


def compare_reports(report_a: dict, report_b: dict, id_a: str, id_b: str) -> dict:
    """Return a full structured comparison of two research report dicts."""
    topic_a = report_a.get("topic", "")
    topic_b = report_b.get("topic", "")
    topic_similarity = _similarity(topic_a, topic_b)

    summary_diff = _compare_summaries(
        report_a.get("summary", ""),
        report_b.get("summary", ""),
    )
    section_diff = _compare_sections(
        report_a.get("sections", []),
        report_b.get("sections", []),
    )
    source_diff = _compare_sources(
        report_a.get("sources", []),
        report_b.get("sources", []),
    )
    entity_diff = _compare_entities(
        report_a.get("knowledge_graph", {}),
        report_b.get("knowledge_graph", {}),
    )

    # Overall similarity: weighted average
    overall = round(
        topic_similarity * 0.2
        + summary_diff["similarity_score"] * 0.35
        + section_diff["overlap_score"] * 0.2
        + source_diff["overlap_score"] * 0.15
        + entity_diff["overlap_score"] * 0.1,
        2,
    )

    verdict = (
        "highly similar" if overall >= 0.7
        else "moderately similar" if overall >= 0.4
        else "distinct"
    )

    return {
        "session_a": id_a,
        "session_b": id_b,
        "topic_a": topic_a,
        "topic_b": topic_b,
        "topic_similarity": round(topic_similarity, 2),
        "overall_similarity": overall,
        "verdict": verdict,
        "summary": summary_diff,
        "sections": section_diff,
        "sources": source_diff,
        "entities": entity_diff,
    }
