import json
from ..tools.llm_json import parse_llm_json
import re
import asyncio
from groq import Groq
from typing import AsyncGenerator
from ..models.schemas import AgentEvent
from ..config import GROQ_API_KEY
from ..tools.groq_retry import groq_with_retry
from ..tools.groq_models import SMART_MODEL, FAST_MODEL


async def orchestrate(topic: str, depth: int, language: str = "English") -> AsyncGenerator[AgentEvent, None]:
    client = Groq(api_key=GROQ_API_KEY)

    yield AgentEvent(
        type="thinking",
        agent="orchestrator",
        message=f'Analyzing topic: "{topic}"',
    )

    lang_instruction = (
        f"\nIMPORTANT: Write all sub_questions and research_angle in {language}."
        if language != "English" else ""
    )

    prompt = f"""You are a research orchestrator. Break this research topic into {depth} specific sub-questions that together give a comprehensive understanding.

Topic: {topic}{lang_instruction}

Rules for the sub-questions:
- Stay on the topic's exact subject. Keep its key terms in the questions ("AI bots" means bots, not AI in general); do not widen the topic.
- If the topic contains a vague term, say in research_angle how you interpreted it.
- Do not invent specific company names, years or figures in sub-questions. Only name a company, product or date if the topic itself does.
- For topics about news, trends, markets or impact, include one sub-question that looks for contrary or negative evidence (downsides, declines, layoffs, failures, criticism) so the report is not one-sided.
- For topics about impact, effects, benefits, risks or effectiveness, include one sub-question worded to find independent evidence ("systematic review", "randomized trial", "national survey", "peer-reviewed study"), not company descriptions.
- Each sub-question must work as a web search on its own, with names, places and years where relevant.

Return a JSON object with this exact structure:
{{
  "sub_questions": ["question 1", "question 2", ...],
  "research_angle": "brief description of the overall research approach"
}}

Return only valid JSON, no markdown fences."""

    response = await groq_with_retry(
        client,
        model=SMART_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.choices[0].message.content.strip()
    parsed = parse_llm_json(raw, None)
    if not isinstance(parsed, dict):
        parsed = {"sub_questions": [topic], "research_angle": ""}

    sub_questions = parsed.get("sub_questions", [topic])
    angle = parsed.get("research_angle", "")

    yield AgentEvent(
        type="thinking",
        agent="orchestrator",
        message=f"Research angle: {angle}",
        data={"sub_questions": sub_questions, "research_angle": angle},
    )

    for i, q in enumerate(sub_questions):
        yield AgentEvent(
            type="thinking",
            agent="orchestrator",
            message=f"Sub-question {i + 1}: {q}",
        )
