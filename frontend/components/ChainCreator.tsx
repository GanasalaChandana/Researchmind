"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Link2, Plus, Trash2, Loader2, Sparkles, ChevronRight,
  Play, X,
} from "lucide-react";
import toast from "react-hot-toast";

interface Props {
  sessionId: string;
  topic: string;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

function token() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("rm_access_token") ?? "";
}

function auth() {
  return { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
}

export default function ChainCreator({ sessionId, topic }: Props) {
  const [open, setOpen]             = useState(false);
  const [topics, setTopics]         = useState<string[]>([]);
  const [chainName, setChainName]   = useState("");
  const [autoRun, setAutoRun]       = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [creating, setCreating]     = useState(false);

  async function suggest() {
    setSuggesting(true);
    try {
      const r = await fetch(`${BACKEND}/chains/suggest`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (r.ok) {
        const data = await r.json();
        setTopics(data.topics ?? []);
        if (!chainName) setChainName(`${topic} — chain`);
      } else {
        toast.error("Could not generate suggestions");
      }
    } finally {
      setSuggesting(false);
    }
  }

  async function create() {
    const filtered = topics.filter(t => t.trim());
    if (!chainName.trim()) return toast.error("Give the chain a name");
    if (filtered.length === 0) return toast.error("Add at least one follow-up topic");

    setCreating(true);
    try {
      const r = await fetch(`${BACKEND}/chains`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({
          name: chainName.trim(),
          topics: filtered,
          root_session_id: sessionId,
          auto_run: autoRun,
        }),
      });
      if (r.ok) {
        toast.success("Research chain started!");
        setOpen(false);
        setTopics([]);
        setChainName("");
      } else {
        const err = await r.json();
        toast.error(err.detail ?? "Failed to create chain");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mt-4">
      {/* Trigger button */}
      <button
        onClick={() => {
          setOpen(o => !o);
          if (!open && topics.length === 0) suggest();
        }}
        className="w-full flex items-center justify-between px-4 py-3 glass rounded-xl hover:bg-white/[0.04] transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-violet-500/15 border border-violet-500/25">
            <Link2 className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">Continue as Research Chain</p>
            <p className="text-xs text-slate-500">
              Auto-queue follow-up topics into a sequential series
            </p>
          </div>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="glass rounded-b-xl border-t border-white/5 p-5 space-y-4">

              {/* Chain name */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Chain name</label>
                <input
                  type="text"
                  value={chainName}
                  onChange={e => setChainName(e.target.value)}
                  placeholder={`${topic} — series`}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                />
              </div>

              {/* Root step (already done) */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Research steps</label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 mb-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[10px] text-emerald-400 font-bold shrink-0">✓</span>
                  <span className="text-sm text-emerald-400 flex-1 truncate">{topic}</span>
                  <span className="text-[10px] text-emerald-500 shrink-0">completed</span>
                </div>

                {/* Suggested follow-up topics */}
                {suggesting ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500 py-3 px-3">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating follow-up suggestions…
                  </div>
                ) : (
                  <div className="space-y-2">
                    {topics.map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] text-slate-500 font-bold shrink-0">
                          {i + 2}
                        </span>
                        <input
                          type="text"
                          value={t}
                          onChange={e => setTopics(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                        />
                        <button
                          onClick={() => setTopics(prev => prev.filter((_, j) => j !== i))}
                          className="text-slate-600 hover:text-red-400 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setTopics(prev => [...prev, ""])}
                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add topic
                      </button>
                      <button
                        onClick={suggest}
                        disabled={suggesting}
                        className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 px-2 py-1 rounded-lg hover:bg-violet-500/10 transition-colors disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Re-suggest
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Auto-run toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setAutoRun(a => !a)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${autoRun ? "bg-violet-500" : "bg-white/10"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoRun ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
                <div>
                  <p className="text-sm text-white">Auto-run</p>
                  <p className="text-xs text-slate-500">
                    {autoRun ? "Each step starts automatically when the previous one completes" : "Steps wait for manual start"}
                  </p>
                </div>
              </label>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={create}
                  disabled={creating || topics.filter(t => t.trim()).length === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  {creating
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Play    className="w-4 h-4" />
                  }
                  Start Chain
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-slate-400 transition-colors"
                >
                  Cancel
                </button>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
