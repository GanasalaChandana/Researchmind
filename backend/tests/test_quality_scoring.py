"""Tests for source quality scoring."""
from app.tools.source_scorer import score_source


# ── Domain authority ──────────────────────────────────────────────────────────

def test_high_authority_arxiv():
    s = score_source("https://arxiv.org/abs/2301.00001", "Some Paper")
    assert s["domain_authority"] == "high"
    assert s["quality_score"] >= 60


def test_high_authority_gov():
    s = score_source("https://www.cdc.gov/flu/index.htm", "CDC Flu Info")
    assert s["domain_authority"] == "high"
    assert s["quality_score"] >= 60


def test_high_authority_edu_subdomain():
    s = score_source("https://cs.mit.edu/research", "MIT CS Research")
    assert s["domain_authority"] == "high"


def test_medium_authority_medium_com():
    s = score_source("https://medium.com/article/ai-trends", "AI Trends")
    assert s["domain_authority"] == "medium"
    assert 20 <= s["quality_score"] < 70


def test_low_authority_unknown_domain():
    s = score_source("https://somerandomblog123.com/post", "Random Blog")
    assert s["domain_authority"] == "low"
    assert s["quality_score"] < 40


def test_org_tld_gets_medium_bump():
    s = score_source("https://somenonprofit.org/report", "Report")
    assert s["domain_authority"] == "medium"


# ── Recency scoring ───────────────────────────────────────────────────────────

def test_current_year_in_url_scores_high():
    from datetime import datetime
    year = datetime.now().year
    s = score_source(f"https://example.com/{year}/article", "Article")
    assert s["recency_score"] >= 1.0


def test_old_year_scores_low():
    s = score_source("https://example.com/2010/old-article", "Old Article")
    assert s["recency_score"] <= 0.25


def test_no_year_signal_returns_moderate():
    s = score_source("https://example.com/article", "No Date")
    assert 0.3 <= s["recency_score"] <= 0.5


# ── URL structure ─────────────────────────────────────────────────────────────

def test_https_scores_higher_than_http():
    https = score_source("https://example.com/article", "Article")
    http = score_source("http://example.com/article", "Article")
    assert https["quality_score"] >= http["quality_score"]


def test_pdf_url_gets_bonus():
    pdf = score_source("https://example.com/report.pdf", "Report")
    html = score_source("https://example.com/report", "Report")
    assert pdf["quality_score"] > html["quality_score"]


def test_research_path_gets_bonus():
    s = score_source("https://example.com/research/2024/study", "Study")
    assert s["quality_score"] > score_source("https://example.com/page", "Page")["quality_score"]


# ── Composite score bounds ────────────────────────────────────────────────────

def test_score_always_in_range():
    for url in [
        "https://arxiv.org/paper",
        "http://spam.xyz/ads?a=1&b=2&c=3&d=4",
        "https://nature.com/articles/2024/study.pdf",
        "https://unknown-site.io",
    ]:
        s = score_source(url, "title")
        assert 0 <= s["quality_score"] <= 100


def test_nature_beats_unknown():
    nature = score_source("https://nature.com/articles/study", "Nature Study")
    unknown = score_source("https://unknownblog.xyz/post", "Blog Post")
    assert nature["quality_score"] > unknown["quality_score"]
