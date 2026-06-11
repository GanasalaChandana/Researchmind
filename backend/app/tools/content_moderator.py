"""Lightweight input content moderation for research topics.

Blocks topics that contain hate speech, explicit content, instructions for
illegal activity, or personal data harvesting requests.
No external API needed — keyword + pattern matching with context-aware
false-positive reduction.
"""
import re

# ── Blocked pattern categories ────────────────────────────────────────────────

_HATE_SPEECH = [
    r"\bhow\s+to\s+(kill|murder|harm|hurt|attack|assault)\s+(a\s+)?(person|people|human|man|woman|child|kid)",
    r"\b(kill|exterminate|genocide)\s+(all\s+)?(jews|muslims|christians|blacks|whites|asians|latinos)",
    r"\b(nigger|faggot|chink|spic|kike|wetback)\b",
]

_ILLEGAL_INSTRUCTIONS = [
    r"\bhow\s+to\s+(make|build|create|synthesize|manufacture)\s+(a\s+)?(bomb|explosive|chemical\s+weapon|bioweapon|nerve\s+agent|meth|fentanyl|heroin)",
    r"\bhow\s+to\s+(hack|crack|break\s+into)\s+(someone|a\s+person|my\s+neighbour|my\s+neighbor)",
    r"\bhow\s+to\s+(stalk|dox|doxx|track)\s+(someone|a\s+person|my\s+ex)",
    r"\b(child\s+porn|csam|cp\s+download|lolita\s+porn)\b",
    r"\bhow\s+to\s+(launder|wash)\s+money\b",
    r"\bhow\s+to\s+buy\s+(illegal\s+)?(drugs|weapons|guns|firearms)\s+online",
    r"\bhow\s+to\s+avoid\s+(being\s+)?(caught|detected)\s+(by\s+)?(police|fbi|authorities)",
]

_EXPLICIT = [
    r"\b(porn|pornography|hentai|xxx)\s+(of|featuring|with)\s+(child|minor|teen|underage)",
]

_PERSONAL_DATA_HARVEST = [
    r"\b(find|get|steal|harvest)\s+(someone.s\s+)?(ssn|social\s+security|credit\s+card\s+number|bank\s+account|password)",
    r"\bhow\s+to\s+(phish|spear.?phish)\s+(employees|users|people)",
]

_ALL_PATTERNS = (
    _HATE_SPEECH + _ILLEGAL_INSTRUCTIONS + _EXPLICIT + _PERSONAL_DATA_HARVEST
)

_COMPILED: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE | re.DOTALL) for p in _ALL_PATTERNS
]

# ── Safe-harbour phrases that override a pattern match ───────────────────────
# e.g. "history of chemical weapons" is legitimate research.
_SAFE_CONTEXT = re.compile(
    r"\b(history|historical|prevention|policy|legislation|ethics|detection|"
    r"counter|defence|defense|academic|research|study|analysis|impact|effects?\s+of)\b",
    re.IGNORECASE,
)


def moderate_topic(topic: str) -> tuple[bool, str]:
    """Check a research topic for policy violations.

    Returns (is_blocked: bool, reason: str).
    reason is empty string when not blocked.
    """
    if not topic or not topic.strip():
        return False, ""

    text = topic.strip()

    for pattern in _COMPILED:
        if pattern.search(text):
            # Check for safe academic context that overrides the block
            if _SAFE_CONTEXT.search(text):
                continue
            return True, "This topic cannot be researched due to content policy."

    return False, ""
