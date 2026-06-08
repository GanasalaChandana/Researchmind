"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import { ResearchReport } from "@/lib/types";
import {
  ExternalLink, Download, Loader2, Share2,
  FileText, Copy, Check, BookOpen, ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { exportToPdf } from "@/lib/exportPdf";
import { exportToDocx } from "@/lib/exportDocx";
import toast from "react-hot-toast";

type CitationStyle = "apa" | "mla" | "chicago";

function formatCitation(source: any, index: number, style: CitationStyle): string {
  const title = source.title || "Untitled";
  const url = source.url || "";
  const year = new Date().getFullYear();
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  if (style === "apa") {
    return `[${index}] ${title}. (${year}). Retrieved from ${url}`;
  } else if (style === "mla") {
    return `[${index}] "${title}." Web. Accessed ${today}. <${url}>`;
  } else {
    // Chicago
    return `[${index}] "${title}." Accessed ${today}. ${url}.`;
  }
}

export default function ReportViewer({ report, sessionId }: { report: ResearchReport; sessionId?: string }) {
  const [exporting, setExporting] = useState<string | null>(null); // which format is loading
  const [citationStyle, setCitationStyle] = useState<CitationStyle>("apa");
  const [showShare, setShowShare] = useState(false);
  const [showCitations, setShowCitations] = useState(false);
  const [copied, setCopied] = useState(false);
  const [citationsCopied, setCitationsCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Deduplicate sources by title
  const { uniqueSources, indexMap } = useMemo(() => {
    const seen = new Map<string, number>();
    const unique: any[] = [];
    const indexMap: { [oldIndex: number]: number } = {};
    for (let i = 0; i < (report.sources || []).length; i++) {
      const src = report.sources[i];
      const key = (src.title || "").toLowerCase().trim();
      if (key && seen.has(key)) {
        indexMap[i] = seen.get(key)!;
      } else {
        if (key) seen.set(key, unique.length);
        indexMap[i] = unique.length;
        unique.push(src);
      }
    }
    return { uniqueSources: unique, indexMap };
  }, [report.sources]);

  // Build citations purely client-side — no backend call needed
  const citations = useMemo(() => {
    return uniqueSources.map((src, i) =>
      formatCitation(src, i + 1, citationStyle)
    );
  }, [uniqueSources, citationStyle]);

  async function handleExportPdf() {
    setExporting("pdf"); setShowExportMenu(false);
    try { await exportToPdf(report); toast.success("PDF downloaded!"); }
    catch { toast.error("PDF export failed"); }
    finally { setExporting(null); }
  }

  async function handleExportDocx() {
    setExporting("docx"); setShowExportMenu(false);
    try { await exportToDocx(report); toast.success("Word document downloaded!"); }
    catch { toast.error("DOCX export failed"); }
    finally { setExporting(null); }
  }

  async function handleExportMarkdown() {
    setExporting("md"); setShowExportMenu(false);
    try {
      const res = await fetch(`/api/research/${sessionId}/export/markdown`);
      if (!res.ok) throw new Error();
      const { content, filename } = await res.json();
      const a = document.createElement("a");
      a.href = "data:text/plain;charset=utf-8," + encodeURIComponent(content);
      a.download = filename || "research.md";
      a.click();
      toast.success("Markdown downloaded!");
    } catch { toast.error("Failed to export Markdown"); }
    finally { setExporting(null); }
  }

  async function handleExportHtml() {
    setExporting("html"); setShowExportMenu(false);
    try {
      const res = await fetch(`/api/research/${sessionId}/export/html`);
      if (!res.ok) throw new Error();
      const { content, filename } = await res.json();
      const a = document.createElement("a");
      a.href = "data:text/html;charset=utf-8," + encodeURIComponent(content);
      a.download = filename || "research.html";
      a.click();
      toast.success("HTML downloaded!");
    } catch { toast.error("Failed to export HTML"); }
    finally { setExporting(null); }
  }

  async function handleShare() {
    try {
      const res = await fetch(`/api/research/${sessionId}/share`, { method: "POST" });
      const data = await res.json();
      const shareUrl = `${window.location.origin}/shared/${data.share_token}`;
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Share link copied!");
    } catch { toast.error("Failed to create share link"); }
  }

  function handleCopyAllCitations() {
    const text = citations.join("\n\n");
    navigator.clipboard.writeText(text);
    setCitationsCopied(true);
    setTimeout(() => setCitationsCopied(false), 2000);
    toast.success("Citations copied!");
  }

  return (
    <div className="space-y-8">
      {/* Header: title + share */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-bold dark:text-white text-slate-900">{report.topic}</h1>
          <button
            onClick={() => setShowShare(!showShare)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg dark:text-slate-300 text-slate-600 hover:text-white hover:bg-brand-500/20 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span className="text-sm">Share</span>
          </button>
        </div>

        {/* Share panel */}
        {showShare && (
          <div className="glass rounded-lg p-4 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/shared/link`}
              className="flex-1 dark:bg-white/5 bg-slate-100 border dark:border-white/10 border-slate-200 rounded px-3 py-2 text-sm dark:text-slate-300 text-slate-700"
            />
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-3 py-2 bg-brand-500 hover:bg-brand-600 rounded transition-colors text-white"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}

        {/* Export dropdown */}
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            disabled={!!exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            {exporting
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Download className="w-4 h-4" />}
            {exporting ? "Exporting…" : "Export"}
            {!exporting && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExportMenu ? "rotate-180" : ""}`} />}
          </button>

          <AnimatePresence>
            {showExportMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute left-0 top-full mt-1.5 glass rounded-xl overflow-hidden z-30 w-52 border dark:border-white/10 border-slate-200 shadow-xl"
              >
                {[
                  { label: "PDF Document",    sub: "Best for printing / sharing",  icon: "📄", action: handleExportPdf  },
                  { label: "Word (DOCX)",     sub: "Editable in Microsoft Word",   icon: "📝", action: handleExportDocx },
                  { label: "Markdown (.md)",  sub: "For docs, GitHub, Notion",     icon: "⌨️", action: handleExportMarkdown },
                  { label: "HTML Page",       sub: "Self-contained web page",      icon: "🌐", action: handleExportHtml },
                ].map(({ label, sub, icon, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:dark:bg-white/5 hover:bg-slate-50 transition-colors border-b last:border-b-0 dark:border-white/5 border-slate-100"
                  >
                    <span className="text-lg leading-none mt-0.5">{icon}</span>
                    <div>
                      <p className="text-sm font-medium dark:text-slate-200 text-slate-800">{label}</p>
                      <p className="text-xs dark:text-slate-500 text-slate-400 mt-0.5">{sub}</p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Summary */}
      <div className="glass rounded-xl p-6 border-l-4 border-brand-500">
        <h2 className="text-lg font-semibold dark:text-white text-slate-900 mb-2">Executive Summary</h2>
        <p className="dark:text-slate-300 text-slate-700 leading-relaxed">{report.summary}</p>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {report.sections.map((section, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass rounded-xl p-6"
          >
            <h3 className="text-base font-semibold dark:text-white text-slate-900 mb-3">{section.heading}</h3>
            <p className="dark:text-slate-300 text-slate-700 leading-relaxed text-sm whitespace-pre-wrap">{section.content}</p>
            {section.citations?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {section.citations.map((c) => {
                  const newIndex = indexMap[c - 1];
                  const source = uniqueSources[newIndex];
                  return (
                    <a
                      key={c}
                      href={source?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded-full hover:bg-brand-500/30 transition-colors"
                    >
                      [{newIndex + 1}] <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  );
                })}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* ── Citations ── */}
      <div className="glass rounded-xl overflow-hidden">
        <button
          onClick={() => setShowCitations(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4 dark:hover:bg-white/5 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-semibold dark:text-white text-slate-900">
              Citations ({uniqueSources.length})
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Style selector */}
            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
              {(["apa", "mla", "chicago"] as CitationStyle[]).map((style) => (
                <button
                  key={style}
                  onClick={() => setCitationStyle(style)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium uppercase transition-colors ${
                    citationStyle === style
                      ? "bg-brand-500 text-white"
                      : "dark:text-slate-400 text-slate-500 dark:hover:text-white hover:text-slate-900"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
            <ChevronDown className={`w-4 h-4 dark:text-slate-400 text-slate-500 transition-transform ${showCitations ? "rotate-180" : ""}`} />
          </div>
        </button>

        <AnimatePresence>
          {showCitations && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-6 space-y-3 border-t dark:border-white/10 border-slate-200 pt-4">
                {/* Copy all */}
                <button
                  onClick={handleCopyAllCitations}
                  className="flex items-center gap-2 text-xs dark:text-slate-400 text-slate-500 hover:text-brand-400 transition-colors"
                >
                  {citationsCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {citationsCopied ? "Copied!" : "Copy all citations"}
                </button>

                {citations.map((cite, i) => (
                  <div key={i} className="dark:bg-white/5 bg-slate-50 rounded-lg p-3">
                    <p className="text-xs dark:text-slate-300 text-slate-700 leading-relaxed font-mono">{cite}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sources */}
      <div>
        <h2 className="text-lg font-semibold dark:text-white text-slate-900 mb-4">Sources ({uniqueSources.length})</h2>
        <div className="space-y-3">
          {uniqueSources.map((source, i) => (
            <div key={i} className="glass rounded-lg p-4 flex gap-4">
              <span className="text-brand-400 font-mono text-sm shrink-0 mt-0.5">[{i + 1}]</span>
              <div className="min-w-0">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-400 hover:text-blue-300 truncate block"
                >
                  {source.title || source.url}
                </a>
                <p className="text-xs dark:text-slate-400 text-slate-500 mt-1 line-clamp-2">{source.summary}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
