import json
import re
import asyncio
from anthropic import Anthropic
from typing import AsyncGenerator
from ..models.schemas import AgentEvent
from ..config import ANTHROPIC_API_KEY


async def orchestrate(topic: str, depth: int) -> AsyncGenerator[AgentEvent, None]:
    client = Anthropic(api_key=ANTHROPIC_API_KEY)

    yield AgentEvent(
        type="thinking",
        agent="orchestrator",
        message=f'Analyzing topic: "{topic}"',
    )

    prompt = f"""You are a research orchestrator. Break this research topic into {depth} specific sub-questions that together give a comprehensive understanding.

Topic: {topic}

Return a JSON object with this exact structure:
{{
  "sub_questions": ["question 1", "question 2", ...],
  "research_angle": "brief description of the overall research approach"
}}

Return only valid JSON, no markdown fences."""

    # Call Claude API (much more reliable than Groq free tier)
    response = client.messages.create(
        model="claude-opus-4-1",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        parsed = json.loads(match.group()) if match else {"sub_questions": [topic], "research_angle": ""}

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
