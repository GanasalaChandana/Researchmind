"""
Export example: Export research in multiple formats
"""
from researchmind import ResearchMindClient
import json

client = ResearchMindClient(api_key="rm_your_api_key_here")

# Start and wait for research
report = client.research("History of the internet", depth=2, verbose=True)

print("\n\n📦 Exporting in all formats...")

# 1. Markdown (built-in to SDK)
md = report.to_markdown()
with open("internet_history.md", "w", encoding="utf-8") as f:
    f.write(md)
print("✅ Saved: internet_history.md")

# 2. JSON (Python dict)
report_dict = {
    "session_id": report.session_id,
    "topic": report.topic,
    "summary": report.summary,
    "sections": [
        {"heading": s.heading, "content": s.content, "citations": s.citations}
        for s in report.sections
    ],
    "sources": [
        {"url": s.url, "title": s.title, "summary": s.summary}
        for s in report.sources
    ],
    "knowledge_graph": {
        "entities": report.knowledge_graph.entities,
        "relationships": report.knowledge_graph.relationships,
    },
}
with open("internet_history.json", "w", encoding="utf-8") as f:
    json.dump(report_dict, f, indent=2)
print("✅ Saved: internet_history.json")

# 3. Plain text summary
with open("internet_history.txt", "w", encoding="utf-8") as f:
    f.write(f"RESEARCH REPORT: {report.topic}\n")
    f.write("=" * 60 + "\n\n")
    f.write(f"SUMMARY:\n{report.summary}\n\n")
    for section in report.sections:
        f.write(f"\n{section.heading.upper()}\n")
        f.write("-" * 40 + "\n")
        f.write(section.content + "\n")
    f.write("\n\nSOURCES:\n")
    for i, source in enumerate(report.sources, 1):
        f.write(f"[{i}] {source.title}\n    {source.url}\n")
print("✅ Saved: internet_history.txt")

print("\n🎉 All exports complete!")
print(f"   - Sections: {len(report.sections)}")
print(f"   - Sources:  {len(report.sources)}")
print(f"   - Entities: {report.knowledge_graph.entity_count}")
