import json
import re
import asyncio
from groq import Groq
from typing import AsyncGenerator
from ..models.schemas import AgentEvent, Source, ResearchReport, KnowledgeGraph, Entity, Relationship
from ..config import GROQ_API_KEY


async def synthesize(
    topic: str,
    session_id: str,
    sources: list[Source],
    sub_questions: list[str],
) -> AsyncGenerator[tuple[AgentEvent, ResearchReport | None], None]:
    client = Groq(api_key=GROQ_API_KEY)

    yield AgentEvent(
        type="synthesizing",
        agent="synthesizer",
        message="Building knowledge graph from extracted entities...",
    ), None

    sources_text = "\n\n".join(
        f"[{i+1}] {s.title}\nURL: {s.url}\n{s.summary}"
        for i, s in enumerate(sources)
        if s.summary
    )

    # Step 1: Extract knowledge graph
    kg_prompt = f"""Extract a knowledge graph from these research sources about: {topic}

Sources:
{sources_text}

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
Extract 8-12 entities and 8-15 relationships. Return only valid JSON, no markdown."""

    kg_response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=2000,
        messages=[{"role": "user", "content": kg_prompt}],
    )

    kg_raw = kg_response.choices[0].message.content.strip()
    try:
        kg_data = json.loads(kg_raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", kg_raw, re.DOTALL)
        kg_data = json.loads(match.group()) if match else {"entities": [], "relationships": []}

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

Sources (cite by number like [1], [2]):
{sources_text}

Sub-questions addressed:
{chr(10).join(f"- {q}" for q in sub_questions)}

Return a JSON object:
{{
  "summary": "2-3 sentence executive summary",
  "sections": [
    {{
      "heading": "section title",
      "content": "detailed content with inline citations like [1], [2]",
      "citations": [1, 2]
    }}
  ]
}}

Write 4-5 sections. Return only valid JSON, no markdown fences."""

    report_response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=3000,
        messages=[{"role": "user", "content": report_prompt}],
    )

    report_raw = report_response.choices[0].message.content.strip()
    try:
        report_data = json.loads(report_raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", report_raw, re.DOTALL)
        report_data = json.loads(match.group()) if match else {"summary": "", "sections": []}

    report = ResearchReport(
        session_id=session_id,
        topic=topic,
        summary=report_data.get("summary", ""),
        sections=report_data.get("sections", []),
        sources=sources,
        knowledge_graph=kg,
    )

    yield AgentEvent(
        type="done",
        agent="synthesizer",
        message="Research complete.",
        data={"report": report.model_dump()},
    ), report
