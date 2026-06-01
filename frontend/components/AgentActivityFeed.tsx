"use client";
import { AgentEvent } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { Search, BookOpen, Brain, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";

const AGENT_ICONS: Record<string, React.ReactNode> = {
  orchestrator: <Brain className="w-4 h-4 text-purple-400" />,
  search_agent: <Search className="w-4 h-4 text-blue-400" />,
  reader_agent: <BookOpen className="w-4 h-4 text-green-400" />,
  synthesizer: <Sparkles className="w-4 h-4 text-yellow-400" />,
};

const TYPE_COLORS: Record<string, string> = {
  thinking: "text-purple-300",
  searching: "text-blue-300",
  reading: "text-green-300",
  synthesizing: "text-yellow-300",
  done: "text-emerald-300",
  error: "text-red-300",
};

export default function AgentActivityFeed({ events }: { events: AgentEvent[] }) {
  const errorEvent = events.find(e => e.type === "error");

  return (
    <div className="space-y-2">
      {errorEvent && (
        <div className="glass rounded-xl p-4 border border-red-500/30 bg-red-500/5 mb-2">
          <p className="text-sm text-red-300 font-medium">{errorEvent.message}</p>
          <p className="text-xs text-slate-500 mt-1">Research failed — go back and try again</p>
        </div>
      )}
      <AnimatePresence initial={false}>
        {events.map((ev, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-start gap-3 glass rounded-lg px-3 py-2"
          >
            <div className="mt-0.5 shrink-0">
              {ev.type === "error" ? (
                <AlertCircle className="w-4 h-4 text-red-400" />
              ) : ev.type === "done" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                AGENT_ICONS[ev.agent] ?? <Brain className="w-4 h-4 text-gray-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className={`text-xs font-medium uppercase tracking-wider mr-2 ${TYPE_COLORS[ev.type] ?? "text-gray-400"}`}>
                {ev.agent.replace("_", " ")}
              </span>
              <span className="text-sm text-slate-300">{ev.message}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {events.length === 0 && (
        <div className="text-center text-slate-500 py-8 text-sm">Waiting for agents...</div>
      )}
    </div>
  );
}
