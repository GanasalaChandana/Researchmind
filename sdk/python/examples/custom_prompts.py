"""
Custom prompts example: Define your own research questions
"""
from researchmind import ResearchMindClient

client = ResearchMindClient(api_key="rm_your_api_key_here")

# Define a custom research methodology
ACADEMIC_PROMPTS = [
    "What does current peer-reviewed research say about this topic?",
    "What are the key controversies or debates among experts?",
    "What are the real-world applications and case studies?",
    "What are the limitations and open questions in this field?",
    "What does the future research roadmap look like?",
]

# Start research with custom academic questions
print("Starting academic-style research...")
session = client.start_research(
    topic="Large language models and emergent abilities",
    depth=5,
    custom_prompts=ACADEMIC_PROMPTS,
)
print(f"Session: {session.session_id}")

# Wait for completion
report = client.wait_for_report(
    session.session_id,
    timeout=400,
    on_status_change=lambda s: print(f"  Status: {s}"),
)

# Print report
print(f"\n📄 Report: {report.topic}")
print(f"Summary: {report.summary}\n")
for section in report.sections:
    print(f"### {section.heading}")
    print(section.content[:200] + "...\n")

# Export as markdown file
md = report.to_markdown()
with open("llm_academic_research.md", "w", encoding="utf-8") as f:
    f.write(md)
print("✅ Exported to llm_academic_research.md")
