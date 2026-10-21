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
    return fix_chi_square(text)


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


_SPACED_NUMBER = re.compile(r"(?<![\d,.])\d{1,3}(?: \d{3})+(?![\d])")


def fix_number_spacing(text: str, corpus: str) -> str:
    """Turn "127 000" back into "127,000" when the sources write it that way.

    The writer model sometimes swaps thousands separators for spaces. Only numbers whose
    comma form really appears in the sources are changed, so "in 5 100 cases" is safe.
    """
    if not text or not corpus:
        return text

    def sub(m):
        cand = m.group(0).replace(" ", ",")
        return cand if cand in corpus else m.group(0)

    return _SPACED_NUMBER.sub(sub, text)


_AUTHORITY = re.compile(r"\b(?:high|low|medium|moderate)[- ]authority\s+", re.IGNORECASE)


def strip_authority_jargon(text: str) -> str:
    """Internal source scores must not show up in the report ("a low-authority vendor page")."""
    return _AUTHORITY.sub("", text or "")


_CHI = re.compile(r"(?:\u00c7|\u00cf\u2021)\u00b2(?=\s*=)")


def fix_chi_square(text: str) -> str:
    """Mis-decoded 'chi-squared' ("\u00c7\u00b2 = 68.2") back to the real symbol."""
    return _CHI.sub("\u03c7\u00b2", text or "")
