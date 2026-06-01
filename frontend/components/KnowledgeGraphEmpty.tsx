"use client";
import { Network, Loader2, AlertCircle } from "lucide-react";

interface Props {
  status: "running" | "completed" | "failed";
  phase: string;
}

export default function KnowledgeGraphEmpty({ status, phase }: Props) {
  if (status === "running") {
    const isSynthesizing = phase === "synthesizing";
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
          {isSynthesizing
            ? <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
            : <Network className="w-6 h-6 text-slate-600" />
          }
        </div>
        <div className="text-center">
          <p className="text-slate-300 font-medium text-sm">
            {isSynthesizing ? "Building knowledge graph..." : "Waiting for synthesis phase"}
          </p>
          <p className="text-slate-500 text-xs mt-1">
            {isSynthesizing
              ? "Extracting entities and relationships from sources"
              : "The graph appears after all sources are read"
            }
          </p>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-slate-300 font-medium text-sm">Knowledge graph unavailable</p>
          <p className="text-slate-500 text-xs mt-1">Research failed before synthesis could complete</p>
        </div>
      </div>
    );
  }

  // completed but no entities
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
        <Network className="w-6 h-6 text-slate-600" />
      </div>
      <div className="text-center">
        <p className="text-slate-300 font-medium text-sm">No graph data</p>
        <p className="text-slate-500 text-xs mt-1">The synthesizer didn't extract entities from this research</p>
      </div>
    </div>
  );
}
