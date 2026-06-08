import { ResearchReport } from "./types";

const BRAND_RGB: [number, number, number] = [79, 110, 247];
const DARK_RGB:  [number, number, number] = [15,  17,  23];
const MUTED_RGB: [number, number, number] = [100, 116, 139];
const SECTION_BG: [number, number, number] = [238, 242, 255]; // indigo-50

export async function exportToPdf(report: ResearchReport): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin  = 18;
  const contentW = pageW - margin * 2;
  let y = margin;

  // ── helpers ──────────────────────────────────────────────────────────────

  const checkPage = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin + 4;
    }
  };

  const addText = (
    text: string,
    fontSize: number,
    color: [number, number, number],
    opts: { bold?: boolean; italic?: boolean; maxWidth?: number; indent?: number } = {}
  ) => {
    const { bold = false, italic = false, maxWidth = contentW, indent = 0 } = opts;
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    doc.setFont("helvetica", bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal");
    const lines = doc.splitTextToSize(text, maxWidth);
    const lineH = fontSize * 0.42;
    checkPage(lines.length * lineH + 3);
    doc.text(lines, margin + indent, y);
    y += lines.length * lineH + 3;
  };

  const hRule = (color: [number, number, number] = BRAND_RGB, width = 0.4) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(width);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  };

  const sectionHeading = (title: string, num?: number) => {
    checkPage(18);
    // Soft background pill
    doc.setFillColor(...SECTION_BG);
    doc.roundedRect(margin, y - 1, contentW, 8, 2, 2, "F");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_RGB);
    doc.setFont("helvetica", "bold");
    const label = num !== undefined ? `${num}.  ${title}` : title;
    doc.text(label, margin + 3, y + 5);
    y += 11;
  };

  // ── Branded header bar ────────────────────────────────────────────────────

  doc.setFillColor(...BRAND_RGB);
  doc.rect(0, 0, pageW, 12, "F");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("ResearchMind", margin, 8);
  doc.setFont("helvetica", "normal");
  doc.text(
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    pageW - margin, 8, { align: "right" }
  );
  y = 20;

  // ── Title ─────────────────────────────────────────────────────────────────

  addText(report.topic, 20, DARK_RGB, { bold: true });
  y += 2;
  hRule();

  // ── Meta line ─────────────────────────────────────────────────────────────

  doc.setFontSize(8);
  doc.setTextColor(...MUTED_RGB);
  doc.setFont("helvetica", "normal");
  const meta = [
    `Sources: ${report.sources?.length ?? 0}`,
    `Sections: ${report.sections?.length ?? 0}`,
    ...(report.session_id ? [`ID: ${report.session_id}`] : []),
  ].join("   ·   ");
  doc.text(meta, margin, y);
  y += 8;

  // ── Executive Summary ─────────────────────────────────────────────────────

  sectionHeading("Executive Summary");
  y += 1;
  addText(report.summary, 10, DARK_RGB);
  y += 6;

  // ── Body sections ─────────────────────────────────────────────────────────

  for (let i = 0; i < (report.sections ?? []).length; i++) {
    const section = report.sections[i];
    y += 2;
    sectionHeading(section.heading, i + 1);
    y += 1;
    addText(section.content, 10, DARK_RGB);

    if (section.citations?.length > 0) {
      const citeText = `Sources: ${section.citations.map((c: number) => `[${c}]`).join("  ")}`;
      addText(citeText, 8, BRAND_RGB, { italic: true, indent: 2 });
    }
    y += 3;
  }

  // ── Knowledge Graph entities ──────────────────────────────────────────────

  const entities: any[] = (report as any).knowledge_graph?.entities ?? [];
  if (entities.length > 0) {
    y += 4;
    hRule(MUTED_RGB, 0.2);
    sectionHeading("Key Concepts (Knowledge Graph)");
    y += 1;

    const topEntities = entities.slice(0, 10);
    for (const entity of topEntities) {
      checkPage(10);
      const bullet = `•  ${entity.name ?? ""}`;
      addText(bullet, 9, BRAND_RGB, { bold: true, indent: 2 });
      if (entity.description) {
        addText(entity.description, 8.5, MUTED_RGB, { indent: 8 });
      }
      y += 0.5;
    }
    y += 4;
  }

  // ── References ────────────────────────────────────────────────────────────

  y += 4;
  hRule(MUTED_RGB, 0.2);
  sectionHeading("References");
  y += 1;

  (report.sources ?? []).forEach((src: any, i: number) => {
    checkPage(14);
    const numLabel = `[${i + 1}]  `;
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_RGB);
    doc.setFont("helvetica", "bold");
    doc.text(numLabel, margin + 2, y);

    const titleText = src.title || "Untitled";
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK_RGB);
    const titleLines = doc.splitTextToSize(titleText, contentW - 12);
    doc.text(titleLines, margin + 12, y);
    y += titleLines.length * (9 * 0.42) + 2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND_RGB);
    const urlLines = doc.splitTextToSize(src.url ?? "", contentW - 12);
    doc.text(urlLines, margin + 12, y);
    y += urlLines.length * (8 * 0.42) + 1;

    if (src.summary) {
      doc.setTextColor(...MUTED_RGB);
      const sumLines = doc.splitTextToSize(src.summary, contentW - 12);
      checkPage(sumLines.length * (8 * 0.42) + 2);
      doc.text(sumLines, margin + 12, y);
      y += sumLines.length * (8 * 0.42) + 1;
    }
    y += 3;
  });

  // ── Footer: page numbers ──────────────────────────────────────────────────

  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    // footer bar
    doc.setFillColor(245, 247, 255);
    doc.rect(0, pageH - 10, pageW, 10, "F");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED_RGB);
    doc.setFont("helvetica", "normal");
    doc.text("ResearchMind", margin, pageH - 4);
    doc.text(`${p} / ${totalPages}`, pageW - margin, pageH - 4, { align: "right" });
  }

  const filename = `ResearchMind-${report.topic.slice(0, 50).replace(/[^a-z0-9]/gi, "-")}.pdf`;
  doc.save(filename);
}
