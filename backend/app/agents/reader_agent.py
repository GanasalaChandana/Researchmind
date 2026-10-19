import logging
from groq import Groq
from typing import AsyncGenerator
from ..models.schemas import AgentEvent, Source
from ..tools.url_reader import read_url
from ..tools.source_scorer import score_source
from ..config import GROQ_API_KEY
from ..tools.groq_retry import groq_with_retry
from ..tools.groq_models import SMART_MODEL, FAST_MODEL

logger = logging.getLogger(__name__)

# Enough for a 3-5 sentence summary; sending the full 8000 chars x 6 sources burns the
# free-tier per-minute token budget for little benefit.
_MAX_ARTICLE_CHARS = 3500


async def read_sources(sources: list[Source], language: str = "English") -> AsyncGenerator[tuple[AgentEvent, Source], None]:
    client = Groq(api_key=GROQ_API_KEY)

    for source in sources:
        yield AgentEvent(
            type="reading",
            agent="reader_agent",
            message=f"Reading: {source.title or source.url}",
        ), source

        content = await read_url(source.url)
        if not content and source.summary and len(source.summary) >= 200:
            # Page couldn't be fetched (bot-blocked, video page...). The search snippet is
            # still real text: summarize it so the reference list doesn't show raw scraped markup.
            content = source.summary

        # Always update summary, even if content is empty
        if content:
            lang_instruction = f" Write the summary in {language}." if language != "English" else ""
            prompt = f"""Summarize the key information from this article in 3-5 sentences. Focus on facts, claims, and data points.{lang_instruction}

Title: {source.title}
Content:
{content[:_MAX_ARTICLE_CHARS]}

Return only the summary, no preamble."""

            try:
                response = await groq_with_retry(
                    client,
                    model=FAST_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=300,
                    temperature=0.2,
                )
                source.summary = response.choices[0].message.content.strip()
            except Exception as exc:
                logger.warning("Summarization failed for %s: %s", source.url, exc)
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
