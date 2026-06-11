import asyncio
import logging
import httpx
from ..models.schemas import Source
from ..config import TAVILY_API_KEY

logger = logging.getLogger(__name__)

_RATE_LIMIT_SIGNALS = ("429", "rate limit", "too many requests")


async def web_search(query: str, max_results: int = 5, max_retries: int = 3) -> list[Source]:
    """Search using Tavily API with exponential backoff retry on rate-limit errors."""
    payload = {
        "api_key": TAVILY_API_KEY,
        "query": query,
        "max_results": min(max_results, 5),
        "search_depth": "basic",
        "include_answer": False,
    }

    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post("https://api.tavily.com/search", json=payload)
                resp.raise_for_status()
                data = resp.json()
                return [
                    Source(
                        url=r.get("url", ""),
                        title=r.get("title", ""),
                        summary=r.get("content", ""),
                        relevance_score=r.get("score", 0.5),
                    )
                    for r in data.get("results", [])
                ]
        except Exception as exc:
            msg = str(exc).lower()
            is_rate_limit = any(sig in msg for sig in _RATE_LIMIT_SIGNALS)
            if is_rate_limit and attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                logger.warning("Tavily rate limit hit (attempt %d/%d), retrying in %ds", attempt + 1, max_retries, wait)
                await asyncio.sleep(wait)
                continue
            raise Exception(f"Web search failed: {exc}") from exc

    return []
