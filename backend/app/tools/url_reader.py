import httpx
from bs4 import BeautifulSoup
import re
from urllib.parse import urljoin

from .url_safety import is_safe_public_url

_MAX_REDIRECTS = 3
_MAX_BYTES = 2_000_000  # don't buffer huge pages


async def read_url(url: str, max_chars: int = 8000) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; ResearchMind/1.0)"
    }
    try:
        # Follow redirects manually so every hop is checked against the SSRF policy.
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            current = url
            resp = None
            for _ in range(_MAX_REDIRECTS + 1):
                if not await is_safe_public_url(current):
                    return ""
                resp = await client.get(current, headers=headers)
                if resp.is_redirect and resp.headers.get("location"):
                    current = urljoin(current, resp.headers["location"])
                    continue
                break
            else:
                return ""
            resp.raise_for_status()
    except Exception:
        return ""

    if len(resp.content) > _MAX_BYTES:
        return ""

    soup = BeautifulSoup(resp.text, "lxml")

    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
        tag.decompose()

    text = soup.get_text(separator="\n")
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:max_chars]
