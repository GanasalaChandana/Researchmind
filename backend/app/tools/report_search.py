"""Full-text search within stored research reports.

Searches across: topic, summary, section headings, section content,
and source titles. Returns ranked matches with highlighted snippets.
No external dependencies — pure Python regex over stored report dicts.
"""
import re
from typing import Any


def _snippets(text: str, pattern: re.Pattern, context: int = 80) -> list[str]:
    """Return up to 3 highlighted snippets around each match."""
    results = []
    for m in pattern.finditer(text):
        start = max(0, m.start() - context)
        end = min(len(text), m.end() + context)
        snippet = text[start:end].strip()
        # Mark the match with simple markers
        inner = text[m.start():m.end()]
        snippet = snippet.replace(inner, f"**{inner}**", 1)
        results.append(snippet)
        if len(results) >= 3:
            break
    return results


def search_report(report_dict: dict, query: str) -> dict[str, Any]:
    """Search a single report dict for `query`.

    Returns a result dict with:
      matched: bool
      score: int  (0–100, higher = more relevant)
      matches: list of {field, snippets}
    """
    if not query or not report_dict:
        return {"matched": False, "score": 0, "matches": []}

    flags = re.IGNORECASE
    try:
        pattern = re.compile(re.escape(query.strip()), flags)
    except re.error:
        return {"matched": False, "score": 0, "matches": []}

    score = 0
    matches: list[dict] = []

    # Topic match — highest weight
    topic = report_dict.get("topic", "")
    if pattern.search(topic):
        score += 40
        matches.append({"field": "topic", "snippets": [topic]})

    # Summary
    summary = report_dict.get("summary", "")
    snips = _snippets(summary, pattern)
    if snips:
        score += 25
        matches.append({"field": "summary", "snippets": snips})

    # Sections
    section_snips: list[str] = []
    for section in report_dict.get("sections", []):
        heading = section.get("heading", "")
        content = section.get("content", "")
        if pattern.search(heading):
            score += 10
            section_snips.append(f"[{heading}]")
        snips = _snippets(content, pattern)
        if snips:
            score += 5
            section_snips.extend(snips)
    if section_snips:
        matches.append({"field": "sections", "snippets": section_snips[:5]})

    # Source titles
    source_snips: list[str] = []
    for src in report_dict.get("sources", []):
        title = src.get("title", "") if isinstance(src, dict) else getattr(src, "title", "")
        if pattern.search(title):
            score += 3
            source_snips.append(title)
    if source_snips:
        matches.append({"field": "sources", "snippets": source_snips[:5]})

    matched = score > 0
    return {
        "matched": matched,
        "score": min(score, 100),
        "matches": matches,
    }


def search_sessions(sessions: list[dict], query: str) -> list[dict]:
    """Search a list of session dicts (with embedded report), return ranked results."""
    results = []
    for session in sessions:
        report = session.get("report")
        if isinstance(report, str):
            import json
            try:
                report = json.loads(report)
            except Exception:
                report = {}
        result = search_report(report or {}, query)
        # Also match on topic even without a full report
        if not result["matched"]:
            topic = session.get("topic", "")
            if query.lower() in topic.lower():
                result = {"matched": True, "score": 40, "matches": [{"field": "topic", "snippets": [topic]}]}
        if result["matched"]:
            results.append({**session, "_search": result})

    return sorted(results, key=lambda s: s["_search"]["score"], reverse=True)
