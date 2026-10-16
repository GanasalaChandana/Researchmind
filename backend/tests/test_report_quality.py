"""Regression tests for the issues seen in the first live gpt-oss report."""
from app.tools.text_clean import clean_text, clean_report_fields


def test_clean_text_fixes_chars_that_garbled_the_pdf():
    raw = "roughly 600 L, 0‑60 mph, $120 million, 45 %, Las Vegas"
    assert clean_text(raw) == "roughly 600 L, 0-60 mph, $120 million, 45 %, Las Vegas"


def test_clean_text_keeps_normal_unicode_and_non_strings():
    assert clean_text("Tesla’s “flying” car – 2029–2032") == \
        "Tesla’s “flying” car – 2029–2032"
    assert clean_text(None) is None and clean_text(5) == 5


def test_clean_report_fields_covers_summary_sections_and_graph():
    report = {"summary": "a b", "sections": [{"heading": "x‑y", "content": "1 kN", "citations": [1]}]}
    kg = {"entities": [{"id": "e1", "name": "10 thrusters", "description": "80 kN"}],
          "relationships": [{"source": "e1", "target": "e1", "label": "a b"}]}
    clean_report_fields(report, kg)
    assert report["summary"] == "a b"
    assert report["sections"][0] == {"heading": "x-y", "content": "1 kN", "citations": [1]}
    assert kg["entities"][0]["name"] == "10 thrusters" and kg["relationships"][0]["label"] == "a b"
