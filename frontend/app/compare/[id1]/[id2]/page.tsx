"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { streamResearch } from "@/lib/api";
import { AgentEvent, ResearchReport } from "@/lib/types";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, FileText } from "lucide-react";

interface PanelState {
  events: AgentEvent[];
  report: ResearchReport | null;
  status: "running" | "completed" | "failed";
}

function Panel({
  sessionId, topic, depth, label, color,
}: {
  sessionId: string;
  topic: string;
  depth: number;
  label: string;
  color: string;
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
          setState(prev => ({
            ...prev,
            report: event.data!.report as unknown as ResearchReport,
            status: "completed",
          }));
          es.close();
        }
        if (event.type === "error") {
          setState(prev => ({ ...prev, status: "failed" }));
          es.close();
        }
      } catch {}
    };
    es.onerror = () => {
      if (!completedRef.current) setState(prev => ({ ...prev, status: prev.status === "running" ? "failed" : prev.status }));
      es.close();
    };
    return () => es.close();
  }, [sessionId, topic, depth]);

  const { events, report, status } = state;

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-4 h-full">
      {/* Header */}
      <div className={`flex items-center gap-3 pb-3 border-b border-white/5`}>
        <div className={`w-3 h-3 rounded-full ${color}`} />
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-xs text-slate-500">{depth} sub-questions</p>
        </div>
        <div className="ml-auto">
          {status === "running" && <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />}
          {status === "completed" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {status === "failed" && <XCircle className="w-4 h-4 text-red-400" />}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Events", value: events.length },
          { label: "Sources", value: report?.sources.length ?? "—" },
          { label: "Entities", value: report?.knowledge_graph.entities.length ?? "—" },
        ].map(stat => (
          <div key={stat.label} className="bg-white/5 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-white">{stat.value}</p>
            <p className="text-xs text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Report */}
      {report ? (
        <div className="flex-1 space-y-3 overflow-y-auto max-h-[500px] pr-1">
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Summary</p>
            <p className="text-sm text-slate-300 leading-relaxed">{report.summary}</p>
          </div>
          {report.sections.map((s, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4">
              <p className="text-xs font-semibold text-white mb-2">{s.heading}</p>
              <p className="text-xs text-slate-400 leading-relaxed line-clamp-4">{s.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-[500px]">
          {events.slice(-8).map((ev, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-500/60 mt-1.5 shrink-0" />
              <p className="text-xs text-slate-400 leading-relaxed">{ev.message}</p>
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

export default function CompareResultsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id1 = params.id1 as string;
  const id2 = params.id2 as string;
  const topic = searchParams.get("topic") ?? "";

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-7xl mx-auto">
      <button
        onClick={() => router.push("/compare")}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> New comparison
      </button>

      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-white">{topic}</h1>
        <p className="text-slate-400 text-sm mt-1">Side-by-side depth comparison</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel sessionId={id1} topic={topic} depth={3} label="Depth 3 — Overview" color="bg-brand-500" />
        <Panel sessionId={id2} topic={topic} depth={5} label="Depth 5 — Deep Dive" color="bg-emerald-500" />
      </div>
    </div>
  );
}
