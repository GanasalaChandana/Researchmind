"""Server-side PDF generation for research reports using reportlab."""
import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    HRFlowable,
    Table,
    TableStyle,
    PageBreak,
)

_W, _H = A4

# ── Colour palette ────────────────────────────────────────────────────────────
_BLUE = colors.HexColor("#1e40af")
_LIGHT_BLUE = colors.HexColor("#dbeafe")
_GREY = colors.HexColor("#6b7280")
_DARK = colors.HexColor("#111827")
_BG = colors.HexColor("#f9fafb")


def _build_styles():
    base = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle(
            "ReportTitle",
            parent=base["Title"],
            fontSize=26,
            textColor=_DARK,
            spaceAfter=6,
            leading=32,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["Normal"],
            fontSize=11,
            textColor=_GREY,
            spaceAfter=4,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontSize=14,
            textColor=_BLUE,
            spaceBefore=14,
            spaceAfter=4,
            leading=18,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontSize=10,
            textColor=_DARK,
            spaceAfter=6,
            leading=15,
        ),
        "source_title": ParagraphStyle(
            "SourceTitle",
            parent=base["Normal"],
            fontSize=9,
            textColor=_BLUE,
            spaceAfter=2,
            leading=13,
        ),
        "source_meta": ParagraphStyle(
            "SourceMeta",
            parent=base["Normal"],
            fontSize=8,
            textColor=_GREY,
            spaceAfter=2,
            leading=12,
        ),
    }
    return styles


def _page_header_footer(canvas, doc):
    """Draw header/footer on every page."""
    canvas.saveState()
    w, h = doc.pagesize

    # Header bar
    canvas.setFillColor(_BLUE)
    canvas.rect(0, h - 1.2 * cm, w, 1.2 * cm, fill=True, stroke=False)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(1.5 * cm, h - 0.8 * cm, "ResearchMind")
    canvas.setFont("Helvetica", 9)
    canvas.drawRightString(w - 1.5 * cm, h - 0.8 * cm, "AI-Powered Research Report")

    # Footer
    canvas.setFillColor(_GREY)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(1.5 * cm, 0.8 * cm, f"Page {doc.page}")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    canvas.drawRightString(w - 1.5 * cm, 0.8 * cm, f"Generated {now}")

    canvas.restoreState()


def generate_report_pdf(report_dict: dict, session_id: str) -> bytes:
    """Generate a PDF from a research report dict and return raw bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=2 * cm,
        bottomMargin=1.5 * cm,
    )

    s = _build_styles()
    story = []

    topic = report_dict.get("topic", "Research Report")
    summary = report_dict.get("summary", "")
    sections = report_dict.get("sections", [])
    sources = report_dict.get("sources", [])
    kg = report_dict.get("knowledge_graph", {})
    entities = kg.get("entities", []) if isinstance(kg, dict) else []
    created_at = report_dict.get("created_at", "")

    # ── Title page ────────────────────────────────────────────────────────────
    story.append(Spacer(1, 1.5 * cm))
    story.append(Paragraph(_escape(topic), s["title"]))
    story.append(HRFlowable(width="100%", thickness=2, color=_BLUE, spaceAfter=8))

    # Metadata table
    meta_rows = [
        ["Research ID", session_id[:16] + ("…" if len(session_id) > 16 else "")],
        ["Generated", created_at[:19].replace("T", " ") if created_at else "—"],
        ["Sections", str(len(sections))],
        ["Sources", str(len(sources))],
    ]
    meta_table = Table(meta_rows, colWidths=[4 * cm, 12 * cm])
    meta_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), _BLUE),
        ("TEXTCOLOR", (1, 0), (1, -1), _DARK),
        ("BACKGROUND", (0, 0), (-1, -1), _BG),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [_BG, colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 0.6 * cm))

    # ── Executive Summary ─────────────────────────────────────────────────────
    story.append(Paragraph("Executive Summary", s["h2"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=_LIGHT_BLUE))
    story.append(Spacer(1, 0.2 * cm))
    if summary:
        for para in summary.split("\n\n"):
            if para.strip():
                story.append(Paragraph(_escape(para.strip()), s["body"]))
    story.append(Spacer(1, 0.4 * cm))

    # ── Sections ──────────────────────────────────────────────────────────────
    for section in sections:
        heading = section.get("heading", "")
        content = section.get("content", "")
        if not heading and not content:
            continue
        story.append(Paragraph(_escape(heading), s["h2"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=_LIGHT_BLUE))
        story.append(Spacer(1, 0.2 * cm))
        for para in content.split("\n\n"):
            if para.strip():
                story.append(Paragraph(_escape(para.strip()), s["body"]))
        story.append(Spacer(1, 0.3 * cm))

    # ── Knowledge Graph Entities ──────────────────────────────────────────────
    if entities:
        story.append(PageBreak())
        story.append(Paragraph("Key Concepts & Entities", s["h2"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=_LIGHT_BLUE))
        story.append(Spacer(1, 0.3 * cm))

        entity_rows = [["Entity", "Type", "Description"]]
        for ent in entities[:30]:  # cap at 30
            entity_rows.append([
                _escape(ent.get("name", "")),
                _escape(ent.get("type", "")),
                _escape(ent.get("description", "")[:120]),
            ])
        entity_table = Table(entity_rows, colWidths=[4 * cm, 3 * cm, 10 * cm])
        entity_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), _BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _BG]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(entity_table)
        story.append(Spacer(1, 0.4 * cm))

    # ── Sources ───────────────────────────────────────────────────────────────
    if sources:
        story.append(PageBreak())
        story.append(Paragraph("Sources & References", s["h2"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=_LIGHT_BLUE))
        story.append(Spacer(1, 0.3 * cm))

        for i, src in enumerate(sources, 1):
            title = src.get("title", "Untitled") if isinstance(src, dict) else getattr(src, "title", "Untitled")
            url = src.get("url", "") if isinstance(src, dict) else getattr(src, "url", "")
            summary_text = src.get("summary", "") if isinstance(src, dict) else getattr(src, "summary", "")
            story.append(Paragraph(f"[{i}] {_escape(title)}", s["source_title"]))
            story.append(Paragraph(_escape(url[:100]), s["source_meta"]))
            if summary_text:
                story.append(Paragraph(_escape(summary_text[:200]), s["body"]))
            story.append(Spacer(1, 0.25 * cm))

    doc.build(story, onFirstPage=_page_header_footer, onLaterPages=_page_header_footer)
    return buf.getvalue()


def _escape(text: str) -> str:
    """Escape HTML special characters for reportlab Paragraph."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
