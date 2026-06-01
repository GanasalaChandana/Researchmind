"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { streamResearch } from "@/lib/api";
import { AgentEvent, ResearchReport, KnowledgeGraph } from "@/lib/types";
import AgentActivityFeed from "@/components/AgentActivityFeed";
import ReportViewer from "@/components/ReportViewer";
import KnowledgeGraphView from "@/components/KnowledgeGraph";
import { Brain, Network, FileText, Loader2 } from "lucide-react";

type Tab = "agents" | "graph" | "report";

export default function ResearchSessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.id as string;
  const topic = searchParams.get("topic") ?? "";
  const depth = Number(searchParams.get("depth") ?? 3);

  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [status, setStatus] = useState<"running" | "completed" | "failed">("running");
  const [tab, setTab] = useState<Tab>("agents");
  const completedRef = useRef(false); // guard: prevent onerror overwriting completed status

  useEffect(() => {
    if (!sessionId || !topic) return;

    const es = streamResearch(sessionId, topic, depth);

    es.onmessage = (e) => {
      try {
        const event: AgentEvent = JSON.parse(e.data);
        setEvents((prev) => [...prev, event]);

        if (event.type === "done" && event.data?.report) {
          completedRef.current = true;
          setReport(event.data.report as unknown as ResearchReport);
          setStatus("completed");
          setTab("report");
          es.close();
        }

        if (event.type === "error") {
          setStatus("failed");
          es.close();
        }
      } catch {}
    };

    // onerror fires when the server closes the stream — only treat as failure
    // if we never received a successful "done" event
    es.onerror = () => {
      if (!completedRef.current) {
        setStatus((prev) => (prev === "running" ? "failed" : prev));
      }
      es.close();
    };

    return () => es.close();
  }, [sessionId, topic, depth]);

  const graph: KnowledgeGraph = report?.knowledge_graph ?? { entities: [], relationships: [] };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "agents", label: "Agent Activity", icon: <Brain className="w-4 h-4" /> },
    { id: "graph", label: "Knowledge Graph", icon: <Network className="w-4 h-4" /> },
    { id: "report", label: "Report", icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          {status === "running" && <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />}
          {status === "completed" && <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />}
          {status === "failed" && <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />}
          <span className="text-sm text-slate-400 capitalize">{status}</span>
        </div>
        <h1 className="text-2xl font-bold text-white">{topic}</h1>
        <p className="text-slate-400 text-sm mt-1">{events.length} agent events</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass rounded-lg p-1 mb-6 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-brand-500 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.icon}
            {t.label}
            {t.id === "report" && report && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
            {t.id === "graph" && graph.entities.length > 0 && (
              <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded-full">
                {graph.entities.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "agents" && <AgentActivityFeed events={events} />}

      {tab === "graph" && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Knowledge Graph</h2>
          {graph.entities.length > 0 && (
            <p className="text-xs text-slate-500 mb-4">
              {graph.entities.length} entities · {graph.relationships.length} relationships · scroll to zoom · drag to pan
            </p>
          )}
          <KnowledgeGraphView graph={graph} />
        </div>
      )}

      {tab === "report" && (
        report
          ? <ReportViewer report={report} />
          : (
            <div className="text-center py-16 text-slate-500 text-sm">
              Report will appear when research is complete
            </div>
          )
      )}
    </div>
  );
}
