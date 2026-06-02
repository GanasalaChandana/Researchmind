from typing import AsyncGenerator
from urllib.parse import urlparse
from ..models.schemas import AgentEvent, Source
from ..tools.web_search import web_search


def _normalize_url(url: str) -> str:
    """Normalize URL for deduplication (remove trailing slash, query params)"""
    parsed = urlparse(url)
    # Use scheme + netloc + path (without query/fragment)
    normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip('/')
    return normalized


async def search(sub_questions: list[str]) -> AsyncGenerator[tuple[AgentEvent, list[Source]], None]:
    """
    Searches each sub-question and yields (event, sources) tuples.
    Sources are deduplicated by URL across all questions.
    """
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    all_sources: list[Source] = []

    for i, question in enumerate(sub_questions):
        yield AgentEvent(
            type="searching",
            agent="search_agent",
            message=f"Searching: {question}",
        ), []

        try:
            results = await web_search(question, max_results=4)
        except Exception as e:
            yield AgentEvent(
                type="searching",
                agent="search_agent",
                message=f"Search failed for: {question} ({e})",
            ), []
            continue

        # Deduplicate by normalized URL AND by title (to catch exact duplicates)
        new_sources = []
        for s in results:
            norm_url = _normalize_url(s.url)
            title_lower = s.title.lower().strip() if s.title else ""
            if norm_url not in seen_urls and title_lower not in seen_titles:
                new_sources.append(s)
                seen_urls.add(norm_url)
                seen_titles.add(title_lower)

        all_sources.extend(new_sources)

        yield AgentEvent(
            type="searching",
            agent="search_agent",
            message=f"Found {len(new_sources)} new sources for: {question}",
            data={"sources": [s.model_dump() for s in new_sources]},
        ), new_sources
