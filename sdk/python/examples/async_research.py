"""
Async example: Run multiple research sessions in parallel using threading
"""
import threading
from researchmind import ResearchMindClient, ResearchReport, ResearchFailedError

client = ResearchMindClient(api_key="rm_your_api_key_here")

TOPICS = [
    "Impact of AI on healthcare",
    "Future of electric vehicles",
    "Quantum computing breakthroughs",
]

reports: dict[str, ResearchReport] = {}
errors: dict[str, str] = {}


def run_research(topic: str):
    """Run research for a single topic in its own thread"""
    try:
        print(f"▶ Starting: {topic}")
        session = client.start_research(topic, depth=2)
        report = client.wait_for_report(session.session_id, timeout=300)
        reports[topic] = report
        print(f"✅ Done: {topic} ({len(report.sections)} sections, {len(report.sources)} sources)")
    except ResearchFailedError as e:
        errors[topic] = str(e)
        print(f"❌ Failed: {topic} — {e}")
    except Exception as e:
        errors[topic] = str(e)
        print(f"❌ Error: {topic} — {e}")


# Launch all research sessions in parallel threads
threads = [threading.Thread(target=run_research, args=(t,)) for t in TOPICS]
for t in threads:
    t.start()

# Wait for all to complete
for t in threads:
    t.join()

print(f"\n\n{'='*60}")
print(f"✅ Completed: {len(reports)}/{len(TOPICS)} topics")
if errors:
    print(f"❌ Failed: {len(errors)} topics")

# Print summaries for all completed reports
for topic, report in reports.items():
    print(f"\n--- {report.topic} ---")
    print(report.summary[:300] + "..." if len(report.summary) > 300 else report.summary)
