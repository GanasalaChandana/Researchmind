"""Deterministic quality metrics for a ResearchMind report (no LLM judge).

Each metric targets a failure seen in real reports:
  - duplicate sources            (every source listed twice)
  - citation numbers off         ([4] pointing at the wrong reference)
  - numbers not found in sources (invented figures)
  - garbled characters           (narrow no-break spaces etc. breaking PDFs)
"""
import re
from collections import Counter

CITE_RE = re.compile(r"\[(\d{1,3})\]")
NUM_RE = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?")
BAD_CHARS = re.compile("[     ‑​]")
GAP_HEADING = re.compile(r"^(analysis|gaps?|limitations|analysis and gaps)", re.I)


def _norm(text: str) -> str:
    return re.sub(r"[\s,]", "", (text or "").lower())


def _numbers(text: str) -> list[str]:
    """Numeric tokens worth checking: drop citation markers and 1-digit numbers."""
    text = CITE_RE.sub(" ", text)
    out = []
    for m in NUM_RE.findall(text):
        tok = m.replace(",", "").rstrip(".")
        if len(re.sub(r"\D", "", tok)) >= 2:
            out.append(tok)
    return out


def score_report(report: dict) -> dict:
    sources = report.get("sources") or []
    sections = report.get("sections") or []
    n_src = len(sources)

    urls = [s.get("url", "") for s in sources]
    dup_sources = sum(c - 1 for c in Counter(urls).values() if c > 1)

    bad_refs = 0          # inline [n] outside 1..n_src
    uncited_sections = 0  # factual sections with no citation at all
    verdicts = Counter()
    nums_total = nums_grounded = 0
    bad_chars = 0

    texts = [report.get("summary", "")]
    for sec in sections:
        content = sec.get("content", "")
        texts += [sec.get("heading", ""), content]
        inline = [int(n) for n in CITE_RE.findall(content)]
        listed = [int(n) for n in (sec.get("citations") or []) if str(n).isdigit()]
        bad_refs += sum(1 for n in inline + listed if n < 1 or n > n_src)

        is_gap = bool(GAP_HEADING.match(sec.get("heading", "").strip())) or content.strip().lower().startswith("analysis")
        if not inline and not listed and not is_gap:
            uncited_sections += 1

        for chk in (sec.get("citation_checks") or {}).values():
            verdicts[chk.get("status", "unverified")] += 1

        cited = {n for n in inline + listed if 1 <= n <= n_src}
        if cited:
            haystack = _norm(" ".join(
                (sources[n - 1].get("summary", "") + " " + sources[n - 1].get("title", "")) for n in cited))
            for tok in _numbers(content):
                nums_total += 1
                if _norm(tok) in haystack:
                    nums_grounded += 1

    for t in texts + [s.get("summary", "") for s in sources]:
        bad_chars += len(BAD_CHARS.findall(t or ""))

    v_total = sum(verdicts.values())
    return {
        "sources": n_src,
        "sections": len(sections),
        "duplicate_sources": dup_sources,
        "bad_citation_refs": bad_refs,
        "uncited_sections": uncited_sections,
        "verifier_total": v_total,
        "verifier_verified": verdicts["verified"],
        "verifier_unverified": verdicts["unverified"],
        "verified_rate": (verdicts["verified"] / v_total) if v_total else None,
        "numbers_checked": nums_total,
        "numbers_grounded": nums_grounded,
        "numeric_grounding": (nums_grounded / nums_total) if nums_total else None,
        "garbled_chars": bad_chars,
    }


def aggregate(rows: list[dict]) -> dict:
    """rows: per-topic dicts with 'ok', 'latency_s' and (when ok) the score_report fields."""
    ok = [r for r in rows if r.get("ok")]

    def avg(key):
        vals = [r[key] for r in ok if r.get(key) is not None]
        return sum(vals) / len(vals) if vals else None

    def pooled(num, den):
        n = sum(r[num] for r in ok)
        d = sum(r[den] for r in ok)
        return n / d if d else None

    lat = sorted(r["latency_s"] for r in ok)
    return {
        "topics": len(rows),
        "completed": len(ok),
        "completion_rate": len(ok) / len(rows) if rows else None,
        "latency_median_s": lat[len(lat) // 2] if lat else None,
        "latency_max_s": lat[-1] if lat else None,
        "avg_sources": avg("sources"),
        "duplicate_sources_total": sum(r["duplicate_sources"] for r in ok),
        "bad_citation_refs_total": sum(r["bad_citation_refs"] for r in ok),
        "uncited_sections_total": sum(r["uncited_sections"] for r in ok),
        "verified_rate": pooled("verifier_verified", "verifier_total"),
        "numeric_grounding": pooled("numbers_grounded", "numbers_checked"),
        "garbled_chars_total": sum(r["garbled_chars"] for r in ok),
    }
