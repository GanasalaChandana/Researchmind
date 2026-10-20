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


def test_promotional_summary_detected_and_dropped():
    from app.agents.synthesizer import is_promotional, rank_usable_sources
    promo = ("Auxiliobits is a technology firm that specializes in autonomous AI agents, offering services such as "
             "consulting and process automation. The company provides engagement models and promotes tools like an "
             "ROI Calculator. It also offers educational resources (whitepapers, webinars, podcasts) and a free AI consultation.")
    real = "AI governance reduces incidents and boosts stakeholder confidence in security and compliance."
    assert is_promotional(promo) and not is_promotional(real)
    srcs = [S(title=f"t{i}", url=f"https://example{i}.com/a", summary=real + f" extra {i}", quality_score=50.0) for i in range(3)]
    srcs.append(S(title="promo", url="https://auxiliobits.com/x", summary=promo, quality_score=90.0))
    kept = rank_usable_sources(srcs)
    assert all(k.title != "promo" for k in kept) and len(kept) == 3
    # with too few real sources the promo page is kept rather than leaving nothing to cite
    assert len(rank_usable_sources(srcs[2:])) == 2


def test_kg_regrounded_against_remaining_sources_drops_facts_from_pruned_source():
    kept = [S(title="Benefits of AI", url="https://a.edu/x", summary="AI is a critical driver of efficiency and productivity across healthcare and finance.")]
    kg = {"entities": [
        {"id": "e1", "name": "Microsoft 365 Copilot", "type": "technology", "description": "Evaluated as a leading platform for agentic Enterprise AI assistance."},
        {"id": "e2", "name": "AI", "type": "concept", "description": "AI is a critical driver of efficiency and productivity across healthcare and finance."},
    ], "relationships": [{"source_id": "e1", "target_id": "e2", "label": "x", "weight": 1}]}
    out = ground_knowledge_graph(kg, kept)
    assert [e["name"] for e in out["entities"]] == ["AI"] and out["relationships"] == []


def test_marker_glued_to_word_gets_a_space():
    from app.tools.citation_repair import normalize_markers
    assert normalize_markers("harder than a year earlier[3]. Next[4][5].") == "harder than a year earlier [3]. Next [4][5]."
    assert normalize_markers("fine [3].") == "fine [3]."


def test_number_spacing_restored_only_when_sources_use_commas():
    from app.tools.text_clean import fix_number_spacing
    corpus = "about 127,000 jobs and 95,667 layoffs"
    assert fix_number_spacing("127 000 jobs, 95 667 layoffs", corpus) == "127,000 jobs, 95,667 layoffs"
    assert fix_number_spacing("in 5 100 cases", corpus) == "in 5 100 cases"


def test_kg_numbers_must_come_from_the_same_source():
    srcs = [
        S(title="Entry level", url="https://a.com/1", summary="The entry-level software engineer market shows a 10% projected growth for developers."),
        S(title="Stanford", url="https://b.com/2", summary="A study reports a 13% decline in employment for early-career engineers in AI-exposed roles."),
    ]
    kg = {"entities": [{"id": "e1", "name": "Entry-Level Software Engineer", "type": "concept",
                        "description": "Entry-level software engineer market shows 10% projected growth and a 13% decline in employment for early-career engineers."}],
          "relationships": []}
    out = ground_knowledge_graph(kg, srcs)
    desc = out["entities"][0]["description"]
    assert not ("10%" in desc and "13%" in desc)


def test_kg_entity_with_invented_name_word_dropped_even_if_title_matches():
    srcs = [S(title="Tech Job Market 2026: Layoffs, AI Salaries, and Hiring Data - Pin", url="https://www.pin.com/x",
              summary="US tech job listings are roughly 36% below their February 2020 baseline while machine-learning engineer openings are up 59%.")]
    kg = {"entities": [
        {"id": "e1", "name": "Glocomms Tech Careers 2026", "type": "organization", "description": "Tech Job Market 2026: Layoffs, AI Salaries, and Hiring Data - Pin."},
        {"id": "e2", "name": "Tech job listings", "type": "concept", "description": "US tech job listings are roughly 36% below their February 2020 baseline."},
    ], "relationships": []}
    out = ground_knowledge_graph(kg, srcs)
    assert [e["name"] for e in out["entities"]] == ["Tech job listings"]


def test_verifier_judges_the_sentence_carrying_the_marker():
    from app.tools.citation_verifier import _build_tasks
    class Src:
        title = "T"; summary = "RAG retrieves documents before generating."
    sections = [{"content": "Intro about markets. RAG retrieves documents first [2]. Other unrelated claim about cost [3].", "citations": [2]}]
    tasks = _build_tasks(sections, [Src(), Src(), Src()])
    assert "retrieves documents" in tasks[0]["section_snippet"]
    assert "unrelated" not in tasks[0]["section_snippet"]


def test_verifier_batches_large_reports(monkeypatch):
    import asyncio
    from app.tools import citation_verifier as cv
    calls = []
    class FakeResp:
        def __init__(s, n): s.choices = [type("C", (), {"message": type("M", (), {"content": "[" + ",".join(f'{{"task":{i+1},"status":"verified","reason":"ok"}}' for i in range(n)) + "]"})()})()]
    class FakeClient:
        def __init__(s, **k):
            s.chat = type("X", (), {"completions": s})()
        def create(s, **kw):
            n = kw["messages"][0]["content"].count("] cite") or kw["messages"][0]["content"].count("[cite ")
            calls.append(n); return FakeResp(n)
    monkeypatch.setattr(cv, "Groq", FakeClient)
    class Src:
        title = "T"; summary = "x"
    sections = [{"content": " ".join(f"Claim {i} [{i}]." for i in range(1, 21)), "citations": list(range(1, 21))}]
    out = asyncio.new_event_loop().run_until_complete(cv.verify_citations(sections, [Src()] * 20))
    assert len(calls) == 3 and len(out) == 20


def test_kg_drops_description_that_is_really_about_another_concept():
    from app.tools.kg_grounding import ground_knowledge_graph
    class S:
        title = "RAG review"
        summary = "Retrieval-Augmented Generation (RAG) combines large language models with information-retrieval systems to reduce hallucinations."
    kg = {"entities": [
        {"id": "1", "name": "Retrieval-Augmented Generation (RAG)", "description": "RAG combines large language models with information-retrieval systems to reduce hallucinations."},
        {"id": "2", "name": "large language models", "description": "Retrieval-Augmented Generation (RAG) combines large language models with information-retrieval systems to reduce hallucinations."},
    ], "relationships": []}
    out = ground_knowledge_graph(kg, [S()])
    assert [e["name"] for e in out["entities"]] == ["Retrieval-Augmented Generation (RAG)"]


def test_duplicate_papers_are_merged_into_one_source():
    from app.agents.synthesizer import merge_duplicate_sources
    from app.models.schemas import Source
    a = Source(title="Keyword search is all you need: Achieving RAG-Level Performance without vector databases", url="https://arxiv.org/x", summary="Finding A about accuracy.", quality_score=0.9)
    b = Source(title="[PDF] Keyword search is all you need: Achieving RAG-Level Performance ...", url="https://amazon.science/x.pdf", summary="Finding B about latency.", quality_score=0.8)
    c = Source(title="Totally different article about chunking strategies", url="https://e.com", summary="Other.", quality_score=0.5)
    out = merge_duplicate_sources([b, a, c])
    assert len(out) == 2 and "Finding B" in out[0].summary and out[0].url == "https://arxiv.org/x"


def test_kg_fallback_needs_every_name_word_and_never_cuts_mid_word():
    from app.tools.kg_grounding import _best_sentence, _clip, _terms
    texts = ["Enterprise RAG is the standard architecture for grounding LLM responses with an offline ingestion pipeline (chunking, embedding, vector-DB indexing)."]
    assert _best_sentence(_terms("knowledge index"), texts, "knowledge index") == ""
    long = "word " * 80
    assert not _clip(long).replace("…", "").endswith("wor")
    assert _clip(long).endswith("…")


def test_publisher_is_taken_from_the_url():
    from app.agents.synthesizer import _publisher
    assert _publisher("https://www.cake.ai/blog/x") == "cake.ai"
