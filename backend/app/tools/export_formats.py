"""Export research reports in different formats"""
from ..models.schemas import ResearchReport


def export_markdown(report: ResearchReport) -> str:
    """Export report as Markdown"""
    lines = [
        f"# {report.topic}\n",
        f"*Generated: {report.session_id}*\n",
        f"## Executive Summary\n{report.summary}\n",
    ]

    for section in report.sections:
        lines.append(f"## {section.heading}\n")
        lines.append(section.content + "\n")

        if section.citations:
            citations_text = ", ".join([f"[{c}]" for c in section.citations])
            lines.append(f"\n*Sources: {citations_text}*\n")

    lines.append("\n## Sources\n")
    for i, source in enumerate(report.sources, 1):
        lines.append(f"[{i}] **{source.title}**  \n")
        lines.append(f"{source.url}  \n")
        lines.append(f"{source.summary}\n\n")

    return "".join(lines)


def export_html(report: ResearchReport) -> str:
    """Export report as HTML"""
    html_parts = [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        "<meta charset='UTF-8'>",
        f"<title>{report.topic}</title>",
        "<style>",
        "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #333; }",
        "h1 { border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }",
        "h2 { margin-top: 30px; color: #1e40af; }",
        "section { margin: 20px 0; padding: 15px; background: #f9fafb; border-left: 4px solid #3b82f6; }",
        ".sources { background: #f0f9ff; border-left-color: #0ea5e9; }",
        ".source { margin: 15px 0; padding: 10px; background: white; border-radius: 5px; }",
        ".source-title { font-weight: bold; color: #0284c7; }",
        ".source-url { color: #666; font-size: 0.9em; }",
        ".citations { color: #0ea5e9; font-size: 0.9em; margin-top: 10px; }",
        "</style>",
        "</head>",
        "<body>",
        f"<h1>{report.topic}</h1>",
        f"<p><em>Research ID: {report.session_id}</em></p>",
        f"<section><h2>Executive Summary</h2><p>{report.summary}</p></section>",
    ]

    for section in report.sections:
        html_parts.append(f"<section><h2>{section.heading}</h2>")
        html_parts.append(f"<p>{section.content.replace(chr(10), '<br>')}</p>")

        if section.citations:
            citations_html = ", ".join([f'<a href="#{c}">[{c}]</a>' for c in section.citations])
            html_parts.append(f'<p class="citations">Sources: {citations_html}</p>')

        html_parts.append("</section>")

    html_parts.append('<section class="sources"><h2>Sources</h2>')
    for i, source in enumerate(report.sources, 1):
        html_parts.append(f'<div class="source" id="{i}">')
        html_parts.append(f'<div class="source-title">[{i}] {source.title}</div>')
        html_parts.append(f'<div class="source-url"><a href="{source.url}" target="_blank">{source.url}</a></div>')
        html_parts.append(f'<p>{source.summary}</p>')
        html_parts.append("</div>")

    html_parts.extend([
        "</section>",
        "</body>",
        "</html>",
    ])

    return "\n".join(html_parts)


def format_citations(
    style: str = "apa",
    sources: list = None,
) -> dict:
    """Format citations in different styles"""
    if not sources:
        return {}

    formatted = {}

    for i, source in enumerate(sources, 1):
        if style == "apa":
            formatted[i] = f"{source.title}. Retrieved from {source.url}"
        elif style == "mla":
            formatted[i] = f'"{source.title}." Web. {source.url}'
        elif style == "chicago":
            formatted[i] = f"Accessed {source.url}. \"{source.title}.\""
        else:
            formatted[i] = f"[{i}] {source.title} - {source.url}"

    return formatted
