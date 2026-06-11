"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { streamResearch, createShareLink } from "@/lib/api";
import { AgentEvent, ResearchReport, KnowledgeGraph } from "@/lib/types";
import AgentActivityFeed from "@/components/AgentActivityFeed";
import ReportViewer from "@/components/ReportViewer";
import KnowledgeGraphView from "@/components/KnowledgeGraph";
import ResearchProgress, { Phase } from "@/components/ResearchProgress";
import KnowledgeGraphEmpty from "@/components/KnowledgeGraphEmpty";
import RelatedResearch from "@/components/RelatedResearch";
import ReportChat from "@/components/ReportChat";
import ChainCreator from "@/components/ChainCreator";
import { Brain, Network, FileText, Loader2, Share2, Check, ArrowLeft, X, Copy } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "@/context/LanguageContext";

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
  const language = searchParams.get("language") ?? "English";

  const { t } = useLanguage();
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [status, setStatus] = useState<"running" | "completed" | "failed">("running");
  const [tab, setTab] = useState<Tab>("agents");
  const [phase, setPhase] = useState<Phase>("orchestrating");
  const [copied, setCopied] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareLinking, setShareLinking] = useState(false);
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
      const es = streamResearch(sessionId, topic, depth, undefined, language);

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
    if (shareToken) {
      setShowShareModal(true);
      return;
    }

    setShareLinking(true);
    try {
      const { token } = await createShareLink(sessionId);
      setShareToken(token);
      setShowShareModal(true);
    } catch (error) {
      toast.error("Failed to create share link");
    } finally {
      setShareLinking(false);
    }
  }

  async function copyShareLink() {
    if (!shareToken) return;
    const shareUrl = `${window.location.origin}/shared/${shareToken}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const graph: KnowledgeGraph = report?.knowledge_graph ?? { entities: [], relationships: [] };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "agents", label: t.tabAgentActivity, icon: <Brain className="w-4 h-4" /> },
    { id: "graph",  label: t.tabKnowledgeGraph, icon: <Network className="w-4 h-4" /> },
    { id: "report", label: t.tabReport,          icon: <FileText className="w-4 h-4" /> },
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

        <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
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
            <h1 className="text-xl sm:text-2xl font-bold text-white break-words">
              {topic || report?.topic || "Research Session"}
            </h1>
          </div>

          <button
            onClick={handleShare}
            disabled={shareLinking}
            className="flex items-center gap-2 px-3 py-2 glass rounded-lg text-sm text-slate-300 hover:text-white disabled:opacity-50 transition-colors shrink-0"
          >
            {shareLinking
              ? <><Loader2 className="w-4 h-4 animate-spin" /> <span className="hidden sm:inline">Creating...</span></>
              : copied
              ? <><Check className="w-4 h-4 text-emerald-400" /> <span className="hidden sm:inline">Copied!</span></>
              : <><Share2 className="w-4 h-4" /> <span className="hidden sm:inline">{t.share}</span></>
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

      {/* Related Research — shown once report is ready */}
      <RelatedResearch sessionId={sessionId} ready={status === "completed"} />

      {/* AI Chat — Q&A grounded in the completed report */}
      <ReportChat
        sessionId={sessionId}
        topic={topic || report?.topic || ""}
        ready={status === "completed"}
      />

      {/* Research Chain — continue this topic into a series */}
      {status === "completed" && (
        <ChainCreator sessionId={sessionId} topic={topic || report?.topic || ""} />
      )}

      {/* Share Modal */}
      {showShareModal && shareToken && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-white/10 rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Share Research</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-4">
              Share this research with anyone. They'll be able to view the full report and knowledge graph.
            </p>

            <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4">
              <p className="text-xs text-slate-500 mb-2">Share Link</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={`${window.location.origin}/shared/${shareToken}`}
                  readOnly
                  className="flex-1 bg-slate-800/50 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none"
                />
                <button
                  onClick={copyShareLink}
                  className="flex items-center gap-2 px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded transition-colors"
                >
                  {copied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Link expires in 30 days
            </p>

            <button
              onClick={() => setShowShareModal(false)}
              className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
