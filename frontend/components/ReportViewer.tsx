"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import { ResearchReport } from "@/lib/types";
import {
  ExternalLink, Download, Loader2, Share2,
  FileText, Copy, Check, BookOpen, ChevronDown, Clock,
  ShieldCheck, ShieldAlert, ShieldX, FlaskConical,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { exportToPdf } from "@/lib/exportPdf";
import { exportToDocx } from "@/lib/exportDocx";
import toast from "react-hot-toast";
import { useLanguage } from "@/context/LanguageContext";

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
  const { t } = useLanguage();
  const [exporting, setExporting] = useState<string | null>(null); // which format is loading
  const [citationStyle, setCitationStyle] = useState<CitationStyle>("apa");
  const [showShare, setShowShare] = useState(false);
  const [showCitations, setShowCitations] = useState(false);
  const [copied, setCopied] = useState(false);
  const [citationsCopied, setCitationsCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [factCheckMode, setFactCheckMode] = useState(false);
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

  const readingTime = useMemo(() => {
    const words = [
      report.summary,
      ...report.sections.map(s => s.content),
    ].join(" ").split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.round(words / 200));
    return `${mins} min read`;
  }, [report.summary, report.sections]);

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

  function renderContent(content: string, citationChecks: Record<string, { status: string; reason: string }>) {
    if (!factCheckMode) {
      return <p className="dark:text-slate-300 text-slate-700 leading-relaxed text-sm whitespace-pre-wrap">{content}</p>;
    }
    // Split on [N] markers and highlight them inline
    const parts = content.split(/(\[\d+\])/g);
    return (
      <p className="dark:text-slate-300 text-slate-700 leading-relaxed text-sm whitespace-pre-wrap">
        {parts.map((part, idx) => {
          const match = part.match(/^\[(\d+)\]$/);
          if (!match) return part;
          const num = match[1];
          const check = citationChecks?.[num];
          if (!check) return <span key={idx} className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-300 font-mono">{part}</span>;
          const styles = {
            verified:   "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
            partial:    "bg-amber-500/20   text-amber-300   border border-amber-500/30",
            unverified: "bg-red-500/20     text-red-300     border border-red-500/30",
          }[check.status as "verified" | "partial" | "unverified"] ?? "bg-brand-500/15 text-brand-300";
          const icons = {
            verified:   <ShieldCheck className="w-2.5 h-2.5 shrink-0" />,
            partial:    <ShieldAlert  className="w-2.5 h-2.5 shrink-0" />,
            unverified: <ShieldX      className="w-2.5 h-2.5 shrink-0" />,
          }[check.status as "verified" | "partial" | "unverified"];
          return (
            <span key={idx} className="relative group/fc inline-flex items-center gap-0.5">
              <span className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded font-mono cursor-help ${styles}`}>
                {icons}{part}
              </span>
              {/* Tooltip */}
              <span className="absolute bottom-full left-0 mb-1.5 w-52 glass rounded-lg p-2.5 text-xs border dark:border-white/10 border-slate-200 shadow-xl z-30 hidden group-hover/fc:block pointer-events-none">
                <span className={`font-semibold capitalize block mb-1 ${
                  check.status === "verified" ? "text-emerald-400" :
                  check.status === "partial"  ? "text-amber-400"  : "text-red-400"
                }`}>{check.status}</span>
                <span className="dark:text-slate-300 text-slate-700 leading-relaxed">{check.reason}</span>
              </span>
            </span>
          );
        })}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header: title + share */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg sm:text-xl font-bold dark:text-white text-slate-900">{report.topic}</h1>
            <span className="flex items-center gap-1 text-xs dark:text-slate-500 text-slate-400">
              <Clock className="w-3 h-3" />{readingTime}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Fact-check toggle */}
            <button
              onClick={() => setFactCheckMode(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                factCheckMode
                  ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                  : "dark:text-slate-400 text-slate-500 hover:text-violet-400 hover:bg-violet-500/10"
              }`}
              title="Toggle fact-check mode — highlights citation markers with verification status"
            >
              <FlaskConical className="w-4 h-4" />
              <span className="hidden sm:inline">Fact-check</span>
            </button>
            <button
              onClick={() => setShowShare(!showShare)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg dark:text-slate-300 text-slate-600 hover:text-white hover:bg-brand-500/20 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span className="text-sm">{t.share}</span>
            </button>
          </div>
        </div>

        {/* Fact-check legend */}
        <AnimatePresence>
          {factCheckMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-violet-500/8 border border-violet-500/20 text-xs flex-wrap">
                <span className="flex items-center gap-1.5 text-violet-300 font-medium">
                  <FlaskConical className="w-3.5 h-3.5" /> Fact-check mode on — citation markers are highlighted:
                </span>
                <span className="flex items-center gap-1 text-emerald-300"><ShieldCheck className="w-3 h-3" /> Verified</span>
                <span className="flex items-center gap-1 text-amber-300"><ShieldAlert className="w-3 h-3" /> Partial</span>
                <span className="flex items-center gap-1 text-red-300"><ShieldX className="w-3 h-3" /> Unverified</span>
                <span className="dark:text-slate-500 text-slate-400">Hover a marker to see details.</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
            {exporting ? t.exporting : t.export}
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
                  { label: t.exportPdfLabel,  sub: t.exportPdfSub,  icon: "📄", action: handleExportPdf  },
                  { label: t.exportWordLabel, sub: t.exportWordSub, icon: "📝", action: handleExportDocx },
                  { label: t.exportMdLabel,   sub: t.exportMdSub,   icon: "⌨️", action: handleExportMarkdown },
                  { label: t.exportHtmlLabel, sub: t.exportHtmlSub, icon: "🌐", action: handleExportHtml },
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

      {/* Citation verification summary banner */}
      {(() => {
        const allChecks = report.sections.flatMap(s =>
          Object.values((s as any).citation_checks ?? {})
        ) as Array<{ status: string; reason: string }>;
        if (allChecks.length === 0) return null;
        const verified  = allChecks.filter(c => c.status === "verified").length;
        const partial   = allChecks.filter(c => c.status === "partial").length;
        const unverified = allChecks.filter(c => c.status === "unverified").length;
        const pct = Math.round((verified / allChecks.length) * 100);
        const barColor = pct >= 75 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-red-400";
        return (
          <div className="glass rounded-xl p-4 border dark:border-white/8 border-slate-200">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-400" />
                <span className="text-sm font-semibold dark:text-white text-slate-900">{t.citationVerification}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-emerald-400"><ShieldCheck className="w-3 h-3" />{verified} {t.citVerified}</span>
                <span className="flex items-center gap-1 text-amber-400"><ShieldAlert className="w-3 h-3" />{partial} {t.citPartial}</span>
                <span className="flex items-center gap-1 text-red-400"><ShieldX className="w-3 h-3" />{unverified} {t.citUnverified}</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[10px] dark:text-slate-500 text-slate-500 mt-1.5">
              {t.citSummary(pct, allChecks.length)}
            </p>
          </div>
        );
      })()}

      {/* Key Takeaways */}
      {report.key_takeaways && report.key_takeaways.length > 0 && (
        <div className="glass rounded-xl p-6 border-l-4 border-emerald-500">
          <h2 className="text-lg font-semibold dark:text-white text-slate-900 mb-3 flex items-center gap-2">
            <span>💡</span> Key Takeaways
          </h2>
          <ul className="space-y-2">
            {report.key_takeaways.map((point, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="dark:text-slate-300 text-slate-700 text-sm leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary */}
      <div className="glass rounded-xl p-6 border-l-4 border-brand-500">
        <h2 className="text-lg font-semibold dark:text-white text-slate-900 mb-2">{t.executiveSummary}</h2>
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
            {renderContent(section.content, (section as any).citation_checks ?? {})}
            {section.citations?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {section.citations.map((c) => {
                  const newIndex = indexMap[c - 1];
                  const source = uniqueSources[newIndex];
                  const check = (section as any).citation_checks?.[String(c)];
                  const statusStyle = check ? {
                    verified:   { cls: "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/20", icon: <ShieldCheck className="w-2.5 h-2.5" /> },
                    partial:    { cls: "bg-amber-500/15   text-amber-300   hover:bg-amber-500/25   border border-amber-500/20",   icon: <ShieldAlert  className="w-2.5 h-2.5" /> },
                    unverified: { cls: "bg-red-500/15     text-red-300     hover:bg-red-500/25     border border-red-500/20",     icon: <ShieldX      className="w-2.5 h-2.5" /> },
                  }[check.status as "verified" | "partial" | "unverified"] : null;

                  return (
                    <span key={c} className="relative group/cite inline-flex items-center">
                      <a
                        href={source?.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors ${
                          statusStyle
                            ? statusStyle.cls
                            : "bg-brand-500/20 text-brand-300 hover:bg-brand-500/30"
                        }`}
                      >
                        {statusStyle && statusStyle.icon}
                        [{newIndex + 1}]
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      {/* Tooltip on hover */}
                      {check && (
                        <div className="absolute bottom-full left-0 mb-1.5 w-56 glass rounded-lg p-2.5 text-xs border dark:border-white/10 border-slate-200 shadow-xl z-20 hidden group-hover/cite:block pointer-events-none">
                          <p className={`font-semibold capitalize mb-1 ${
                            check.status === "verified"   ? "text-emerald-400" :
                            check.status === "partial"    ? "text-amber-400"   : "text-red-400"
                          }`}>
                            {check.status}
                          </p>
                          <p className="dark:text-slate-300 text-slate-700 leading-relaxed">{check.reason}</p>
                        </div>
                      )}
                    </span>
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
        <h2 className="text-lg font-semibold dark:text-white text-slate-900 mb-4">{t.sources} ({uniqueSources.length})</h2>
        <div className="space-y-3">
          {uniqueSources.map((source, i) => {
            const q = source.quality_score ?? 0;
            const tier = source.domain_authority ?? "low";
            const hasScore = (source.quality_score ?? 0) > 0;

            const TIER_META: Record<string, { label: string; bar: string; pill: string }> = {
              high:   { label: t.highAuthority,   bar: "bg-emerald-400", pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
              medium: { label: t.mediumAuthority, bar: "bg-amber-400",   pill: "bg-amber-500/10  text-amber-400  border-amber-500/20"  },
              low:    { label: t.lowAuthority,    bar: "bg-slate-500",   pill: "bg-slate-500/10  text-slate-400  border-slate-500/20"  },
            };
            const tierMeta = TIER_META[tier] ?? { label: "Unknown", bar: "bg-slate-500", pill: "bg-slate-500/10 text-slate-400 border-slate-500/20" };

            return (
              <div key={i} className="glass rounded-xl overflow-hidden">
                {/* Quality bar — thin colored top border */}
                {hasScore && (
                  <div className="h-0.5 w-full bg-white/5">
                    <div className={`h-full ${tierMeta.bar} transition-all`} style={{ width: `${q}%` }} />
                  </div>
                )}

                <div className="p-4 flex gap-4">
                  <span className="text-brand-400 font-mono text-sm shrink-0 mt-0.5">[{i + 1}]</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-400 hover:text-blue-300 line-clamp-1 flex-1"
                      >
                        {source.title || source.url}
                      </a>
                      {/* Quality badges */}
                      {hasScore && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${tierMeta.pill}`}>
                            {tierMeta.label}
                          </span>
                          <span className="text-[10px] font-mono font-bold dark:text-slate-400 text-slate-500" title={t.qualityScore}>
                            {Math.round(q)}
                          </span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs dark:text-slate-400 text-slate-500 line-clamp-2 leading-relaxed">{source.summary}</p>

                    {/* Recency signal */}
                    {hasScore && source.recency_score !== undefined && (
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] dark:text-slate-600 text-slate-400">{t.recency}</span>
                          <div className="w-16 h-1 rounded-full bg-white/8 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                source.recency_score > 0.7 ? "bg-emerald-400" :
                                source.recency_score > 0.4 ? "bg-amber-400" : "bg-slate-500"
                              }`}
                              style={{ width: `${source.recency_score * 100}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] dark:text-slate-600 text-slate-400">Quality</span>
                          <div className="w-16 h-1 rounded-full bg-white/8 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${tierMeta.bar}`}
                              style={{ width: `${q}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
