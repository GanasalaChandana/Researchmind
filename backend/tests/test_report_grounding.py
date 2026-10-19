from types import SimpleNamespace as S

from app.tools.citation_repair import add_missing_citations, prune_uncited_sources
from app.tools.kg_grounding import ground_knowledge_graph
from app.tools.source_scorer import is_social_host, score_source

SRC = [
    S(title="Best AI Agents in 2026 | DataCamp", url="https://www.datacamp.com/x", summary="Perplexity Computer, launched in February 2026, is a multi-model orchestration platform that routes each subtask to the most suitable model. Google Antigravity, unveiled at Google I/O on May 19 2026, is an agent-first developer platform built on Gemini. DeepSeek Harness, open-sourced in August 2026, amassed over 160,000 GitHub stars."),
    S(title="AI Agents: Complete Overview", url="https://cogitx.ai/x", summary="Agentic AI is in production across software engineering, finance, healthcare, and business operations, with frameworks like MCP standardizing tool integration."),
    S(title="Best AI Agents ranked", url="https://mastra.ai/x", summary="Gartner predicts agentic AI will be the top strategic trend with 33 % of enterprise software incorporating it by 2028."),
    S(title="Deck on AI agents", url="https://www.facebook.com/groups/x/posts/1", summary="Meta-agents can autonomously design and fine-tune sub-models."),
]


def test_scorer_fixes_www_strip_bug_and_flags_social():
    # lstrip("www.") used to turn "wired.com" into "ired.com" so it never matched
    assert score_source("https://www.wired.com/story/x")["domain_authority"] == "high"
    assert score_source("https://wsj.com/a")["domain_authority"] == "high"
    assert is_social_host("https://www.facebook.com/groups/a")
    assert not is_social_host("https://www.datacamp.com/a")
    assert score_source("https://www.facebook.com/groups/a/posts/1")["quality_score"] < score_source("https://example.com/blog/x")["quality_score"]


def test_kg_invented_acronym_expansion_removed_and_unsupported_claims_replaced():
    kg = {
        "entities": [
            {"id": "e1", "name": "MCP (Multi-Component Protocol)", "type": "technology", "description": "2026 standard for tool integration in AI agents."},
            {"id": "e2", "name": "Gemini 3.8 Flash", "type": "technology", "description": "Used in Antigravity and benchmarked as top cost-effective model."},
            {"id": "e3", "name": "Google Antigravity", "type": "technology", "description": "Agent-first developer platform built on Gemini."},
            {"id": "e4", "name": "Quantum Banana", "type": "concept", "description": "Totally unrelated."},
        ],
        "relationships": [
            {"source_id": "e1", "target_id": "e3", "label": "x", "weight": 1},
            {"source_id": "e2", "target_id": "e3", "label": "x", "weight": 1},
            {"source_id": "e4", "target_id": "e3", "label": "x", "weight": 1},
        ],
    }
    out = ground_knowledge_graph(kg, SRC)
    names = {e["name"] for e in out["entities"]}
    assert "MCP" in names and "MCP (Multi-Component Protocol)" not in names
    assert "Quantum Banana" not in names
    assert "Gemini 3.8 Flash" not in names  # not in these sources at all
    antigravity = next(e for e in out["entities"] if e["id"] == "e3")
    assert "agent-first developer platform" in antigravity["description"].lower()
    ids = {e["id"] for e in out["entities"]}
    assert all(r["source_id"] in ids and r["target_id"] in ids for r in out["relationships"])


def test_kg_fabricated_number_triggers_regrounding():
    kg = {"entities": [{"id": "e1", "name": "DeepSeek Harness", "type": "technology", "description": "Open-source agent harness with over 900,000 GitHub stars."}], "relationships": []}
    out = ground_knowledge_graph(kg, SRC)
    assert "900,000" not in out["entities"][0]["description"]
    assert "160,000" in out["entities"][0]["description"]


def test_add_missing_citation_for_clearly_sourced_sentence():
    sec = {"content": "DeepSeek Harness was open-sourced in August 2026 and amassed over 160,000 GitHub stars. Analysis: teams should test it themselves.", "citations": []}
    assert add_missing_citations([sec], SRC) == 1
    assert "stars [1]." in sec["content"] and sec["citations"] == [1]
    assert sec["content"].endswith("themselves.")  # analysis stays uncited


def test_prune_uncited_sources_renumbers_everything():
    sections = [
        {"content": "Platform facts [1]. Production use [2].", "citations": [1, 2]},
        {"content": "Gartner view [3].", "citations": [3]},
    ]
    kept, summary = prune_uncited_sources(sections, "Summary cites [3] and [1].", SRC)
    assert [s.url for s in kept] == [SRC[0].url, SRC[1].url, SRC[2].url]  # facebook (4) dropped
    sections2 = [{"content": "A [1]. B [4].", "citations": [1, 4]}]
    kept2, summary2 = prune_uncited_sources(sections2, "S [4].", SRC)
    assert [s.url for s in kept2] == [SRC[0].url, SRC[3].url]
    assert sections2[0]["content"] == "A [1]. B [2]." and sections2[0]["citations"] == [1, 2]
    assert summary2 == "S [2]."


def test_prune_noop_when_few_cited():
    sec = [{"content": "Only one [1].", "citations": [1]}]
    kept, _ = prune_uncited_sources(sec, "", SRC)
    assert kept is SRC


def test_normalize_grouped_and_duplicate_markers():
    from app.tools.citation_repair import normalize_markers
    assert normalize_markers("privacy risks [3, 4] [3].") == "privacy risks [3][4] [3]."
    assert normalize_markers("x [3,4].") == "x [3][4]."
    assert normalize_markers("x [3] [3].") == "x [3]."
    assert normalize_markers("x [1][2].") == "x [1][2]."


def test_cached_reports_from_older_pipeline_are_ignored():
    from app.database import PIPELINE_VERSION, _is_current
    assert _is_current({"pipeline_version": PIPELINE_VERSION})
    assert not _is_current({"summary": "old cached report"})
    assert not _is_current({"pipeline_version": PIPELINE_VERSION - 1})
    assert not _is_current(None)
