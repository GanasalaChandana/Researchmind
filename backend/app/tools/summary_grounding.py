"""Keep invented figures out of source summaries.

A summary is written by a small model from a truncated page. If a number is not in the text the
model was given, it was made up (or recalled), and everything downstream would treat it as fact.
"""
import logging
import re

logger = logging.getLogger(__name__)

_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“(\[])")


def _norm_number(tok: str) -> str:
    tok = tok.replace(",", "").rstrip(".")
    return tok.lstrip("0") or "0" if "." not in tok else tok.rstrip("0").rstrip(".").lstrip("0") or "0"


def _content_numbers(content: str) -> set[str]:
    return {_norm_number(n) for n in _NUMBER.findall(content or "")}


def _is_trivial(tok: str, following: str) -> bool:
    """Small whole numbers ("five" written as 5, "3 studies") are not worth checking."""
    return "." not in tok and "," not in tok and tok.isdigit() and int(tok) <= 10 and not following.lstrip().startswith("%")


def unsupported_numbers(sentence: str, content_nums: set[str]) -> list[str]:
    bad = []
    for m in _NUMBER.finditer(sentence):
        tok = m.group(0)
        if _is_trivial(tok.rstrip("."), sentence[m.end():m.end() + 2]):
            continue
        if _norm_number(tok) not in content_nums:
            bad.append(tok)
    return bad


def ground_summary(summary: str, content: str, fallback: str = "") -> str:
    """Drop summary sentences that contain a figure absent from `content`."""
    if not summary or not content:
        return summary
    nums = _content_numbers(content)
    kept, dropped = [], 0
    for sent in _SENT_SPLIT.split(summary.strip()):
        if unsupported_numbers(sent, nums):
            dropped += 1
            continue
        kept.append(sent)
    if dropped:
        logger.warning("Summary grounding dropped %d sentence(s) with figures not in the page text", dropped)
    out = " ".join(kept).strip()
    return out if out else (fallback or content[:400].strip())
