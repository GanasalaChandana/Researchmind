import asyncio
import logging
import httpx
from ..models.schemas import Source
from ..config import TAVILY_API_KEY
from .source_scorer import score_source
from .circuit_breaker import tavily_breaker, CircuitBreakerOpen

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
            async with tavily_breaker:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post("https://api.tavily.com/search", json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                    sources = []
                    for r in data.get("results", []):
                        url = r.get("url", "")
                        title = r.get("title", "")
                        scores = score_source(url, title)
                        sources.append(Source(
                            url=url,
                            title=title,
                            summary=r.get("content", ""),
                            relevance_score=r.get("score", 0.5),
                            quality_score=scores["quality_score"],
                            domain_authority=scores["domain_authority"],
                            recency_score=scores["recency_score"],
                        ))
                    # Return highest-quality sources first
                    return sorted(sources, key=lambda s: s.quality_score, reverse=True)
        except CircuitBreakerOpen as exc:
            logger.warning("Tavily circuit open, skipping search: %s", exc)
            return []
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
