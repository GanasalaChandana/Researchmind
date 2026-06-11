"""Tests for topic normalization cache-key logic."""
from app.tools.topic_normalizer import normalize_topic


# ── Abbreviation expansion ────────────────────────────────────────────────────

def test_ai_expands():
    assert "artificial intelligence" in normalize_topic("AI")


def test_ml_expands():
    result = normalize_topic("ML for finance")
    assert "machine" in result and "learning" in result


def test_llm_expands():
    result = normalize_topic("LLMs in production")
    assert "large" in result and "language" in result


def test_nlp_expands():
    result = normalize_topic("NLP")
    assert "natural" in result and "language" in result and "processing" in result


# ── Synonym equivalence ───────────────────────────────────────────────────────

def test_ai_variants_are_equivalent():
    assert normalize_topic("AI in healthcare") == normalize_topic("artificial intelligence in healthcare")


def test_ml_variants_are_equivalent():
    assert normalize_topic("ML for finance") == normalize_topic("machine learning for finance")


def test_ev_expands():
    assert normalize_topic("EVs adoption") == normalize_topic("electric vehicles adoption")


# ── Stop word removal ─────────────────────────────────────────────────────────

def test_articles_removed():
    assert normalize_topic("the impact of AI") == normalize_topic("impact of AI")


def test_prepositions_removed():
    assert normalize_topic("AI in healthcare") == normalize_topic("AI healthcare")


# ── Order independence ────────────────────────────────────────────────────────

def test_word_order_ignored():
    assert normalize_topic("stock trading AI") == normalize_topic("AI stock trading")


def test_whitespace_collapsed():
    assert normalize_topic("  AI   healthcare  ") == normalize_topic("AI healthcare")


# ── Case insensitivity ────────────────────────────────────────────────────────

def test_case_insensitive():
    assert normalize_topic("Artificial Intelligence") == normalize_topic("artificial intelligence")


def test_mixed_case_abbreviation():
    assert normalize_topic("Ai In Healthcare") == normalize_topic("ai in healthcare")


# ── Output is deterministic ───────────────────────────────────────────────────

def test_idempotent():
    result = normalize_topic("AI for stock trading")
    assert normalize_topic(result) == result


def test_empty_string_safe():
    result = normalize_topic("   ")
    assert isinstance(result, str)
