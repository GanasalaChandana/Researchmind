"""Topic normalization for cache key generation.

Goals:
  "AI in healthcare"  ≡  "artificial intelligence in healthcare"
  "ML for finance"    ≡  "machine learning for finance"
  "  LLMs  "          ≡  "large language models"
  "COVID-19 vaccines" ≡  "covid 19 vaccines"

Pipeline:
  1. Lowercase + collapse whitespace
  2. Expand known abbreviations
  3. Remove stop words that don't carry meaning
  4. Sort remaining tokens so word order doesn't matter for cache hits
     (e.g. "trading AI stocks" ≡ "AI stocks trading")
  5. Rejoin and return a canonical string
"""
import re

# ── Abbreviation → full form map (all lowercase keys) ─────────────────────────
_EXPANSIONS: dict[str, str] = {
    "ai":       "artificial intelligence",
    "ml":       "machine learning",
    "dl":       "deep learning",
    "nlp":      "natural language processing",
    "cv":       "computer vision",
    "llm":      "large language model",
    "llms":     "large language models",
    "rl":       "reinforcement learning",
    "nn":       "neural network",
    "nns":      "neural networks",
    "gpt":      "generative pre-trained transformer",
    "bert":     "bidirectional encoder representations transformers",
    "rag":      "retrieval augmented generation",
    "iot":      "internet of things",
    "ar":       "augmented reality",
    "vr":       "virtual reality",
    "xr":       "extended reality",
    "api":      "application programming interface",
    "apis":     "application programming interfaces",
    "saas":     "software as a service",
    "paas":     "platform as a service",
    "iaas":     "infrastructure as a service",
    "b2b":      "business to business",
    "b2c":      "business to consumer",
    "roi":      "return on investment",
    "kpi":      "key performance indicator",
    "kpis":     "key performance indicators",
    "us":       "united states",
    "usa":      "united states",
    "uk":       "united kingdom",
    "eu":       "european union",
    "un":       "united nations",
    "covid":    "coronavirus",
    "covid-19": "coronavirus",
    "ev":       "electric vehicle",
    "evs":      "electric vehicles",
    "5g":       "fifth generation wireless",
    "6g":       "sixth generation wireless",
    "ceo":      "chief executive officer",
    "cto":      "chief technology officer",
    "cfo":      "chief financial officer",
    "hr":       "human resources",
    "r&d":      "research and development",
    "gdp":      "gross domestic product",
    "ipo":      "initial public offering",
    "etf":      "exchange traded fund",
    "etfs":     "exchange traded funds",
    "nft":      "non fungible token",
    "nfts":     "non fungible tokens",
    "defi":     "decentralized finance",
    "web3":     "web three",
    "dao":      "decentralized autonomous organization",
}

# ── Stop words to strip (articles, prepositions, conjunctions) ────────────────
_STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "about", "into", "through", "during",
    "is", "are", "was", "were", "be", "been", "being", "have", "has",
    "had", "do", "does", "did", "will", "would", "could", "should",
    "may", "might", "can", "that", "this", "these", "those", "it",
    "its", "how", "what", "why", "when", "where", "who", "which",
    "use", "using", "used",
}

_PUNCT_RE = re.compile(r"[^\w\s]")
_SPACE_RE = re.compile(r"\s+")


def normalize_topic(topic: str) -> str:
    """Return a canonical cache key for a research topic string."""
    # 1. Lowercase
    t = topic.lower().strip()

    # 2. Replace hyphens/underscores with spaces, strip other punctuation
    t = t.replace("-", " ").replace("_", " ")
    t = _PUNCT_RE.sub(" ", t)
    t = _SPACE_RE.sub(" ", t).strip()

    # 3. Expand abbreviations (whole-word match only)
    tokens = t.split()
    expanded: list[str] = []
    for tok in tokens:
        expanded.extend(_EXPANSIONS.get(tok, tok).split())

    # 4. Remove stop words
    meaningful = [tok for tok in expanded if tok not in _STOP_WORDS]

    # 5. Sort tokens for order-independence, deduplicate while preserving order
    seen: set[str] = set()
    deduped: list[str] = []
    for tok in sorted(meaningful):
        if tok not in seen:
            deduped.append(tok)
            seen.add(tok)

    return " ".join(deduped) if deduped else t
