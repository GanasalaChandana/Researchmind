"""
Knowledge-graph grounding (deterministic, no LLM calls).

The model sometimes adds things the sources never say: an invented expansion of an
acronym ("MCP (Multi-Component Protocol)"), a claim attached to an entity ("used in
Antigravity, top cost-effective model"), or a number from memory. For every entity
we check that its name appears in the sources and that its description is covered by
one source; otherwise the description is replaced by the sentence from the sources
that actually mentions the entity, or the entity is dropped.
"""

import re

from .citation_repair import _SENT_SPLIT, _coverage, _terms

_PAREN = re.compile(r"^(?P<base>.*?)\s*\((?P<inner>[^)]+)\)\s*$")
_NUMBER = re.compile(r"\d[\d,.]*")

DESC_MIN_COVERAGE = 0.5
NAME_MIN_COVERAGE = 0.5   # for matching a sentence to an entity
MAX_DESC_CHARS = 240


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _best_sentence(name_terms: set[str], texts: list[str]) -> str:
    best, best_cov = "", 0.0
    for text in texts:
        for sent in _SENT_SPLIT.split(text):
            cov = _coverage(name_terms, _terms(sent))
            if cov > best_cov:
                best, best_cov = sent.strip(), cov
    return best[:MAX_DESC_CHARS] if best_cov >= NAME_MIN_COVERAGE else ""


def ground_knowledge_graph(kg_data: dict, sources: list) -> dict:
    """Return kg_data with unsupported claims removed. Mutates and returns it."""
    texts = [f"{getattr(s, 'title', '')}. {getattr(s, 'summary', '') or ''}" for s in sources]
    if not texts:
        return kg_data
    corpus = _norm(" ".join(texts))
    corpus_terms = _terms(" ".join(texts))
    corpus_numbers = {n.strip(".,") for n in _NUMBER.findall(" ".join(texts))}
    source_terms = [_terms(t) for t in texts]

    kept, kept_ids = [], set()
    for ent in kg_data.get("entities", []):
        name = str(ent.get("name", "")).strip()
        desc = str(ent.get("description", "")).strip()
        if not name:
            continue

        # An expansion in brackets that no source contains is invented: keep the bare name.
        m = _PAREN.match(name)
        if m and _norm(m.group("inner")) not in corpus:
            name = m.group("base").strip() or name

        name_terms = _terms(name)
        name_numbers = {n.strip(".,") for n in _NUMBER.findall(name)}
        name_cov = _coverage(name_terms, corpus_terms) if name_terms else 1.0
        # Every distinctive word and version number in the name must occur in the sources
        # ("Gemini 3.8 Flash" is not supported by a source that only says "Gemini").
        if name_cov < (1.0 if len(name_terms) <= 3 else 0.75) or not name_numbers <= corpus_numbers:
            continue

        desc_terms = _terms(desc)
        numbers = {n.strip(".,") for n in _NUMBER.findall(desc)}
        supported = (
            desc_terms
            and numbers <= corpus_numbers
            and max((_coverage(desc_terms, st) for st in source_terms), default=0.0) >= DESC_MIN_COVERAGE
        )
        if not supported:
            desc = _best_sentence(name_terms, texts)
            if not desc:
                continue

        ent["name"], ent["description"] = name, desc
        kept.append(ent)
        kept_ids.add(ent.get("id"))

    kg_data["entities"] = kept
    kg_data["relationships"] = [
        r for r in kg_data.get("relationships", [])
        if r.get("source_id") in kept_ids and r.get("target_id") in kept_ids
    ]
    return kg_data
