import httpx
from bs4 import BeautifulSoup
import re


async def read_url(url: str, max_chars: int = 8000) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; ResearchMind/1.0)"
    }
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
    except Exception:
        return ""

    soup = BeautifulSoup(resp.text, "lxml")

    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
        tag.decompose()

    text = soup.get_text(separator="\n")
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:max_chars]
