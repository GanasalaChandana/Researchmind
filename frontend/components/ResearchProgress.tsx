"use client";
import { motion } from "framer-motion";
import { Brain, Search, BookOpen, Sparkles, CheckCircle2 } from "lucide-react";

export type Phase = "idle" | "orchestrating" | "searching" | "reading" | "synthesizing" | "done";

const PHASES: { id: Phase; label: string; icon: React.ReactNode; description: string }[] = [
  { id: "orchestrating", label: "Planning",     icon: <Brain className="w-4 h-4" />,     description: "Breaking topic into sub-questions" },
  { id: "searching",    label: "Searching",    icon: <Search className="w-4 h-4" />,    description: "Finding relevant sources" },
  { id: "reading",      label: "Reading",      icon: <BookOpen className="w-4 h-4" />,  description: "Summarizing each source" },
  { id: "synthesizing", label: "Synthesizing", icon: <Sparkles className="w-4 h-4" />, description: "Building report & knowledge graph" },
];

const PHASE_ORDER: Phase[] = ["idle", "orchestrating", "searching", "reading", "synthesizing", "done"];

function phaseIndex(p: Phase) { return PHASE_ORDER.indexOf(p); }

export default function ResearchProgress({ phase }: { phase: Phase }) {
  if (phase === "idle" || phase === "done") return null;

  const currentIdx = phaseIndex(phase);
  // progress % = how far through the 4 active phases
  const activePhasePos = PHASES.findIndex(p => p.id === phase);
  const progressPct = activePhasePos === -1 ? 0 : Math.round(((activePhasePos + 0.5) / PHASES.length) * 100);

  return (
    <div className="glass rounded-xl p-5 mb-6">
      {/* Phase steps */}
      <div className="flex items-center justify-between mb-4">
        {PHASES.map((p, i) => {
          const pIdx = phaseIndex(p.id);
          const isDone = pIdx < currentIdx;
          const isActive = p.id === phase;

          return (
            <div key={p.id} className="flex-1 flex flex-col items-center gap-1.5">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
                ${isDone   ? "bg-emerald-500 text-white" : ""}
                ${isActive ? "bg-brand-500 text-white ring-2 ring-brand-500/40 ring-offset-2 ring-offset-[#0f1117]" : ""}
                ${!isDone && !isActive ? "bg-white/5 text-slate-500" : ""}
              `}>
                {isDone
                  ? <CheckCircle2 className="w-4 h-4" />
                  : p.icon
                }
              </div>
              <span className={`text-xs font-medium hidden sm:block ${isActive ? "text-white" : isDone ? "text-emerald-400" : "text-slate-500"}`}>
                {p.label}
              </span>
              {isActive && (
                <span className="text-[10px] text-slate-400 text-center px-1 hidden sm:block">
                  {p.description}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-brand-500 to-emerald-400 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-slate-500">Researching...</span>
        <span className="text-[10px] text-slate-500">{progressPct}%</span>
      </div>
    </div>
  );
}
