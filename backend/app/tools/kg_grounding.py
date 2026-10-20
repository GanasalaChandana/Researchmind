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


def _best_sentence(name_terms: set[str], texts: list[str], name: str = "") -> str:
    best, best_cov = "", 0.0
    # Short names ("MCP", "GPT") have no 4+ letter terms: match the name itself.
    literal = re.compile(r"\b" + re.escape(name) + r"\b", re.IGNORECASE) if name and not name_terms else None
    for text in texts:
        for sent in _SENT_SPLIT.split(text):
            if literal is not None:
                if literal.search(sent):
                    return sent.strip()[:MAX_DESC_CHARS]
                continue
            cov = _coverage(name_terms, _terms(sent))
            if cov > best_cov:
                best, best_cov = sent.strip(), cov
    return best[:MAX_DESC_CHARS] if best_cov >= NAME_MIN_COVERAGE else ""


def ground_knowledge_graph(kg_data: dict, sources: list) -> dict:
    """Return kg_data with unsupported claims removed. Mutates and returns it."""
    texts = [f"{getattr(s, 'title', '')}. {getattr(s, 'summary', '') or ''}" for s in sources]
    summaries = [getattr(s, "summary", "") or "" for s in sources]  # fallback descriptions never come from titles
    if not texts:
        return kg_data
    corpus = _norm(" ".join(texts))
    corpus_terms = _terms(" ".join(texts))
    corpus_numbers = {n.strip(".,") for n in _NUMBER.findall(" ".join(texts))}
    source_terms = [_terms(t) for t in texts]
    source_numbers = [{n.strip(".,") for n in _NUMBER.findall(t)} for t in texts]

    all_names = {_norm(_PAREN.match(str(e.get("name", ""))).group("base")) if _PAREN.match(str(e.get("name", ""))) else _norm(str(e.get("name", "")))
                 for e in kg_data.get("entities", [])}
    all_names.discard("")

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

        # A description that opens with a different concept's name is about that concept
        # (the "large language models" card that is really the RAG definition): drop it.
        own = _norm(_PAREN.match(name).group("base")) if _PAREN.match(name) else _norm(name)
        lead = _norm(desc)
        if own and any(n != own and n and lead.startswith(n) and not lead.startswith(own) for n in all_names):
            continue

        name_terms = _terms(name)
        name_numbers = {n.strip(".,") for n in _NUMBER.findall(name)}
        name_cov = _coverage(name_terms, corpus_terms) if name_terms else 1.0
        # Every distinctive word and version number in the name must occur in the sources
        # ("Gemini 3.8 Flash" is not supported by a source that only says "Gemini").
        if name_cov < (1.0 if len(name_terms) <= 3 else 0.75) or not name_numbers <= corpus_numbers:
            continue

        desc_terms = _terms(desc)
        full_name = not name_terms or _coverage(name_terms, corpus_terms) >= 1.0
        numbers = {n.strip(".,") for n in _NUMBER.findall(desc)}
        # The description must be covered by ONE source, and its numbers must come from that
        # same source (a "10%" from one article glued to a "13%" from another is a new claim).
        covers = [_coverage(desc_terms, st) for st in source_terms] if desc_terms else []
        best_i = max(range(len(covers)), key=lambda i: covers[i]) if covers else -1
        supported = bool(
            desc_terms
            and best_i >= 0
            and covers[best_i] >= DESC_MIN_COVERAGE
            and numbers <= source_numbers[best_i]
        )
        if not supported:
            # The description can't be trusted, so the name is the only anchor: every word in it
            # must occur in the sources ("Glocomms ..." with no "Glocomms" anywhere is invented).
            if not full_name:
                continue
            desc = _best_sentence(name_terms, summaries, name)
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
