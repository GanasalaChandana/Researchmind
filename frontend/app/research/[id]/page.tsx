"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { streamResearch } from "@/lib/api";
import { AgentEvent, ResearchReport, KnowledgeGraph } from "@/lib/types";
import AgentActivityFeed from "@/components/AgentActivityFeed";
import ReportViewer from "@/components/ReportViewer";
import KnowledgeGraphView from "@/components/KnowledgeGraph";
import ResearchProgress, { Phase } from "@/components/ResearchProgress";
import KnowledgeGraphEmpty from "@/components/KnowledgeGraphEmpty";
import { Brain, Network, FileText, Loader2, Share2, Check, ArrowLeft } from "lucide-react";

type Tab = "agents" | "graph" | "report";

function agentToPhase(agent: string): Phase | null {
  if (agent === "orchestrator") return "orchestrating";
  if (agent === "search_agent") return "searching";
  if (agent === "reader_agent") return "reading";
  if (agent === "synthesizer") return "synthesizing";
  return null;
}

export default function ResearchSessionPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.id as string;
  const topic = searchParams.get("topic") ?? "";
  const depth = Number(searchParams.get("depth") ?? 3);

  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [status, setStatus] = useState<"running" | "completed" | "failed">("running");
  const [tab, setTab] = useState<Tab>("agents");
  const [phase, setPhase] = useState<Phase>("orchestrating");
  const [copied, setCopied] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;

    // Step 1: Check if session already has a saved report
    fetch(`/api/research/${sessionId}/report`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.report) {
          // Session already completed — load from DB, no streaming needed
          setReport(data.report as ResearchReport);
          setStatus(data.status ?? "completed");
          setPhase("done");
          completedRef.current = true;
          setTab("report");
          setInitializing(false);
        } else if (data?.status === "failed") {
          setStatus("failed");
          setPhase("done");
          setInitializing(false);
        } else {
          // Session is still running — start SSE stream
          setInitializing(false);
          startStream();
        }
      })
      .catch(() => {
        setInitializing(false);
        startStream();
      });

    function startStream() {
      if (!topic) return;
      const es = streamResearch(sessionId, topic, depth);

      es.onmessage = (e) => {
        try {
          const event: AgentEvent = JSON.parse(e.data);
          setEvents((prev) => [...prev, event]);

          const newPhase = agentToPhase(event.agent);
          if (newPhase) setPhase(newPhase);

          if (event.type === "done" && event.data?.report) {
            completedRef.current = true;
            setReport(event.data.report as unknown as ResearchReport);
            setStatus("completed");
            setPhase("done");
            setTab("report");
            es.close();
          }

          if (event.type === "error") {
            setStatus("failed");
            setPhase("done");
            es.close();
          }
        } catch {}
      };

      es.onerror = () => {
        if (!completedRef.current) {
          setStatus((prev) => (prev === "running" ? "failed" : prev));
          setPhase("done");
        }
        es.close();
      };
    }
  }, [sessionId]);

  async function handleShare() {
    const url = `${window.location.origin}/research/${sessionId}?topic=${encodeURIComponent(topic)}&depth=${depth}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const graph: KnowledgeGraph = report?.knowledge_graph ?? { entities: [], relationships: [] };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "agents", label: "Agent Activity", icon: <Brain className="w-4 h-4" /> },
    { id: "graph",  label: "Knowledge Graph", icon: <Network className="w-4 h-4" /> },
    { id: "report", label: "Report",           icon: <FileText className="w-4 h-4" /> },
  ];

  // Show loading spinner while checking DB
  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          <p className="text-sm text-slate-400">Loading research...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              {status === "running"   && <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />}
              {status === "completed" && <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />}
              {status === "failed"    && <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />}
              <span className="text-sm text-slate-400 capitalize">{status}</span>
              {events.length > 0 && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="text-sm text-slate-500">{events.length} events</span>
                </>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              {topic || report?.topic || "Research Session"}
            </h1>
          </div>

          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-3 py-2 glass rounded-lg text-sm text-slate-300 hover:text-white transition-colors shrink-0"
          >
            {copied
              ? <><Check className="w-4 h-4 text-emerald-400" /> Copied!</>
              : <><Share2 className="w-4 h-4" /> Share</>
            }
          </button>
        </div>
      </div>

      {/* Progress bar — only shown while running */}
      {status === "running" && <ResearchProgress phase={phase} />}

      {/* Tabs */}
      <div className="flex gap-1 glass rounded-lg p-1 mb-6 w-full sm:w-fit overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
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
      {tab === "agents" && (
        status === "completed" && events.length === 0
          ? (
            <div className="glass rounded-xl p-8 text-center">
              <p className="text-slate-300 font-medium mb-1">Report loaded from history</p>
              <p className="text-slate-500 text-sm">This research was completed in a previous session.</p>
              <button
                onClick={() => setTab("report")}
                className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg transition-colors"
              >
                <FileText className="w-4 h-4" /> View Report
              </button>
            </div>
          )
          : <AgentActivityFeed events={events} />
      )}

      {tab === "graph" && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Knowledge Graph</h2>
          {graph.entities.length > 0 && (
            <p className="text-xs text-slate-500 mb-4">
              {graph.entities.length} entities · {graph.relationships.length} relationships · scroll to zoom · drag to pan
            </p>
          )}
          {graph.entities.length === 0
            ? <KnowledgeGraphEmpty status={status} phase={phase} />
            : <KnowledgeGraphView graph={graph} />
          }
        </div>
      )}

      {tab === "report" && (
        report
          ? <ReportViewer report={report} sessionId={sessionId} />
          : (
            <div className="text-center py-16 text-slate-500 text-sm">
              Report will appear when research is complete
            </div>
          )
      )}
    </div>
  );
}
