"use client";
import { useState, useEffect } from "react";
import { ResearchReport } from "@/lib/types";
import { ExternalLink, Download, Loader2, Share2, FileText, Copy, Check } from "lucide-react";
import { motion } from "framer-motion";
import { exportToPdf } from "@/lib/exportPdf";
import toast from "react-hot-toast";

export default function ReportViewer({ report, sessionId }: { report: ResearchReport; sessionId?: string }) {
  const [exporting, setExporting] = useState(false);
  const [citationStyle, setCitationStyle] = useState<"apa" | "mla" | "chicago">("apa");
  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [citations, setCitations] = useState<{ [key: string]: string }>({});

  // Deduplicate sources by title (frontend safety check) and create citation mapping
  const deduplicationResult = (() => {
    const seen = new Map<string, number>();
    const unique = [];
    const indexMap: { [oldIndex: number]: number } = {}; // Maps old citation index to new

    for (let i = 0; i < (report.sources || []).length; i++) {
      const source = report.sources[i];
      const titleLower = (source.title || "").toLowerCase().trim();

      if (titleLower && seen.has(titleLower)) {
        // Duplicate - map to existing index
        indexMap[i] = seen.get(titleLower)!;
      } else {
        // New source
        if (titleLower) {
          seen.set(titleLower, unique.length);
        }
        indexMap[i] = unique.length;
        unique.push(source);
      }
    }

    return { uniqueSources: unique, indexMap };
  })();

  const uniqueSources = deduplicationResult.uniqueSources;
  const indexMap = deduplicationResult.indexMap;

  async function handleExport() {
    setExporting(true);
    try {
      await exportToPdf(report);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportMarkdown() {
    try {
      const response = await fetch(`/api/research/${sessionId}/export/markdown`);
      if (!response.ok) throw new Error("Export failed");
      const data = await response.json();
      const element = document.createElement("a");
      element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(data.content));
      element.setAttribute("download", data.filename || `research.md`);
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success("Markdown exported!");
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to export markdown");
    }
  }

  async function handleExportHTML() {
    try {
      const response = await fetch(`/api/research/${sessionId}/export/html`);
      if (!response.ok) throw new Error("Export failed");
      const data = await response.json();
      const element = document.createElement("a");
      element.setAttribute("href", "data:text/html;charset=utf-8," + encodeURIComponent(data.content));
      element.setAttribute("download", data.filename || `research.html`);
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success("HTML exported!");
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to export HTML");
    }
  }

  async function handleShare() {
    try {
      const response = await fetch(`/api/research/${sessionId}/share`, { method: "POST" });
      const data = await response.json();
      const shareUrl = `${window.location.origin}/shared/${data.share_token}`;
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Share link copied!");
    } catch (err) {
      toast.error("Failed to create share link");
    }
  }

  useEffect(() => {
    if (!sessionId) return;

    async function fetchCitations() {
      try {
        const response = await fetch(`/api/research/${sessionId}/citations?style=${citationStyle}`);
        if (response.ok) {
          const data = await response.json();
          setCitations(data.citations || {});
        }
      } catch (err) {
        console.error("Failed to fetch citations:", err);
      }
    }

    fetchCitations();
  }, [citationStyle, sessionId]);

  return (
    <div className="space-y-8">
      {/* Header row with export buttons */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-bold text-white">{report.topic}</h1>
          <button
            onClick={() => setShowShare(!showShare)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span className="text-sm">Share</span>
          </button>
        </div>

        {/* Share Modal */}
        {showShare && (
          <div className="glass rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/shared/link`}
                className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-slate-300"
              />
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-3 py-2 bg-brand-500 hover:bg-brand-600 rounded transition-colors text-white"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Export options */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDF
          </button>
          <button
            onClick={handleExportMarkdown}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
          >
            <FileText className="w-4 h-4" />
            Markdown
          </button>
          <button
            onClick={handleExportHTML}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
          >
            <FileText className="w-4 h-4" />
            HTML
          </button>
        </div>

        {/* Citation format selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Citation style:</span>
          {(["apa", "mla", "chicago"] as const).map((style) => (
            <button
              key={style}
              onClick={() => setCitationStyle(style)}
              className={`text-xs px-3 py-1 rounded transition-colors uppercase ${
                citationStyle === style ? "bg-brand-500 text-white" : "text-slate-400 hover:text-slate-200 glass"
              }`}
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="glass rounded-xl p-6 border-l-4 border-brand-500">
        <h2 className="text-lg font-semibold text-white mb-2">Executive Summary</h2>
        <p className="text-slate-300 leading-relaxed">{report.summary}</p>
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
            <h3 className="text-base font-semibold text-white mb-3">{section.heading}</h3>
            <p className="text-slate-300 leading-relaxed text-sm whitespace-pre-wrap">{section.content}</p>
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

      {/* Formatted Citations */}
      {Object.keys(citations).length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Formatted Bibliography ({citationStyle.toUpperCase()})
          </h2>
          <div className="glass rounded-xl p-6 space-y-3">
            {Object.entries(citations).map(([id, citation]) => (
              <div key={id} className="text-sm text-slate-300 leading-relaxed">
                <span className="text-brand-400 font-semibold">[{id}]</span> {citation}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Sources ({uniqueSources.length})</h2>
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
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{source.summary}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
