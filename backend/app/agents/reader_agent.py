from groq import Groq
from typing import AsyncGenerator
from ..models.schemas import AgentEvent, Source
from ..tools.url_reader import read_url
from ..config import GROQ_API_KEY


async def read_sources(sources: list[Source]) -> AsyncGenerator[tuple[AgentEvent, Source], None]:
    client = Groq(api_key=GROQ_API_KEY)

    for source in sources:
        yield AgentEvent(
            type="reading",
            agent="reader_agent",
            message=f"Reading: {source.title or source.url}",
        ), source

        content = await read_url(source.url)
        if not content:
            continue

        prompt = f"""Summarize the key information from this article in 3-5 sentences. Focus on facts, claims, and data points.

Title: {source.title}
Content:
{content}

Return only the summary, no preamble."""

        try:
            response = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=300,
                temperature=0.2,
            )
            source.summary = response.choices[0].message.content.strip()
        except Exception:
            pass  # keep the original DuckDuckGo snippet

        yield AgentEvent(
            type="reading",
            agent="reader_agent",
            message=f"Summarized: {source.title}",
            data={"url": source.url, "summary": source.summary},
        ), source
