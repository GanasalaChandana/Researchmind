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


def test_subscript_digits_become_plain_digits():
    assert clean_text("2 kg CO₂e per kg") == "2 kg CO2e per kg"


def test_clean_text_strips_emoji_and_replaces_bullets():
    from app.tools.text_clean import clean_text
    assert clean_text("Sale \U0001F6D2 now") == "Sale  now"
    assert clean_text("a • b…") == "a - b..."


def test_normalize_redis_url_handles_pasted_commands_and_quotes():
    from app.tools.cache import normalize_redis_url
    url = "rediss://default:pw123@fine-name-1.upstash.io:6379"
    assert normalize_redis_url(url) == url
    assert normalize_redis_url(f'  "{url}"  ') == url
    assert normalize_redis_url(f"redis-cli --tls -u {url}") == url
    assert normalize_redis_url("") == ""
    assert normalize_redis_url("fine-name-1.upstash.io:6379") == "fine-name-1.upstash.io:6379"


def test_normalize_redis_url_upgrades_tls_for_upstash():
    from app.tools.cache import normalize_redis_url
    cmd = "redis-cli --tls -u redis://default:pw@x-1.upstash.io:6379"
    assert normalize_redis_url(cmd) == "rediss://default:pw@x-1.upstash.io:6379"
    assert normalize_redis_url("redis://default:pw@x-1.upstash.io:6379") == "rediss://default:pw@x-1.upstash.io:6379"
    assert normalize_redis_url("redis://localhost:6379") == "redis://localhost:6379"
