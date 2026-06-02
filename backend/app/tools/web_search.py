import asyncio
from duckduckgo_search import DDGS
from ..models.schemas import Source


async def web_search(query: str, max_results: int = 5) -> list[Source]:
    """Search with retry logic to handle rate limiting"""
    sources = []
    max_retries = 3
    base_delay = 1

    for attempt in range(max_retries):
        try:
            with DDGS(timeout=10) as ddgs:
                results = list(ddgs.text(query, max_results=max_results))

            for r in results:
                sources.append(Source(
                    url=r.get("href", ""),
                    title=r.get("title", ""),
                    summary=r.get("body", ""),
                    relevance_score=1.0,
                ))
            return sources
        except Exception as e:
            if attempt < max_retries - 1:
                # Exponential backoff: 1s, 2s, 4s
                delay = base_delay * (2 ** attempt)
                await asyncio.sleep(delay)
            else:
                # Last attempt failed, return empty results
                return sources

    return sources
