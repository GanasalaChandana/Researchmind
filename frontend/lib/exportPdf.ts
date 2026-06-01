import { ResearchReport } from "./types";

export async function exportToPdf(report: ResearchReport): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = margin;

  const checkNewPage = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const addText = (text: string, fontSize: number, color: [number, number, number], bold = false, maxWidth = contentW) => {
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, maxWidth);
    const lineH = fontSize * 0.4;
    checkNewPage(lines.length * lineH + 4);
    doc.text(lines, margin, y);
    y += lines.length * lineH + 4;
  };

  // Header bar
  doc.setFillColor(79, 110, 247);
  doc.rect(0, 0, pageW, 14, "F");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("ResearchMind", margin, 9);
  doc.setFont("helvetica", "normal");
  doc.text(new Date().toLocaleDateString(), pageW - margin, 9, { align: "right" });
  y = 22;

  // Title
  addText(report.topic, 22, [15, 17, 23], true);
  y += 4;

  // Divider
  doc.setDrawColor(79, 110, 247);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Executive Summary
  addText("Executive Summary", 13, [79, 110, 247], true);
  y += 2;
  addText(report.summary, 10, [60, 60, 80]);
  y += 6;

  // Sections
  for (const section of report.sections) {
    checkNewPage(20);
    addText(section.heading, 12, [30, 30, 50], true);
    y += 1;
    addText(section.content, 10, [60, 60, 80]);

    if (section.citations?.length > 0) {
      const citeText = `Sources: ${section.citations.map((c) => `[${c}]`).join(", ")}`;
      addText(citeText, 8, [130, 130, 150]);
    }
    y += 5;
  }

  // Sources
  checkNewPage(20);
  doc.setDrawColor(200, 200, 210);
  doc.line(margin, y, pageW - margin, y);
  y += 8;
  addText("References", 13, [79, 110, 247], true);
  y += 2;

  report.sources.forEach((src, i) => {
    checkNewPage(14);
    addText(`[${i + 1}] ${src.title || src.url}`, 9, [30, 30, 50], true);
    addText(src.url, 8, [79, 110, 247]);
    if (src.summary) addText(src.summary, 8, [100, 100, 120]);
    y += 3;
  });

  // Page numbers
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 160);
    doc.text(`${p} / ${totalPages}`, pageW - margin, pageH - 10, { align: "right" });
  }

  const filename = `ResearchMind-${report.topic.slice(0, 40).replace(/[^a-z0-9]/gi, "-")}.pdf`;
  doc.save(filename);
}
