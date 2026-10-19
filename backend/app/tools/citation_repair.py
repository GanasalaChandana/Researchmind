"""
Deterministic citation repair (no LLM calls, so no quota cost).

The writer model sometimes cites the wrong source number: it states a claim that
source [6] makes but writes [2]. Numbering itself is consistent end to end, so the
fix is to check each cited sentence against the text of the sources and, when the
cited source clearly doesn't contain the claim but another one clearly does, swap
the marker. Anything ambiguous is left alone for the verifier to flag.
"""

import re

_MARKER = re.compile(r"\[(\d{1,3})\]")
_WORD = re.compile(r"[a-z0-9]+")
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z\[])")
_STOP = frozenset(
    "that this with from have has had are was were been being their there which while "
    "also into more most such than then them they these those over under about across "
    "through between within without including include includes can could may might will "
    "would should its and for the not but all any each other another only both very".split()
)

# A cited source must cover at least this share of the sentence's key terms, else it
# is "suspect"; a replacement must clearly beat it.
SUSPECT_BELOW = 0.22
MIN_BEST = 0.30
MIN_MARGIN = 0.15


def _stem(w: str) -> str:
    for suf in ("ations", "ation", "ings", "ing", "ies", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            return w[: -len(suf)]
    return w


def _terms(text: str) -> set[str]:
    return {_stem(w) for w in _WORD.findall(text.lower()) if len(w) >= 4 and w not in _STOP}


def _coverage(sentence_terms: set[str], source_terms: set[str]) -> float:
    if not sentence_terms:
        return 0.0
    return len(sentence_terms & source_terms) / len(sentence_terms)


def repair_citations(sections: list[dict], sources: list) -> int:
    """Fix mis-numbered citations in place. Returns how many markers were changed."""
    src_terms = [
        _terms(f"{getattr(s, 'title', '')} {getattr(s, 'summary', '') or ''}") for s in sources
    ]
    changed = 0

    for section in sections:
        content = section.get("content") or ""
        if not content or not _MARKER.search(content):
            continue

        out_sentences = []
        for sent in _SENT_SPLIT.split(content):
            nums = [int(n) for n in _MARKER.findall(sent)]
            if not nums:
                out_sentences.append(sent)
                continue
            terms = _terms(_MARKER.sub(" ", sent))
            scores = [_coverage(terms, st) for st in src_terms]
            best = max(range(len(scores)), key=lambda i: scores[i]) if scores else -1
            mapping: dict[int, int] = {}
            for n in set(nums):
                i = n - 1
                if i < 0 or i >= len(scores):
                    continue
                if (
                    scores[i] < SUSPECT_BELOW
                    and best >= 0
                    and scores[best] >= MIN_BEST
                    and scores[best] - scores[i] >= MIN_MARGIN
                    and (best + 1) not in nums
                ):
                    mapping[n] = best + 1
            if mapping:
                changed += len(mapping)
                sent = _MARKER.sub(lambda m: f"[{mapping.get(int(m.group(1)), int(m.group(1)))}]", sent)
            out_sentences.append(sent)

        new_content = " ".join(out_sentences) if changed else content
        if new_content != content:
            section["content"] = new_content
            seen: list[int] = []
            for n in (int(x) for x in _MARKER.findall(new_content)):
                if 1 <= n <= len(sources) and n not in seen:
                    seen.append(n)
            section["citations"] = seen

    return changed
