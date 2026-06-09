"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startResearch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitCompare, Search, ChevronRight, ArrowLeft,
  CheckCircle2, Clock, Loader2, BookOpen,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";

interface SessionSummary {
  id: string;
  topic: string;
  status: string;
  created_at: string;
}

export default function ComparePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState<"new" | "existing">("new");

  // ── "New Research" mode ─────────────────────────────────────────────────────
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const [res1, res2] = await Promise.all([
        startResearch(topic.trim(), 3),
        startResearch(topic.trim(), 5),
      ]);
      const existing: string[] = JSON.parse(localStorage.getItem("rm_sessions") ?? "[]");
      localStorage.setItem("rm_sessions", JSON.stringify([res1.session_id, res2.session_id, ...existing]));
      router.push(`/compare/${res1.session_id}/${res2.session_id}?topic=${encodeURIComponent(topic.trim())}`);
    } catch {
      toast.error("Failed to start comparison");
      setLoading(false);
    }
  }

  // ── "Compare Saved" mode ───────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionSearch, setSessionSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  useEffect(() => {
    if (mode !== "existing" || !isAuthenticated) return;
    setLoadingSessions(true);
    const token = localStorage.getItem("rm_access_token");
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch("/api/research/sessions?offset=0&limit=50&status=completed", { headers })
      .then(r => r.json())
      .then(data => setSessions(data.items ?? []))
      .catch(() => {})
      .finally(() => setLoadingSessions(false));
  }, [mode, isAuthenticated]);

  function toggleSelect(id: string) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );
  }

  const filtered = sessions.filter(s =>
    s.topic.toLowerCase().includes(sessionSearch.toLowerCase())
  );

  function handleCompareSaved() {
    if (selected.length !== 2) return;
    router.push(`/compare/${selected[0]}/${selected[1]}?mode=existing`);
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return "just now";
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start px-4 pt-8 pb-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500/20 border border-brand-500/30 mb-4">
            <GitCompare className="w-7 h-7 text-brand-500" />
          </div>
          <h1 className="text-3xl font-bold dark:text-white text-slate-900 mb-2">Research Comparison</h1>
          <p className="dark:text-slate-400 text-slate-600 text-sm">
            Compare research sessions side-by-side
          </p>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 glass rounded-xl p-1 mb-6">
          {([
            { key: "new",      label: "New Comparison",    icon: GitCompare },
            { key: "existing", label: "Compare Saved",     icon: BookOpen   },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`flex-1 flex items-center justify-center gap-2 text-sm py-2 rounded-lg font-medium transition-colors ${
                mode === key
                  ? "bg-brand-500 text-white"
                  : "dark:text-slate-400 text-slate-600 hover:dark:text-white hover:text-slate-900"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ── NEW RESEARCH mode ───────────────────────────────────── */}
          {mode === "new" && (
            <motion.div
              key="new"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="glass rounded-xl p-4 border-l-2 border-brand-500">
                  <p className="text-xs text-slate-500 mb-1">Depth 3</p>
                  <p className="text-sm font-medium dark:text-white text-slate-900">Breadth overview</p>
                  <p className="text-xs text-slate-400 mt-1">3 sub-questions · ~6 sources · faster</p>
                </div>
                <div className="glass rounded-xl p-4 border-l-2 border-emerald-500">
                  <p className="text-xs text-slate-500 mb-1">Depth 5</p>
                  <p className="text-sm font-medium dark:text-white text-slate-900">Deep dive</p>
                  <p className="text-xs text-slate-400 mt-1">5 sub-questions · ~10 sources · thorough</p>
                </div>
              </div>

              <form onSubmit={handleCompare} className="glass rounded-2xl p-6 space-y-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Enter a research topic to compare..."
                    className="w-full dark:bg-white/5 bg-slate-50 border dark:border-white/10 border-slate-200 rounded-xl pl-12 pr-4 py-4 dark:text-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-brand-500 transition-colors"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !topic.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3.5 rounded-xl transition-colors"
                >
                  {loading ? "Launching both agents..." : <>Compare Depths <ChevronRight className="w-4 h-4" /></>}
                </button>
              </form>
            </motion.div>
          )}

          {/* ── COMPARE SAVED mode ─────────────────────────────────── */}
          {mode === "existing" && (
            <motion.div
              key="existing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {!isAuthenticated ? (
                <div className="glass rounded-2xl p-8 text-center">
                  <p className="dark:text-slate-400 text-slate-600 text-sm">Sign in to compare your saved research sessions.</p>
                </div>
              ) : (
                <div className="glass rounded-2xl p-5 space-y-4">
                  {/* Instructions */}
                  <p className="text-xs dark:text-slate-400 text-slate-600">
                    Select <span className="font-semibold text-brand-400">2 completed sessions</span> to compare side-by-side.
                  </p>

                  {/* Selected badges */}
                  {selected.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {selected.map((id, i) => {
                        const s = sessions.find(x => x.id === id);
                        return (
                          <div key={id} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${
                            i === 0
                              ? "bg-brand-500/15 text-brand-400 border-brand-500/30"
                              : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          }`}>
                            <span>{i === 0 ? "A" : "B"}</span>
                            <span className="max-w-[160px] truncate">{s?.topic ?? id}</span>
                            <button onClick={() => toggleSelect(id)} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      value={sessionSearch}
                      onChange={e => setSessionSearch(e.target.value)}
                      placeholder="Filter sessions..."
                      className="w-full dark:bg-white/5 bg-slate-50 border dark:border-white/10 border-slate-200 rounded-lg pl-8 pr-4 py-2 text-xs dark:text-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500/50"
                    />
                  </div>

                  {/* Session list */}
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {loadingSessions ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
                      </div>
                    ) : filtered.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-6">No completed sessions found</p>
                    ) : (
                      filtered.map(s => {
                        const isSelected = selected.includes(s.id);
                        const selIdx = selected.indexOf(s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => toggleSelect(s.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                              isSelected
                                ? selIdx === 0
                                  ? "bg-brand-500/15 border border-brand-500/30"
                                  : "bg-emerald-500/15 border border-emerald-500/30"
                                : "dark:hover:bg-white/5 hover:bg-slate-50 border border-transparent"
                            }`}
                          >
                            {/* Selection indicator */}
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 text-[10px] font-bold transition-colors ${
                              isSelected
                                ? selIdx === 0
                                  ? "bg-brand-500 border-brand-500 text-white"
                                  : "bg-emerald-500 border-emerald-500 text-white"
                                : "border-slate-600"
                            }`}>
                              {isSelected ? (selIdx === 0 ? "A" : "B") : ""}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm dark:text-slate-200 text-slate-800 font-medium truncate">{s.topic}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span className="text-xs text-slate-500">{timeAgo(s.created_at)}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Compare button */}
                  <button
                    onClick={handleCompareSaved}
                    disabled={selected.length !== 2}
                    className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors text-sm"
                  >
                    <GitCompare className="w-4 h-4" />
                    {selected.length === 2 ? "Compare Selected Sessions" : `Select ${2 - selected.length} more session${selected.length === 0 ? "s" : ""}`}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
