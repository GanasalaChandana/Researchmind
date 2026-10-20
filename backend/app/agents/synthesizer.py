import json
import re
import asyncio
import logging
from groq import Groq
from typing import AsyncGenerator
from ..models.schemas import AgentEvent, Source, ResearchReport, KnowledgeGraph, Entity, Relationship
from ..tools.citation_repair import normalize_markers, repair_citations, add_missing_citations, prune_uncited_sources
from ..tools.kg_grounding import ground_knowledge_graph
from ..tools.llm_json import parse_llm_json
from ..tools.source_scorer import is_social_host
from ..tools.citation_verifier import verify_citations
from ..tools.groq_retry import groq_with_retry
from ..tools.groq_models import SMART_MODEL, FAST_MODEL
from ..tools.text_clean import clean_report_fields, clean_text, fix_number_spacing
from ..config import GROQ_API_KEY

logger = logging.getLogger(__name__)


GROQ_MODELS = {
    "fast":     FAST_MODEL,
    "balanced": SMART_MODEL,
    "deep":     SMART_MODEL,  # same model, higher max_tokens
}


_UNUSABLE_SUMMARY = re.compile(
    r"no substantive information|unable to fetch full content|generic youtube interface",
    re.IGNORECASE,
)


# A summary that mostly describes what a company sells (services, consultations,
# whitepapers...) says nothing about the topic, and invites made-up citations.
_PROMO = re.compile(
    r"specializes in|offers? (?:services|a free|free)|offering services|consult(?:ing|ation)|"
    r"engagement models|promotes|whitepapers|webinars|podcasts|book a demo|contact (?:us|the firm)|"
    r"free (?:ai )?(?:consultation|assessment|trial)|roi calculator|our (?:services|solutions|team)",
    re.IGNORECASE,
)


def is_promotional(summary: str) -> bool:
    return len(_PROMO.findall(summary or "")) >= 3


def _publisher(url: str) -> str:
    from urllib.parse import urlparse
    return (urlparse(url or "").netloc or "unknown").lower().removeprefix("www.")


def _url_year(url: str) -> str:
    """A year in the URL path (/2020/10/...) is often the only publication date we have."""
    m = re.search(r"/((?:19|20)\d\d)/(?:0?[1-9]|1[0-2])/", url or "")
    return m.group(1) if m else ""


def _title_key(title: str) -> str:
    t = re.sub(r"^\s*\[(pdf|html)\]\s*", "", (title or "").lower())
    t = re.split(r"\s[|\u2013\u2014-]\s", t)[0]
    return re.sub(r"[^a-z0-9]+", " ", t).strip()[:45]


def merge_duplicate_sources(sources: list[Source]) -> list[Source]:
    """The same paper often turns up twice (arXiv + a PDF mirror). Count it once, keep both texts."""
    by_key: dict[str, Source] = {}
    out: list[Source] = []
    for s in sorted(sources, key=lambda x: x.quality_score, reverse=True):
        key = _title_key(s.title)
        first = by_key.get(key) if len(key) >= 20 else None
        if first is None:
            if len(key) >= 20:
                by_key[key] = s
            out.append(s)
        elif s.summary and s.summary not in first.summary:
            first.summary = (first.summary + " " + s.summary)[:2500]
    return out


def rank_usable_sources(sources: list[Source]) -> list[Source]:
    """Sources the report may cite, in the exact order they are numbered [1], [2], ...

    This list is the single source of truth for citation numbers: the prompt, the
    citation verifier and the saved report must all use it (not the raw search
    order), otherwise "[4]" in the text points at the wrong reference.
    """
    for s in sources:  # normalize LLM/search-snippet typography (shown in the reference list)
        s.summary = clean_text(s.summary)
        s.title = clean_text(s.title)
    usable = [s for s in sources if s.summary and not _UNUSABLE_SUMMARY.search(s.summary)]
    if not usable:  # never end up with nothing to cite
        usable = [s for s in sources if s.summary]
    # Social posts and sales pages are not evidence: drop them whenever enough other sources remain.
    non_social = [s for s in usable if not is_social_host(s.url) and not is_promotional(s.summary)]
    if len(non_social) >= 3:
        usable = non_social
    usable = merge_duplicate_sources(usable)
    return sorted(usable, key=lambda s: s.quality_score, reverse=True)


async def synthesize(
    topic: str,
    session_id: str,
    sources: list[Source],
    sub_questions: list[str],
    language: str = "English",
    doc_contexts: list[dict] | None = None,
    model_tier: str = "balanced",
) -> AsyncGenerator[tuple[AgentEvent, ResearchReport | None], None]:
    model_id = GROQ_MODELS.get(model_tier, GROQ_MODELS["balanced"])
    max_report_tokens = 5000 if model_tier == "deep" else 3000
    client = Groq(api_key=GROQ_API_KEY)

    yield AgentEvent(
        type="synthesizing",
        agent="synthesizer",
        message="Building knowledge graph from extracted entities...",
    ), None

    # Sort by quality score so highest-authority sources are cited first.
    # Drop sources with no usable content (failed fetches, bare video pages): they
    # waste prompt space and just invite fabricated citations.
    ranked_sources = rank_usable_sources(sources)

    sources_text = "\n\n".join(
        f"[{i+1}] {s.title} [authority:{s.domain_authority}, score:{s.quality_score:.0f}/100]\nURL: {s.url}\nPublisher: {_publisher(s.url)}{(chr(10) + 'Year in URL: ' + _url_year(s.url)) if _url_year(s.url) else ''}\n{s.summary}"
        for i, s in enumerate(ranked_sources)
    )

    lang_instruction = f"\nIMPORTANT: Write all text in {language}." if language != "English" else ""

    # Build uploaded-document context block (truncated to ~4k chars each to stay within token limits)
    doc_context_text = ""
    if doc_contexts:
        doc_parts = []
        for d in doc_contexts:
            snippet = d["text_content"][:4000]
            doc_parts.append(f"[DOC: {d['filename']}]\n{snippet}")
        doc_context_text = "\n\nUser-uploaded documents (treat as primary sources, reference by filename):\n" + "\n\n".join(doc_parts)

    # Step 1: Extract knowledge graph
    kg_prompt = f"""Extract a knowledge graph from these research sources about: {topic}

Sources:
{sources_text}{doc_context_text}

Return a JSON object:
{{
  "entities": [
    {{"id": "e1", "name": "...", "type": "concept", "description": "..."}}
  ],
  "relationships": [
    {{"source_id": "e1", "target_id": "e2", "label": "...", "weight": 0.8}}
  ]
}}

Entity types: concept, person, organization, event, technology

Rules (important):
- Use ONLY names, descriptions, dates and numbers that appear in the sources above. Never add facts, versions, dates or numbers from your own knowledge.
- Do NOT expand acronyms or add alternative names unless a source does so itself.
- Each description must restate what a source says about that entity, in one sentence. If the sources say nothing about it, leave the entity out.
- Prefer the main subjects of the topic (products, organizations, techniques, findings). Skip bare numbers and one-off statistics. An entity name must be a thing (a concept, product, organization, technique or person), never a measurement or figure: "528 horsepower" or "38.4% CAGR" is a fact for a description, not an entity.
Extract up to 10 entities and up to 15 relationships. Return only valid JSON, no markdown.{lang_instruction}"""

    kg_response = await groq_with_retry(
        client,
        model=model_id,
        max_tokens=2000,
        messages=[{"role": "user", "content": kg_prompt}],
    )

    kg_raw = kg_response.choices[0].message.content.strip()
    kg_data = parse_llm_json(kg_raw, {"entities": [], "relationships": []})
    if not isinstance(kg_data, dict):
        kg_data = {"entities": [], "relationships": []}

    clean_report_fields({}, kg_data)
    _corpus = " ".join(f"{x.title} {x.summary}" for x in ranked_sources)
    for _e in kg_data.get("entities", []):
        _e["description"] = fix_number_spacing(str(_e.get("description", "")), _corpus)
    ground_knowledge_graph(kg_data, ranked_sources)
    kg = KnowledgeGraph(
        entities=[Entity(**e) for e in kg_data.get("entities", [])],
        relationships=[Relationship(**r) for r in kg_data.get("relationships", [])],
    )

    yield AgentEvent(
        type="synthesizing",
        agent="synthesizer",
        message=f"Extracted {len(kg.entities)} entities and {len(kg.relationships)} relationships",
        data={"knowledge_graph": {"entities": [e.model_dump() for e in kg.entities], "relationships": [r.model_dump() for r in kg.relationships]}},
    ), None

    # Step 2: Generate report
    yield AgentEvent(
        type="synthesizing",
        agent="synthesizer",
        message="Writing research report...",
    ), None

    report_prompt = f"""Write a comprehensive research report on: {topic}

Sources are ranked by authority score (higher = more credible). Prioritise high-authority sources when citing evidence. Cite by number like [1], [2]:
{sources_text}{doc_context_text}

Sub-questions addressed:
{chr(10).join(f"- {q}" for q in sub_questions)}

Return a JSON object:
{{
  "sections": [
    {{
      "heading": "section title",
      "content": "detailed content with inline citations like [1], [2]",
      "citations": [1, 2]
    }}
  ],
  "summary": "2-3 sentence executive summary, written AFTER the sections"
}}

Grounding rules (important):
- Use ONLY facts, figures and dates that appear in the numbered sources above. Do not add numbers, product specs, company names or forecasts from your own knowledge.
- Ignore words that only appear inside URLs; they are not evidence.
- Every sentence with a factual claim must be supported by the source you cite for it. Never cite a source for something it does not say.
- If the sources do not cover part of a sub-question, say plainly that the sources do not cover it instead of guessing. Label analysis or recommendations as such ("Analysis:").
- Put the citation right after every sentence that states a fact, and list every source a section uses in its "citations" array.
- Vendor and marketing pages describe what a company claims, not measured results. Write "the vendor says ..." for them and never call such claims "documented" or "proven".
- If a source covers a broader subject than the topic (for example AI in general when the topic is "AI bots"), say so in the section ("the sources discuss AI in general, not bots specifically") instead of presenting its findings as findings about the narrower topic.
- Keep every statistic attached to exactly what the source says it measures ("49% of leaders canceled projects" is not "49% of projects were canceled"). Keep numbers in the source's format, e.g. 127,000.
- Use a source only for the subject it covers. A market-size or product report is not evidence about hiring, jobs or workers, and a vendor survey is not evidence about the whole industry. If no source is about a sub-question, say so.
- Keep cause and effect the way the source states them; never reverse them (if a source says A drives B, do not write that B drives A).
- Cite with one number per bracket, like [1][2]. Never write [1, 2].
- Keep the source's own status words. If a source calls something "emerging", "proposed", "planned" or "claimed", do not write that it is "standard", "leading", "widely used" or that "most" organizations do it.
- Any named law, regulation, standard, product, company or date must appear in the source you cite for that sentence. If it does not, leave it out (do not add "such as GDPR" from your own knowledge).
- Cite a sentence only to the source(s) that state it. Do not add a second source just because it is on the same topic.
- When a statistic comes from a company's own blog or marketing page, name the publisher exactly as shown in that source's "Publisher:" line ("the cake.ai article says ...") instead of attributing it to "sources" in general. Never name a company or publisher that is not shown in the sources, and never guess a publisher from memory.
- Keep a source's own warnings about its figures ("lower confidence due to a small sample", "estimate", "2019 dollars") next to those figures.
- For a single study, give its design and size when the source does (e.g. "a 12-week study of 82 adults") and include any "larger studies are needed" or similar limit the source states, in the same sentence as the finding. An executive summary must not present such a finding more strongly than the section does.
- Refer to a source by its publisher or its study type at first mention ("CLS Health says ...", "a meta-analysis of randomized trials"), not as "the article", "the review" or "the vendor-style article".
- If two sources disagree (different numbers, or opposite statements, about the same thing), say so explicitly and name both, instead of presenting one as settled. Do not call two articles "the same data" or "the same survey" unless a source says so.
- Keep every qualifier a source attaches to a figure: "used" vs new, a region, a time period, "for a 30-mpg car". Never widen a figure to a broader group than the source covers.
- If a source shows "Year in URL" three or more years before today, say its age in the sentence ("a 2020 report").
- If a section says the sources lack a direct comparison or data point, the executive summary must say so too, and must not describe a trade-off across things the sources never compared.
- Do not put years, date ranges or numbers in section titles unless a source or the topic itself gives them.
- Never describe a trend, gain, improvement or comparison unless a source states it. Reasoning that goes beyond the sources must be labelled "Analysis:".
- The executive summary may only restate claims your sections make, with the same level of certainty. If the sections say the sources lack data on something, the summary must not claim it.
- Use plain ASCII punctuation: regular spaces and hyphens only.

Write 4-5 sections. Return only valid JSON, no markdown fences.{lang_instruction}"""

    report_response = await groq_with_retry(
        client,
        model=model_id,
        max_tokens=max_report_tokens,
        messages=[{"role": "user", "content": report_prompt}],
    )

    report_raw = report_response.choices[0].message.content.strip()
    report_data = parse_llm_json(report_raw, None)
    if not isinstance(report_data, dict) or not report_data.get("sections"):
        logger.warning("Report JSON could not be parsed (%d chars): %r", len(report_raw), report_raw[:200])
        raise ValueError("The model returned a report in an unreadable format. Please try again.")

    clean_report_fields(report_data, {})
    sections = report_data.get("sections", [])
    _corpus = " ".join(f"{x.title} {x.summary}" for x in ranked_sources)
    for _sec in sections:
        _sec["content"] = fix_number_spacing(_sec.get("content") or "", _corpus)
    report_data["summary"] = fix_number_spacing(report_data.get("summary", ""), _corpus)

    # Step 3: Verify citations
    yield AgentEvent(
        type="synthesizing",
        agent="synthesizer",
        message="Verifying citations against sources…",
    ), None

    for _sec in sections:
        _sec["content"] = normalize_markers(_sec.get("content") or "")
    report_data["summary"] = normalize_markers(report_data.get("summary", ""))
    repaired = repair_citations(sections, ranked_sources)
    added = add_missing_citations(sections, ranked_sources)
    if repaired or added:
        logger.info("Citations: repaired %d mis-numbered, added %d missing", repaired, added)
    summary_text = report_data.get("summary", "")
    before = len(ranked_sources)
    ranked_sources, summary_text = prune_uncited_sources(sections, summary_text, ranked_sources)
    for _sec in sections:  # "Sources: [3] [2] [5]" reads better as [2] [3] [5]
        if isinstance(_sec.get("citations"), list):
            _sec["citations"] = sorted({int(c) for c in _sec["citations"] if str(c).isdigit() or isinstance(c, int)})
    report_data["summary"] = summary_text
    if len(ranked_sources) < before:
        logger.info("Dropped %d uncited source(s) from the reference list", before - len(ranked_sources))
        # The graph was built from all sources; keep only what the remaining references support.
        kg_dict = {
            "entities": [e.model_dump() for e in kg.entities],
            "relationships": [r.model_dump() for r in kg.relationships],
        }
        ground_knowledge_graph(kg_dict, ranked_sources)
        kg = KnowledgeGraph(
            entities=[Entity(**e) for e in kg_dict["entities"]],
            relationships=[Relationship(**r) for r in kg_dict["relationships"]],
        )
    citation_checks = await verify_citations(sections, ranked_sources)

    # Inject verification results into each section
    for s_idx, section in enumerate(sections):
        checks = {}
        for cite_num in (section.get("citations") or []):
            key = f"{s_idx}:{cite_num}"
            if key in citation_checks:
                checks[str(cite_num)] = citation_checks[key]
        section["citation_checks"] = checks

    report = ResearchReport(
        session_id=session_id,
        topic=topic,
        summary=report_data.get("summary", ""),
        sections=sections,
        sources=ranked_sources,
        knowledge_graph=kg,
    )

    yield AgentEvent(
        type="done",
        agent="synthesizer",
        message="Research complete.",
        data={"report": report.model_dump()},
    ), report
