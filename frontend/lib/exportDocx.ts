import { ResearchReport } from "./types";

/**
 * Generate and download a .docx Word document for the given ResearchReport.
 * Uses the `docx` npm package (pure browser-compatible JS, no server needed).
 */
export async function exportToDocx(report: ResearchReport): Promise<void> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
    ShadingType,
    UnderlineType,
  } = await import("docx");

  const BRAND = "4F6EF7";   // indigo-500 approx
  const DARK  = "0F1117";
  const MUTED = "64748B";
  const WHITE = "FFFFFF";
  const SECTION_BG = "EEF2FF"; // indigo-50 approx

  const topicSlug = report.topic.slice(0, 50).replace(/[^a-z0-9]/gi, "-");
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // ── helpers ────────────────────────────────────────────────────────────────

  const spacer = (before = 80, after = 80) =>
    new Paragraph({ text: "", spacing: { before, after } });

  const rule = () =>
    new Paragraph({
      text: "",
      spacing: { before: 0, after: 200 },
      border: {
        bottom: { color: BRAND, space: 1, style: BorderStyle.SINGLE, size: 8 },
      },
    });

  const metaLine = (label: string, value: string) =>
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: `${label}: `, bold: true, color: MUTED, size: 18 }),
        new TextRun({ text: value, color: MUTED, size: 18 }),
      ],
    });

  // ── Cover / title block ────────────────────────────────────────────────────

  const titleSection: any[] = [
    // Brand label
    new Paragraph({
      spacing: { after: 120 },
      shading: { type: ShadingType.SOLID, color: BRAND, fill: BRAND },
      children: [
        new TextRun({
          text: "  ResearchMind  ",
          bold: true,
          color: WHITE,
          size: 20,
          font: "Calibri",
        }),
      ],
    }),
    spacer(160, 80),
    // Main title
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: report.topic,
          bold: true,
          color: DARK,
          size: 52,
          font: "Calibri",
        }),
      ],
    }),
    metaLine("Generated", dateStr),
    metaLine("Session",   report.session_id ?? "—"),
    metaLine("Sources",   String(report.sources?.length ?? 0)),
    rule(),
  ];

  // ── Executive Summary ──────────────────────────────────────────────────────

  const summarySection: any[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: "Executive Summary", bold: true, color: BRAND, size: 32 })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      shading: { type: ShadingType.SOLID, color: SECTION_BG, fill: SECTION_BG },
      children: [
        new TextRun({
          text: report.summary,
          color: DARK,
          size: 22,
          font: "Calibri",
        }),
      ],
    }),
    spacer(40, 40),
  ];

  // ── Body sections ──────────────────────────────────────────────────────────

  const bodySections: any[] = (report.sections ?? []).flatMap((section, idx) => {
    const result: any[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 120 },
        children: [
          new TextRun({
            text: `${idx + 1}.  ${section.heading}`,
            bold: true,
            color: BRAND,
            size: 28,
            font: "Calibri",
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun({ text: section.content, color: DARK, size: 22, font: "Calibri" }),
        ],
      }),
    ];

    if (section.citations?.length > 0) {
      result.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: "Sources: " + section.citations.map((c: number) => `[${c}]`).join("  "),
              color: BRAND,
              size: 18,
              italics: true,
            }),
          ],
        })
      );
    }

    return result;
  });

  // ── Knowledge graph entities (if any) ──────────────────────────────────────

  const kgEntities: any[] = (report as any).knowledge_graph?.entities ?? [];
  const kgSection: any[] = kgEntities.length > 0
    ? [
        spacer(240, 80),
        rule(),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: "Key Concepts", bold: true, color: BRAND, size: 32 })],
        }),
        ...kgEntities.slice(0, 12).map(
          (e: any) =>
            new Paragraph({
              spacing: { after: 80 },
              bullet: { level: 0 },
              children: [
                new TextRun({ text: e.name ?? "", bold: true, color: DARK, size: 22 }),
                e.description
                  ? new TextRun({ text: `  —  ${e.description}`, color: MUTED, size: 20 })
                  : new TextRun({ text: "" }),
              ],
            })
        ),
      ]
    : [];

  // ── References ─────────────────────────────────────────────────────────────

  const refSection: any[] = [
    spacer(240, 80),
    rule(),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: "References", bold: true, color: BRAND, size: 32 })],
    }),
    ...(report.sources ?? []).map(
      (src: any, i: number) =>
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: `[${i + 1}]  `, bold: true, color: BRAND, size: 20 }),
            new TextRun({ text: src.title ?? src.url ?? "Untitled", bold: true, color: DARK, size: 20 }),
            new TextRun({ text: "\n" }),
            new TextRun({
              text: src.url ?? "",
              color: BRAND,
              size: 18,
              underline: { type: UnderlineType.SINGLE, color: BRAND },
            }),
            src.summary
              ? new TextRun({ text: `\n${src.summary}`, color: MUTED, size: 18 })
              : new TextRun({ text: "" }),
          ],
        })
    ),
  ];

  // ── Assemble & export ──────────────────────────────────────────────────────

  const doc = new Document({
    creator: "ResearchMind",
    title: report.topic,
    description: report.summary,
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: DARK },
          paragraph: { spacing: { line: 340, after: 160 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 },
          },
        },
        children: [
          ...titleSection,
          ...summarySection,
          ...bodySections,
          ...kgSection,
          ...refSection,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ResearchMind-${topicSlug}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
