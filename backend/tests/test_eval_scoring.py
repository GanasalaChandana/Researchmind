"""The eval's scoring functions are deterministic; test them on hand-built reports."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "eval"))
from scoring import aggregate, score_report  # noqa: E402


def _report():
    return {
        "summary": "ok",
        "sources": [
            {"url": "https://a.com", "title": "A", "summary": "Output reached 447,450 vehicles in 2025."},
            {"url": "https://a.com", "title": "A again", "summary": "dup"},
            {"url": "https://b.com", "title": "B", "summary": "Costs start at $39,990."},
        ],
        "sections": [
            {"heading": "Production", "content": "Tesla built 447,450 cars [1] and 999 prototypes [1].", "citations": [1],
             "citation_checks": {"1": {"status": "verified"}}},
            {"heading": "Pricing", "content": "Starts at $39,990 [3], up to [9].", "citations": [3, 9],
             "citation_checks": {"3": {"status": "verified"}, "9": {"status": "unverified"}}},
            {"heading": "Outlook", "content": "No citation here.", "citations": []},
            {"heading": "Analysis and gaps", "content": "Analysis: not covered.", "citations": []},
        ],
    }


def test_score_report_counts_each_failure_mode():
    s = score_report(_report())
    assert s["duplicate_sources"] == 1
    assert s["bad_citation_refs"] == 2          # [9] inline and in the citations list
    assert s["uncited_sections"] == 1           # "Outlook"; the gap section is exempt
    assert s["verifier_total"] == 3 and s["verifier_verified"] == 2
    assert s["numbers_checked"] == 3            # 447,450 / 999 / 39,990 (9 is one digit)
    assert s["numbers_grounded"] == 2           # 999 is not in any cited source
    assert s["garbled_chars"] == 0


def test_garbled_characters_are_detected():
    r = _report()
    r["summary"] = "600 L"
    assert score_report(r)["garbled_chars"] == 1


def test_aggregate_ignores_failed_topics_for_quality_but_counts_completion():
    good = {"ok": True, "latency_s": 10, **score_report(_report())}
    rows = [good, {"ok": False, "latency_s": 5, "error": "x"}]
    a = aggregate(rows)
    assert a["completion_rate"] == 0.5 and a["completed"] == 1
    assert a["duplicate_sources_total"] == 1 and a["latency_median_s"] == 10
