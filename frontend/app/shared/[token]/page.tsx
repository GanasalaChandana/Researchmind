"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSharedResearch } from "@/lib/api";
import { ResearchReport, KnowledgeGraph } from "@/lib/types";
import ReportViewer from "@/components/ReportViewer";
import KnowledgeGraphView from "@/components/KnowledgeGraph";
import KnowledgeGraphEmpty from "@/components/KnowledgeGraphEmpty";
import { Network, FileText, Loader2, ArrowLeft, Lock } from "lucide-react";
import ReportComments from "@/components/ReportComments";

type Tab = "graph" | "report";

export default function SharedResearchPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [report, setReport] = useState<ResearchReport | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "success">("loading");
  const [tab, setTab] = useState<Tab>("report");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) return;

    getSharedResearch(token)
      .then((data) => {
        if (data.success) {
          setReport(data.report);
          setStatus("success");
        } else {
          setStatus("error");
          setErrorMessage("Failed to load shared research");
        }
      })
      .catch((error) => {
        setStatus("error");
        setErrorMessage(error.message || "Share link expired or invalid");
      });
  }, [token]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          <p className="text-sm text-slate-400">Loading research...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <Lock className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Share Link Invalid</h1>
          <p className="text-slate-400 mb-6">{errorMessage}</p>
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 justify-center px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </button>
        </div>
      </div>
    );
  }

  const graph: KnowledgeGraph = report?.knowledge_graph ?? { entities: [], relationships: [] };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "graph", label: "Knowledge Graph", icon: <Network className="w-4 h-4" /> },
    { id: "report", label: "Report", icon: <FileText className="w-4 h-4" /> },
  ];

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

        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            {report?.topic || "Shared Research"}
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Shared research • Read-only
          </p>
        </div>
      </div>

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
      {tab === "graph" && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Knowledge Graph</h2>
          {graph.entities.length > 0 && (
            <p className="text-xs text-slate-500 mb-4">
              {graph.entities.length} entities · {graph.relationships.length} relationships · scroll to zoom · drag to pan
            </p>
          )}
          {graph.entities.length === 0
            ? <KnowledgeGraphEmpty status="completed" phase="done" />
            : <KnowledgeGraphView graph={graph} />
          }
        </div>
      )}

      {tab === "report" && (
        report
          ? <>
              <ReportViewer report={report} sessionId="" />
              <ReportComments sessionId={report.session_id} />
            </>
          : (
            <div className="text-center py-16 text-slate-500 text-sm">
              Report not available
            </div>
          )
      )}
    </div>
  );
}
