"""Tolerant parsing of JSON written by an LLM.

Models often put a raw newline or tab inside a string value, which strict json.loads
rejects ("Invalid control character at ..."). That one character used to kill a whole
research run after all the searching and reading had finished.
"""

import json
import re

_FENCE = re.compile(r"```(?:json)?", re.IGNORECASE)


def parse_llm_json(raw: str, default=None, *, array: bool = False):
    """Parse model output as JSON; never raise. Returns `default` if nothing parses.

    Handles markdown fences, text around the JSON, raw control characters inside strings
    and trailing commas. `array=True` extracts a [...] instead of a {...}.
    """
    text = _FENCE.sub("", raw or "").strip()
    candidates = [text]
    open_c, close_c = ("[", "]") if array else ("{", "}")
    start, end = text.find(open_c), text.rfind(close_c)
    if start != -1 and end > start:
        candidates.append(text[start : end + 1])
    for cand in candidates:
        for attempt in (cand, re.sub(r",\s*([}\]])", r"\1", cand)):
            try:
                return json.loads(attempt, strict=False)
            except (json.JSONDecodeError, ValueError):
                continue
    return default
