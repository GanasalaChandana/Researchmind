import json
import re
import asyncio
from groq import Groq
from typing import AsyncGenerator
from ..models.schemas import AgentEvent
from ..config import GROQ_API_KEY


async def orchestrate(topic: str, depth: int) -> AsyncGenerator[AgentEvent, None]:
    client = Groq(api_key=GROQ_API_KEY)

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

    # Retry logic for rate limits
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=512,
                temperature=0.3,
            )
            break
        except Exception as e:
            if attempt < max_retries - 1 and ("rate" in str(e).lower() or "429" in str(e)):
                # Exponential backoff: 2s, 4s, 8s
                delay = 2 * (2 ** attempt)
                await asyncio.sleep(delay)
            else:
                raise

    raw = response.choices[0].message.content.strip()
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
