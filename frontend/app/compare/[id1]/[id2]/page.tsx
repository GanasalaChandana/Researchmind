"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { streamResearch } from "@/lib/api";
import { AgentEvent, ResearchReport } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle,
  Link2, BrainCircuit, Layers, ChevronDown, ChevronUp,
  BarChart3,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PanelState {
  events: AgentEvent[];
  report: ResearchReport | null;
  status: "loading" | "running" | "completed" | "failed";
}

// ─── Comparison analysis ──────────────────────────────────────────────────────

function analyzeReports(r1: ResearchReport, r2: ResearchReport) {
  // Shared sources by URL
  const urls1 = new Set((r1.sources ?? []).map((s: any) => s.url).filter(Boolean));
  const urls2 = new Set((r2.sources ?? []).map((s: any) => s.url).filter(Boolean));
  const sharedSources = [...urls1].filter(u => urls2.has(u));

  // Shared KG entities by name (case-insensitive)
  const ents1 = new Map<string, any>();
  const ents2 = new Map<string, any>();
  ((r1 as any).knowledge_graph?.entities ?? []).forEach((e: any) => ents1.set(e.name?.toLowerCase(), e));
  ((r2 as any).knowledge_graph?.entities ?? []).forEach((e: any) => ents2.set(e.name?.toLowerCase(), e));
  const sharedEntities = [...ents1.keys()].filter(k => ents2.has(k)).map(k => ents1.get(k));

  // Section headings overlap (simple substring match)
  const headings1 = (r1.sections ?? []).map(s => s.heading.toLowerCase());
  const headings2 = (r2.sections ?? []).map(s => s.heading.toLowerCase());
  const sharedHeadings = headings1.filter(h1 =>
    headings2.some(h2 => h1.includes(h2.split(" ").slice(0, 3).join(" ")) || h2.includes(h1.split(" ").slice(0, 3).join(" ")))
  );

  // Word counts
  const wordCount = (r: ResearchReport) =>
    ((r.summary ?? "") + " " + (r.sections ?? []).map(s => s.content).join(" ")).split(/\s+/).filter(Boolean).length;

  return {
    sharedSources,
    sharedEntities: sharedEntities.slice(0, 8),
    sharedHeadings,
    wordCount1: wordCount(r1),
    wordCount2: wordCount(r2),
    sourceOverlapPct: urls1.size > 0
      ? Math.round((sharedSources.length / Math.max(urls1.size, urls2.size)) * 100)
      : 0,
    uniqueToA: (r1.sources ?? []).filter((s: any) => s.url && !urls2.has(s.url)),
    uniqueToB: (r2.sources ?? []).filter((s: any) => s.url && !urls1.has(s.url)),
  };
}

// ─── Static comparison panel (for existing sessions) ─────────────────────────

function StaticPanel({
  report, label, accentColor, status,
}: {
  report: ResearchReport | null;
  label: string;
  accentColor: string;
  status: "loading" | "completed" | "failed";
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b dark:border-white/5 border-slate-200">
        <div className={`w-3 h-3 rounded-full ${accentColor}`} />
        <p className="text-sm font-semibold dark:text-white text-slate-900">{label}</p>
        <div className="ml-auto">
          {status === "loading" && <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />}
          {status === "completed" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {status === "failed" && <XCircle className="w-4 h-4 text-red-400" />}
        </div>
      </div>

      {status === "loading" && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
        </div>
      )}

      {status === "failed" && (
        <p className="text-xs text-red-400 text-center py-8">Failed to load report</p>
      )}

      {status === "completed" && report && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Sections", value: report.sections?.length ?? 0 },
              { label: "Sources",  value: report.sources?.length ?? 0 },
              { label: "Entities", value: (report as any).knowledge_graph?.entities?.length ?? 0 },
            ].map(stat => (
              <div key={stat.label} className="dark:bg-white/5 bg-slate-50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold dark:text-white text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="dark:bg-white/5 bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1.5 uppercase tracking-wider font-medium">Executive Summary</p>
            <p className="text-sm dark:text-slate-300 text-slate-700 leading-relaxed">{report.summary}</p>
          </div>

          {/* Sections */}
          <div className="space-y-2">
            {(report.sections ?? []).map((s, i) => (
              <div key={i} className="dark:bg-white/5 bg-slate-50 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <p className="text-xs font-semibold dark:text-white text-slate-900">{s.heading}</p>
                  {expanded === i
                    ? <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    : <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                </button>
                <AnimatePresence>
                  {expanded === i && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <p className="text-xs dark:text-slate-400 text-slate-600 leading-relaxed px-4 pb-3">{s.content}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Live streaming panel (for new comparisons) ───────────────────────────────

function StreamPanel({
  sessionId, topic, depth, label, accentColor, onComplete,
}: {
  sessionId: string;
  topic: string;
  depth: number;
  label: string;
  accentColor: string;
  onComplete?: (report: ResearchReport) => void;
}) {
  const [state, setState] = useState<PanelState>({ events: [], report: null, status: "running" });
  const completedRef = useRef(false);

  useEffect(() => {
    const es = streamResearch(sessionId, topic, depth);
    es.onmessage = (e) => {
      try {
        const event: AgentEvent = JSON.parse(e.data);
        setState(prev => ({ ...prev, events: [...prev.events, event] }));
        if (event.type === "done" && event.data?.report) {
          completedRef.current = true;
          const r = event.data!.report as unknown as ResearchReport;
          setState(prev => ({ ...prev, report: r, status: "completed" }));
          onComplete?.(r);
          es.close();
        }
        if (event.type === "error") {
          setState(prev => ({ ...prev, status: "failed" }));
          es.close();
        }
      } catch {}
    };
    es.onerror = () => {
      if (!completedRef.current)
        setState(prev => ({ ...prev, status: prev.status === "running" ? "failed" : prev.status }));
      es.close();
    };
    return () => es.close();
  }, [sessionId, topic, depth]);

  const { events, report, status } = state;

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-4 h-full">
      <div className="flex items-center gap-3 pb-3 border-b dark:border-white/5 border-slate-200">
        <div className={`w-3 h-3 rounded-full ${accentColor}`} />
        <div>
          <p className="text-sm font-semibold dark:text-white text-slate-900">{label}</p>
          <p className="text-xs text-slate-500">{depth} sub-questions</p>
        </div>
        <div className="ml-auto">
          {status === "running"    && <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />}
          {status === "completed"  && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {status === "failed"     && <XCircle className="w-4 h-4 text-red-400" />}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Events",   value: events.length },
          { label: "Sources",  value: report?.sources?.length ?? "—" },
          { label: "Entities", value: (report as any)?.knowledge_graph?.entities?.length ?? "—" },
        ].map(stat => (
          <div key={stat.label} className="dark:bg-white/5 bg-slate-50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold dark:text-white text-slate-900">{stat.value}</p>
            <p className="text-xs text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {report ? (
        <div className="flex-1 space-y-3">
          <div className="dark:bg-white/5 bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Summary</p>
            <p className="text-sm dark:text-slate-300 text-slate-700 leading-relaxed">{report.summary}</p>
          </div>
          {(report.sections ?? []).map((s, i) => (
            <div key={i} className="dark:bg-white/5 bg-slate-50 rounded-xl p-4">
              <p className="text-xs font-semibold dark:text-white text-slate-900 mb-2">{s.heading}</p>
              <p className="text-xs dark:text-slate-400 text-slate-600 leading-relaxed line-clamp-4">{s.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-2">
          {events.slice(-8).map((ev, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-500/60 mt-1.5 shrink-0" />
              <p className="text-xs dark:text-slate-400 text-slate-600 leading-relaxed">{ev.message}</p>
            </div>
          ))}
          {events.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-4">Waiting for agents...</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Comparison analysis panel ────────────────────────────────────────────────

function AnalysisPanel({
  report1, report2, label1, label2,
}: {
  report1: ResearchReport;
  report2: ResearchReport;
  label1: string;
  label2: string;
}) {
  const analysis = useMemo(() => analyzeReports(report1, report2), [report1, report2]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5 space-y-5 border dark:border-white/8 border-slate-200"
    >
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-brand-400" />
        <h3 className="text-sm font-semibold dark:text-white text-slate-900">Comparison Analysis</h3>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Source overlap", value: `${analysis.sourceOverlapPct}%`,     sub: `${analysis.sharedSources.length} shared` },
          { label: "Shared entities",value: analysis.sharedEntities.length,       sub: "in common" },
          { label: label1 + " words", value: analysis.wordCount1.toLocaleString(), sub: "word count" },
          { label: label2 + " words", value: analysis.wordCount2.toLocaleString(), sub: "word count" },
        ].map(m => (
          <div key={m.label} className="dark:bg-white/5 bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold dark:text-white text-slate-900">{m.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{m.sub}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 truncate">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Shared entities */}
      {analysis.sharedEntities.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <BrainCircuit className="w-3.5 h-3.5 text-brand-400" />
            <p className="text-xs font-medium dark:text-slate-300 text-slate-700">Shared Key Concepts</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.sharedEntities.map((e: any) => (
              <span key={e.name} className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20">
                {e.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Shared sources */}
      {analysis.sharedSources.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Link2 className="w-3.5 h-3.5 text-emerald-400" />
            <p className="text-xs font-medium dark:text-slate-300 text-slate-700">Sources in Both Reports ({analysis.sharedSources.length})</p>
          </div>
          <div className="space-y-1">
            {analysis.sharedSources.slice(0, 5).map(url => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors truncate"
              >
                <span className="w-1 h-1 rounded-full bg-emerald-400 shrink-0" />
                {url}
              </a>
            ))}
            {analysis.sharedSources.length > 5 && (
              <p className="text-xs text-slate-500">+{analysis.sharedSources.length - 5} more shared</p>
            )}
          </div>
        </div>
      )}

      {/* Unique sources */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: `Only in ${label1}`, sources: analysis.uniqueToA, color: "text-brand-400 bg-brand-500/10 border-brand-500/20" },
          { label: `Only in ${label2}`, sources: analysis.uniqueToB, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
        ].map(({ label, sources, color }) => (
          <div key={label}>
            <div className="flex items-center gap-1.5 mb-2">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-xs font-medium dark:text-slate-300 text-slate-700">{label} ({sources.length})</p>
            </div>
            <div className="space-y-1">
              {sources.slice(0, 4).map((s: any) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block text-xs px-2 py-1 rounded-lg border truncate ${color} hover:opacity-80 transition-opacity`}
                >
                  {s.title || s.url}
                </a>
              ))}
              {sources.length > 4 && (
                <p className="text-xs text-slate-500">+{sources.length - 4} more</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CompareResultsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id1 = params.id1 as string;
  const id2 = params.id2 as string;
  const topic = searchParams.get("topic") ?? "";
  const mode = searchParams.get("mode"); // "existing" | null

  // For existing-session mode: load reports statically
  const [report1, setReport1] = useState<ResearchReport | null>(null);
  const [report2, setReport2] = useState<ResearchReport | null>(null);
  const [status1, setStatus1] = useState<"loading" | "completed" | "failed">("loading");
  const [status2, setStatus2] = useState<"loading" | "completed" | "failed">("loading");

  useEffect(() => {
    if (mode !== "existing") return;
    const token = localStorage.getItem("rm_access_token");
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`/api/research/${id1}/report`, { headers })
      .then(r => r.json())
      .then(d => { setReport1(d?.report ?? null); setStatus1(d?.report ? "completed" : "failed"); })
      .catch(() => setStatus1("failed"));

    fetch(`/api/research/${id2}/report`, { headers })
      .then(r => r.json())
      .then(d => { setReport2(d?.report ?? null); setStatus2(d?.report ? "completed" : "failed"); })
      .catch(() => setStatus2("failed"));
  }, [mode, id1, id2]);

  const label1 = mode === "existing" ? "Session A" : "Depth 3 — Overview";
  const label2 = mode === "existing" ? "Session B" : "Depth 5 — Deep Dive";

  const pageTitle = mode === "existing"
    ? "Session Comparison"
    : topic || "Depth Comparison";

  const pageSubtitle = mode === "existing"
    ? "Side-by-side analysis of two research sessions"
    : "Side-by-side depth comparison";

  const bothDone = report1 && report2 && status1 === "completed" && status2 === "completed";

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-7xl mx-auto">
      <button
        onClick={() => router.push("/compare")}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> New comparison
      </button>

      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold dark:text-white text-slate-900">{pageTitle}</h1>
        <p className="dark:text-slate-400 text-slate-600 text-sm mt-1">{pageSubtitle}</p>
      </div>

      {/* Side-by-side panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {mode === "existing" ? (
          <>
            <StaticPanel report={report1} label={label1} accentColor="bg-brand-500"   status={status1} />
            <StaticPanel report={report2} label={label2} accentColor="bg-emerald-500" status={status2} />
          </>
        ) : (
          <>
            <StreamPanel sessionId={id1} topic={topic} depth={3} label={label1} accentColor="bg-brand-500"   onComplete={r => { setReport1(r); setStatus1("completed"); }} />
            <StreamPanel sessionId={id2} topic={topic} depth={5} label={label2} accentColor="bg-emerald-500" onComplete={r => { setReport2(r); setStatus2("completed"); }} />
          </>
        )}
      </div>

      {/* Analysis panel — shown when both reports are ready */}
      <AnimatePresence>
        {bothDone && (
          <AnalysisPanel
            report1={report1!}
            report2={report2!}
            label1="Session A"
            label2="Session B"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
