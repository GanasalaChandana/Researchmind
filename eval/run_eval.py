#!/usr/bin/env python3
"""Run ResearchMind's quality eval against a live backend. Standard library only.

    python eval/run_eval.py --base-url https://researchmind-q4fp.onrender.com

Writes eval/results/results.json and eval/results/summary.md.
Anonymous API limits are 10 research starts/hour, so the default topic list is 8.
Set EVAL_TOKEN to a login JWT to use the higher authenticated limits.
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scoring import aggregate, score_report  # noqa: E402


def _headers(extra=None):
    h = {"User-Agent": "researchmind-eval/1.0"}
    if os.environ.get("EVAL_TOKEN"):
        h["Authorization"] = f"Bearer {os.environ['EVAL_TOKEN']}"
    h.update(extra or {})
    return h


def warm_up(base: str, wait_s: int = 150) -> None:
    """Free Render instances sleep when idle; poke /health until it answers."""
    deadline = time.time() + wait_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(urllib.request.Request(base + "/health", headers=_headers()), timeout=30) as r:
                if r.status == 200:
                    return
        except Exception:
            time.sleep(5)
    print("warning: backend did not answer /health in time", file=sys.stderr)


def run_topic(base: str, topic: str, depth: int, timeout_s: int) -> dict:
    t0 = time.time()
    try:
        body = json.dumps({"topic": topic, "depth": depth}).encode()
        req = urllib.request.Request(base + "/research/start", data=body, method="POST",
                                     headers=_headers({"Content-Type": "application/json"}))
        with urllib.request.urlopen(req, timeout=60) as r:
            session_id = json.load(r)["session_id"]

        qs = urllib.parse.urlencode({"topic": topic, "depth": depth, "bypass_cache": "true"})
        req = urllib.request.Request(f"{base}/research/{session_id}/stream?{qs}",
                                     headers=_headers({"Accept": "text/event-stream"}))
        report, error = None, None
        with urllib.request.urlopen(req, timeout=timeout_s) as r:
            for raw in r:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                try:
                    ev = json.loads(line[5:].strip())
                except json.JSONDecodeError:
                    continue
                if ev.get("type") == "error":
                    error = ev.get("message", "error")
                if ev.get("type") == "done":
                    report = (ev.get("data") or {}).get("report")
                    break
                if time.time() - t0 > timeout_s:
                    error = "timeout"
                    break
        if not report:
            return {"topic": topic, "ok": False, "latency_s": round(time.time() - t0, 1), "error": error or "no report"}
        return {"topic": topic, "ok": True, "latency_s": round(time.time() - t0, 1), **score_report(report)}
    except Exception as exc:  # network errors, 429s, ...
        return {"topic": topic, "ok": False, "latency_s": round(time.time() - t0, 1), "error": f"{type(exc).__name__}: {exc}"}


def pct(x):
    return "n/a" if x is None else f"{x * 100:.0f}%"


def num(x, nd=1):
    return "n/a" if x is None else f"{x:.{nd}f}"


def render_markdown(base: str, rows: list[dict], agg: dict) -> str:
    out = [f"# ResearchMind eval\n", f"Backend: `{base}` · topics: {agg['topics']} · {time.strftime('%Y-%m-%d')}\n",
           "## Summary\n", "| Metric | Result | Target |", "|---|---|---|",
           f"| Completion rate | {pct(agg['completion_rate'])} ({agg['completed']}/{agg['topics']}) | 100% |",
           f"| Median / max latency | {num(agg['latency_median_s'], 0)}s / {num(agg['latency_max_s'], 0)}s | - |",
           f"| Avg sources per report | {num(agg['avg_sources'])} | - |",
           f"| Duplicate sources | {agg['duplicate_sources_total']} | 0 |",
           f"| Citation numbers out of range | {agg['bad_citation_refs_total']} | 0 |",
           f"| Factual sections with no citation | {agg['uncited_sections_total']} | 0 |",
           f"| Citations verified by checker | {pct(agg['verified_rate'])} (verified or partial: {pct(agg['supported_rate'])}) | high |",
           f"| Topics failed by AI-provider rate limits | {agg['rate_limited_topics']} | 0 |",
           f"| Numbers found in cited sources | {pct(agg['numeric_grounding'])} | high |",
           f"| Garbled characters | {agg['garbled_chars_total']} | 0 |\n",
           "## Per topic\n",
           "| Topic | OK | Time | Sources | Dups | Bad refs | Verified | Numbers grounded |", "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        if r.get("ok"):
            out.append(f"| {r['topic'][:60]} | yes | {r['latency_s']:.0f}s | {r['sources']} | {r['duplicate_sources']} | "
                       f"{r['bad_citation_refs']} | {pct(r['verified_rate'])} | {pct(r['numeric_grounding'])} |")
        else:
            out.append(f"| {r['topic'][:60]} | **no** | {r['latency_s']:.0f}s | - | - | - | - | {r.get('error', '')[:60]} |")
    out.append("\nMetrics are computed automatically (no LLM judge). 'Numbers found in cited sources' checks that each "
               "figure in a section appears in the sources that section cites; 'verified' is the app's own citation checker.")
    return "\n".join(out) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=os.environ.get("EVAL_BASE_URL", "https://researchmind-q4fp.onrender.com"))
    ap.add_argument("--topics", default=str(Path(__file__).parent / "topics.json"))
    ap.add_argument("--limit", type=int, default=8)
    ap.add_argument("--depth", type=int, default=3)
    ap.add_argument("--timeout", type=int, default=300, help="seconds per topic")
    ap.add_argument("--pause", type=int, default=60, help="seconds between topics (Groq free-tier limits are per minute)")
    ap.add_argument("--out", default=str(Path(__file__).parent / "results"))
    args = ap.parse_args()

    base = args.base_url.rstrip("/")
    topics = json.loads(Path(args.topics).read_text())[: args.limit]
    warm_up(base)
    rows = []
    for i, topic in enumerate(topics, 1):
        print(f"[{i}/{len(topics)}] {topic}", flush=True)
        row = run_topic(base, topic, args.depth, args.timeout)
        if not row["ok"] and "rate limit" in row.get("error", "").lower():
            print("   rate limited by the AI provider; waiting 90s and retrying once", flush=True)
            time.sleep(90)
            row = run_topic(base, topic, args.depth, args.timeout)
            row["retried"] = True
        print("   ->", "ok" if row["ok"] else f"FAILED ({row.get('error')})", f"{row['latency_s']}s", flush=True)
        rows.append(row)
        if i < len(topics):
            time.sleep(args.pause)

    agg = aggregate(rows)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "results.json").write_text(json.dumps({"base_url": base, "aggregate": agg, "rows": rows}, indent=2))
    md = render_markdown(base, rows, agg)
    (out / "summary.md").write_text(md)
    print("\n" + md)
    return 0 if agg["completed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
