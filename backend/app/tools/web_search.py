import httpx
from ..models.schemas import Source
from ..config import TAVILY_API_KEY


async def web_search(query: str, max_results: int = 5) -> list[Source]:
    """Search using Tavily API with structured results"""
    sources = []

    try:
        payload = {
            "api_key": TAVILY_API_KEY,
            "query": query,
            "max_results": min(max_results, 5),
            "search_depth": "basic",
            "include_answer": False,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json=payload
            )
            resp.raise_for_status()
            data = resp.json()

            for result in data.get("results", []):
                sources.append(Source(
                    url=result.get("url", ""),
                    title=result.get("title", ""),
                    summary=result.get("content", ""),
                    relevance_score=result.get("score", 0.5),
                ))
    except Exception as e:
        raise Exception(f"Web search failed: {str(e)}")

    return sources
