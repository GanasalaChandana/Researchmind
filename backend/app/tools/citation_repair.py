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

_GROUP = re.compile(r"\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})+)\]")
_DUP = re.compile(r"(\[\d{1,3}\])(?:\s*\1)+")


def normalize_markers(text: str) -> str:
    """Turn "[3, 4]" into "[3][4]" and collapse repeats like "[3] [3]", so every
    citation is a single-number marker the rest of the pipeline understands."""
    if not text:
        return text
    text = _GROUP.sub(lambda m: "".join(f"[{n.strip()}]" for n in re.split(r"[,;]", m.group(1))), text)
    text = _DUP.sub(r"\1", text)
    # "year earlier[3]." -> "year earlier [3]." (a marker glued to the word before it)
    return re.sub(r"(?<=[A-Za-z0-9)\"\u201d])(?=\[\d{1,3}\])", " ", text)


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


# ── Uncited sentences ─────────────────────────────────────────────────────────

ADD_MIN_COVERAGE = 0.50   # a source must contain half the sentence's key terms
ADD_MIN_TERMS = 5         # ...and the sentence must have enough terms to judge
_SKIP_PREFIX = re.compile(r"^\s*(analysis|recommendation|note)\b", re.IGNORECASE)
_SKIP_HEDGE = re.compile(r"\b(do(es)? not|don't|no source|sources? (do|does) not|unavailable|limited to)\b", re.IGNORECASE)


def add_missing_citations(sections: list[dict], sources: list) -> int:
    """Cite factual sentences the writer left without a marker, when one source
    clearly contains them. Analysis, recommendations and "sources don't say" lines
    are left uncited on purpose. Returns the number of markers added."""
    src_terms = [
        _terms(f"{getattr(s, 'title', '')} {getattr(s, 'summary', '') or ''}") for s in sources
    ]
    added = 0
    for section in sections:
        content = section.get("content") or ""
        if not content:
            continue
        out = []
        for sent in _SENT_SPLIT.split(content):
            if _MARKER.search(sent) or _SKIP_PREFIX.match(sent) or _SKIP_HEDGE.search(sent):
                out.append(sent)
                continue
            terms = _terms(sent)
            if len(terms) < ADD_MIN_TERMS or not src_terms:
                out.append(sent)
                continue
            scores = [_coverage(terms, st) for st in src_terms]
            best = max(range(len(scores)), key=lambda i: scores[i])
            runner_up = max((v for i, v in enumerate(scores) if i != best), default=0.0)
            if scores[best] >= ADD_MIN_COVERAGE and scores[best] - runner_up >= 0.10:
                sent = sent.rstrip()
                if sent and sent[-1] in ".!?":
                    sent = f"{sent[:-1]} [{best + 1}]{sent[-1]}"
                else:
                    sent = f"{sent} [{best + 1}]"
                added += 1
            out.append(sent)
        new_content = " ".join(out)
        if new_content != content:
            section["content"] = new_content
            seen: list[int] = []
            for n in (int(x) for x in _MARKER.findall(new_content)):
                if 1 <= n <= len(sources) and n not in seen:
                    seen.append(n)
            section["citations"] = seen
    return added


# ── Uncited sources ───────────────────────────────────────────────────────────

def prune_uncited_sources(sections: list[dict], summary: str, sources: list):
    """Drop sources no section cites and renumber everything that remains.

    A reference list that includes sources the text never uses misleads the reader
    (and is where weak sources hide). Returns (sources, summary). Does nothing when
    fewer than two sources are cited, so a weak report keeps all its evidence.
    """
    used: list[int] = []
    for section in sections:
        nums = {int(n) for n in _MARKER.findall(section.get("content") or "")}
        nums |= {int(n) for n in (section.get("citations") or []) if str(n).isdigit()}
        for n in sorted(nums):
            if 1 <= n <= len(sources) and n not in used:
                used.append(n)
    used.sort()
    if len(used) < 2 or len(used) == len(sources):
        return sources, summary

    remap = {old: new for new, old in enumerate(used, start=1)}

    def _rewrite(text: str) -> str:
        def sub(m):
            old = int(m.group(1))
            return f"[{remap[old]}]" if old in remap else ""
        return re.sub(r"\s+(?=\[\d{1,3}\])|(?<=\])\s+(?=[.,;])", " ", _MARKER.sub(sub, text or "")).strip()

    for section in sections:
        section["content"] = _rewrite(section.get("content") or "")
        section["citations"] = sorted(
            {remap[int(n)] for n in (section.get("citations") or []) if str(n).isdigit() and int(n) in remap}
        )
    return [sources[i - 1] for i in used], _rewrite(summary)
