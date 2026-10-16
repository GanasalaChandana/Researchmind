"""Citation numbers in the text must match the reference list order."""
import asyncio
import json
from types import SimpleNamespace

from app.agents import synthesizer
from app.models.schemas import Source


def _src(title, url, summary, q):
    return Source(url=url, title=title, summary=summary, relevance_score=0.5,
                  quality_score=q, domain_authority="medium", recency_score=50)


def test_rank_usable_sources_drops_junk_and_orders_by_quality():
    srcs = [
        _src("low", "https://a.com", "real content", 10),
        _src("yt", "https://youtube.com/x", "The article provides no substantive information.", 90),
        _src("failed", "https://b.com", "Unable to fetch full content. URL: https://b.com", 80),
        _src("high", "https://c.com", "real content", 70),
    ]
    assert [s.title for s in synthesizer.rank_usable_sources(srcs)] == ["high", "low"]


def test_report_sources_match_prompt_numbering(monkeypatch):
    srcs = [_src("low", "https://a.com", "aaa", 10), _src("high", "https://c.com", "ccc", 70)]
    prompts, checked = [], {}

    async def fake_llm(client, **kw):
        prompts.append(kw["messages"][0]["content"])
        body = ({"entities": [], "relationships": []} if len(prompts) == 1 else
                {"summary": "s", "sections": [{"heading": "h", "content": "x [1]", "citations": [1]}]})
        msg = SimpleNamespace(content=json.dumps(body))
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)])

    async def fake_verify(sections, sources):
        checked["titles"] = [s.title for s in sources]
        return {}

    monkeypatch.setattr(synthesizer, "groq_with_retry", fake_llm)
    monkeypatch.setattr(synthesizer, "verify_citations", fake_verify)

    async def run():
        out = None
        async for _ev, report in synthesizer.synthesize("t", "sid", srcs, ["q"]):
            out = report or out
        return out

    loop = asyncio.new_event_loop()
    try:
        report = loop.run_until_complete(run())
    finally:
        loop.close()

    assert "[1] high" in prompts[1] and "[2] low" in prompts[1]      # numbering used in the prompt
    assert [s.title for s in report.sources] == ["high", "low"]      # reference list uses the same order
    assert checked["titles"] == ["high", "low"]                      # verifier checks against it too
