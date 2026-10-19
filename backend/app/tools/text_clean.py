"""Normalize typographic characters that LLMs (notably gpt-oss) emit.

Models like to use narrow no-break spaces (U+202F) before units and non-breaking
hyphens (U+2011) in ranges. Standard PDF fonts (WinAnsi) can't render these, so
the exported PDF showed things like "600 /L" and "0 60 /mph". Normalizing at the
source keeps the UI, PDF, DOCX and Markdown exports all clean.
"""
import re

_SPACES = re.compile("[  -   　]")
_HYPHENS = re.compile("[‐‑‒−]")
_ZERO_WIDTH = re.compile("[​-‍⁠﻿]")
_REPLACEMENTS = {
    "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "≈": "~",
    "≠": "!=",
    # subscript digits, e.g. CO2e
    **{chr(0x2080 + i): str(i) for i in range(10)},
    "•": "-", "…": "...",
}
_EMOJI = re.compile("[\U00010000-\U0010ffff\ufe0e\ufe0f]")  # PDF fonts render these as junk


def clean_text(text):
    if not isinstance(text, str):
        return text
    text = _EMOJI.sub("", text)
    text = _ZERO_WIDTH.sub("", text)
    text = _SPACES.sub(" ", text)
    text = _HYPHENS.sub("-", text)
    for src, dst in _REPLACEMENTS.items():
        text = text.replace(src, dst)
    return text


def clean_report_fields(report_data: dict, kg_data: dict) -> None:
    """In-place normalization of the LLM-generated report and knowledge-graph dicts."""
    report_data["summary"] = clean_text(report_data.get("summary", ""))
    for section in report_data.get("sections", []) or []:
        for key in ("heading", "content"):
            if key in section:
                section[key] = clean_text(section[key])
    for ent in kg_data.get("entities", []) or []:
        for key in ("name", "description"):
            if key in ent:
                ent[key] = clean_text(ent[key])
    for rel in kg_data.get("relationships", []) or []:
        for key, val in list(rel.items()):
            if isinstance(val, str) and key not in ("source", "target", "id"):
                rel[key] = clean_text(val)
