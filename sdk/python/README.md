# ResearchMind Python SDK

Official Python SDK for the [ResearchMind](https://researchmind-app.vercel.app) AI Research Agent API.

## Features

- 🔍 **Start research** sessions with a single function call
- ⏳ **Polling built-in** — `wait_for_report()` handles status checks automatically
- 📊 **Typed models** — `ResearchReport`, `Source`, `Section`, `KnowledgeGraph`
- 📄 **Export support** — built-in `.to_markdown()` method
- ⚡ **Zero dependencies** — uses Python standard library only
- 🔁 **Parallel research** — use `threading` for multiple sessions
- 🎯 **Custom prompts** — define your own research methodology

## Installation

```bash
# From local source
cd sdk/python
pip install -e .
```

> PyPI package coming soon: `pip install researchmind`

## Quick Start

```python
from researchmind import ResearchMindClient

client = ResearchMindClient(api_key="rm_your_api_key_here")

# One-liner: research + wait + return report
report = client.research("Future of quantum computing", verbose=True)

print(report.summary)
print(f"Sections: {len(report.sections)}, Sources: {len(report.sources)}")
```

## Detailed Usage

### 1. Start Research

```python
session = client.start_research(
    topic="Impact of AI on healthcare",
    depth=3,              # 1-5 sub-questions
    custom_prompts=[      # optional custom questions
        "What AI tools are used in diagnosis?",
        "What are the risks of AI in medicine?",
    ]
)

print(session.session_id)  # "a1b2c3d4-..."
print(session.status)      # "queued"
```

### 2. Check Status

```python
session = client.get_status(session_id)
print(session.status)  # "queued" | "running" | "completed" | "failed"
```

### 3. Wait for Report

```python
def on_status(status):
    print(f"→ {status}")

report = client.wait_for_report(
    session_id,
    timeout=300,              # seconds (default: 300)
    poll_interval=5,          # check every N seconds (default: 5)
    on_status_change=on_status,
)
```

### 4. Use the Report

```python
# Summary
print(report.summary)

# Sections
for section in report.sections:
    print(f"## {section.heading}")
    print(section.content)
    print(f"Citations: {section.citations}")

# Sources
for source in report.sources:
    print(f"[{source.title}]({source.url})")
    print(f"Relevance: {source.relevance_score:.2f}")

# Knowledge Graph
kg = report.knowledge_graph
print(f"Entities: {kg.entity_count}")
print(f"Relationships: {kg.relationship_count}")

# Export as Markdown
md = report.to_markdown()
with open("report.md", "w") as f:
    f.write(md)
```

### 5. Parallel Research (Batch)

```python
import threading

topics = ["AI in healthcare", "Future of EVs", "Quantum computing"]
results = {}

def research_topic(topic):
    report = client.research(topic, depth=2)
    results[topic] = report

threads = [threading.Thread(target=research_topic, args=(t,)) for t in topics]
for t in threads:
    t.start()
for t in threads:
    t.join()

for topic, report in results.items():
    print(f"{topic}: {len(report.sources)} sources")
```

## API Reference

### `ResearchMindClient(api_key, base_url, timeout)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `api_key` | str | required | Your API key (`rm_...`) |
| `base_url` | str | production | API base URL |
| `timeout` | int | 300 | Default request timeout (seconds) |

### Methods

| Method | Description |
|--------|-------------|
| `research(topic, depth, verbose)` | Start + wait + return report (convenience) |
| `start_research(topic, depth, custom_prompts)` | Start a research session |
| `get_status(session_id)` | Get current session status |
| `get_report(session_id)` | Get completed report |
| `wait_for_report(session_id, timeout, poll_interval, on_status_change)` | Poll until complete |
| `export_report(session_id, format)` | Export in `json`, `markdown`, `html` |
| `get_api_info()` | Get API info and usage stats |

## Error Handling

```python
from researchmind import (
    ResearchMindClient,
    AuthenticationError,
    RateLimitError,
    NotFoundError,
    ResearchFailedError,
    TimeoutError,
)

try:
    report = client.research("Some topic")
except AuthenticationError:
    print("Invalid API key")
except RateLimitError:
    print("Too many requests — wait before retrying")
except ResearchFailedError as e:
    print(f"Research failed: {e}")
except TimeoutError as e:
    print(f"Timed out after {e.timeout}s")
```

## Examples

| File | Description |
|------|-------------|
| `examples/basic_research.py` | Simple start-to-finish research |
| `examples/async_research.py` | Parallel research with threading |
| `examples/custom_prompts.py` | Custom research methodology |
| `examples/export_formats.py` | Export to markdown, JSON, text |

## Requirements

- Python 3.8+
- No external dependencies (standard library only)

## License

MIT — free to use in any project.
