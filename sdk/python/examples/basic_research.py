"""
Basic example: Start research and print the report
"""
from researchmind import ResearchMindClient

# Initialize client
client = ResearchMindClient(api_key="rm_your_api_key_here")

# One-liner: research + wait + return report
report = client.research("Future of quantum computing", depth=3, verbose=True)

# Print summary
print("\n" + "=" * 60)
print(f"REPORT: {report.topic}")
print("=" * 60)
print(f"\nSummary:\n{report.summary}")

# Print each section
for section in report.sections:
    print(f"\n## {section.heading}")
    print(section.content)

# Print sources
print(f"\n\nSources ({len(report.sources)}):")
for i, source in enumerate(report.sources, 1):
    print(f"  [{i}] {source.title}")
    print(f"      {source.url}")

# Export as markdown
md = report.to_markdown()
with open("quantum_computing_research.md", "w", encoding="utf-8") as f:
    f.write(md)
print("\n✅ Saved to quantum_computing_research.md")
