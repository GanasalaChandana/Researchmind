from groq import Groq
from typing import AsyncGenerator
from ..models.schemas import AgentEvent, Source
from ..tools.url_reader import read_url
from ..tools.source_scorer import score_source
from ..config import GROQ_API_KEY


async def read_sources(sources: list[Source], language: str = "English") -> AsyncGenerator[tuple[AgentEvent, Source], None]:
    client = Groq(api_key=GROQ_API_KEY)

    for source in sources:
        yield AgentEvent(
            type="reading",
            agent="reader_agent",
            message=f"Reading: {source.title or source.url}",
        ), source

        content = await read_url(source.url)

        # Always update summary, even if content is empty
        if content:
            lang_instruction = f" Write the summary in {language}." if language != "English" else ""
            prompt = f"""Summarize the key information from this article in 3-5 sentences. Focus on facts, claims, and data points.{lang_instruction}

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
                # If summarization fails, keep the original snippet
                pass
        else:
            # If read_url fails, use original snippet if available
            if not source.summary:
                source.summary = f"Unable to fetch full content. URL: {source.url}"

        # Score the source after reading
        scores = score_source(source.url, source.title or "")
        source.quality_score = scores["quality_score"]
        source.domain_authority = scores["domain_authority"]
        source.recency_score = scores["recency_score"]

        yield AgentEvent(
            type="reading",
            agent="reader_agent",
            message=f"Summarized: {source.title or source.url}",
            data={"url": source.url, "summary": source.summary, "quality_score": source.quality_score},
        ), source
