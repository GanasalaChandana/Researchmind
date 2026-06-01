from duckduckgo_search import DDGS
from ..models.schemas import Source


async def web_search(query: str, max_results: int = 5) -> list[Source]:
    sources = []
    with DDGS() as ddgs:
        results = list(ddgs.text(query, max_results=max_results))
    for r in results:
        sources.append(Source(
            url=r.get("href", ""),
            title=r.get("title", ""),
            summary=r.get("body", ""),
            relevance_score=1.0,
        ))
    return sources
