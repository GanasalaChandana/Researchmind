"""
Citation verification.

Checks whether each cited source actually supports the claim made in the
section that references it. Uses a single batched LLM call to keep latency low.

Returns a dict keyed by "{section_idx}:{citation_num}" →
  { "status": "verified" | "partial" | "unverified", "reason": str }
"""

import json
import re
from groq import Groq
from ..config import GROQ_API_KEY
from .groq_models import FAST_MODEL, adapt_kwargs
from .llm_json import parse_llm_json


_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z\[])")
BATCH_SIZE = 8


def _claim_for(content: str, cite_num) -> str:
    """The sentence(s) that actually carry marker [cite_num].

    Judging a source against a whole multi-claim section makes a citation that backs one
    sentence look unsupported; judge it against the sentence it is attached to.
    """
    marker = f"[{cite_num}]"
    sentences = _SENT_SPLIT.split(content)
    hits = [s for s in sentences if marker in s]
    if not hits:
        return content[:600]
    return " ".join(hits)[:600]


def _build_tasks(sections: list[dict], sources: list) -> list[dict]:
    """Build flat list of verification tasks from sections + sources."""
    tasks = []
    for s_idx, section in enumerate(sections):
        citations = section.get("citations") or []
        content = section.get("content", "")

        for cite_num in citations:
            # citation numbers are 1-based
            src_idx = int(cite_num) - 1
            if src_idx < 0 or src_idx >= len(sources):
                continue
            src = sources[src_idx]
            src_summary = getattr(src, "summary", "") or ""
            tasks.append({
                "task_id": f"{s_idx}:{cite_num}",
                "section_snippet": _claim_for(content, cite_num),
                "source_title": getattr(src, "title", ""),
                "source_summary": src_summary[:1500] + ("…" if len(src_summary) > 1500 else ""),
                "cite_num": cite_num,
            })
    return tasks


def _prompt_for(tasks: list[dict]) -> str:
    task_lines = []
    for i, t in enumerate(tasks):
        task_lines.append(
            f'Task {i+1} [cite {t["cite_num"]}]:\n'
            f'  Claim: "{t["section_snippet"]}"\n'
            f'  Source "{t["source_title"]}": "{t["source_summary"]}"'
        )
    return f"""You are a research fact-checker verifying whether cited sources actually support the claim they are attached to.

Judge ONLY the claim shown, against ONLY the source text shown.
- "verified"   — the source states or directly implies the specific facts in the claim (paraphrase is fine)
- "partial"    — the source is on the same subject but is missing a specific detail, number, or name in the claim
- "unverified" — the source does not mention the claim's subject, or contradicts it

Do not mark a claim down for being worded more generally or more cautiously than the source.

{chr(10).join(task_lines)}

Return a JSON array, one object per task, in order:
[
  {{"task": 1, "status": "verified", "reason": "one short sentence"}},
  ...
]

Return only valid JSON. No markdown fences."""


async def verify_citations(sections: list[dict], sources: list) -> dict:
    """
    Returns mapping: { "{section_idx}:{cite_num}": {"status": ..., "reason": ...} }
    Tasks are checked in small batches so a citation-heavy report is not cut off by the
    output limit. A failed batch is skipped; the pipeline never breaks.
    """
    tasks = _build_tasks(sections, sources)
    if not tasks:
        return {}

    mapping: dict = {}
    client = Groq(api_key=GROQ_API_KEY)
    for start in range(0, len(tasks), BATCH_SIZE):
        batch = tasks[start:start + BATCH_SIZE]
        try:
            response = client.chat.completions.create(**adapt_kwargs(dict(
                model=FAST_MODEL,
                messages=[{"role": "user", "content": _prompt_for(batch)}],
                max_tokens=1200,
                temperature=0.1,
            )))
            raw = response.choices[0].message.content.strip()
            results = parse_llm_json(raw, [], array=True)
            for item in results:
                idx = int(item.get("task", 0)) - 1
                if 0 <= idx < len(batch):
                    mapping[batch[idx]["task_id"]] = {
                        "status": item.get("status", "unverified"),
                        "reason": item.get("reason", ""),
                    }
        except Exception as exc:
            print(f"⚠️ Citation verification batch failed: {exc}")
    return mapping
