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


def _build_tasks(sections: list[dict], sources: list) -> list[dict]:
    """Build flat list of verification tasks from sections + sources."""
    tasks = []
    for s_idx, section in enumerate(sections):
        citations = section.get("citations") or []
        content = section.get("content", "")
        # Truncate content to keep prompt size manageable
        snippet = content[:400] + ("…" if len(content) > 400 else "")

        for cite_num in citations:
            # citation numbers are 1-based
            src_idx = int(cite_num) - 1
            if src_idx < 0 or src_idx >= len(sources):
                continue
            src = sources[src_idx]
            src_summary = getattr(src, "summary", "") or ""
            tasks.append({
                "task_id": f"{s_idx}:{cite_num}",
                "section_snippet": snippet,
                "source_title": getattr(src, "title", ""),
                "source_summary": src_summary[:300] + ("…" if len(src_summary) > 300 else ""),
                "cite_num": cite_num,
            })
    return tasks


async def verify_citations(sections: list[dict], sources: list) -> dict:
    """
    Returns mapping: { "{section_idx}:{cite_num}": {"status": ..., "reason": ...} }
    Falls back to empty dict on any error so the pipeline never breaks.
    """
    tasks = _build_tasks(sections, sources)
    if not tasks:
        return {}

    # Build compact prompt
    task_lines = []
    for i, t in enumerate(tasks):
        task_lines.append(
            f'Task {i+1} [cite {t["cite_num"]}]:\n'
            f'  Section claim: "{t["section_snippet"]}"\n'
            f'  Source "{t["source_title"]}": "{t["source_summary"]}"'
        )

    prompt = f"""You are a research fact-checker verifying whether cited sources actually support the claims in a report.

For each task, decide:
- "verified"   — the source clearly supports or directly covers the claim
- "partial"    — the source is related but only partially supports the claim
- "unverified" — the source does not support, is off-topic, or contradicts the claim

{chr(10).join(task_lines)}

Return a JSON array, one object per task, in order:
[
  {{"task": 1, "status": "verified", "reason": "one sentence explanation"}},
  ...
]

Return only valid JSON. No markdown fences."""

    try:
        client = Groq(api_key=GROQ_API_KEY)
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000,
            temperature=0.1,
        )
        raw = response.choices[0].message.content.strip()

        # Parse JSON — handle potential markdown fences
        raw = re.sub(r"```(?:json)?", "", raw).strip()
        results = json.loads(raw)

        mapping: dict = {}
        for item in results:
            idx = int(item.get("task", 0)) - 1
            if 0 <= idx < len(tasks):
                task_id = tasks[idx]["task_id"]
                mapping[task_id] = {
                    "status": item.get("status", "unverified"),
                    "reason": item.get("reason", ""),
                }
        return mapping

    except Exception as exc:
        print(f"⚠️ Citation verification failed: {exc}")
        return {}
