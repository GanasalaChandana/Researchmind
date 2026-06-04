"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { startResearch, deleteResearch, retryResearch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Sparkles, ChevronRight, Clock,
  CheckCircle2, XCircle, Loader2, Filter,
  Trash2, RefreshCw, MoreHorizontal, GitCompare
} from "lucide-react";
import toast from "react-hot-toast";
import ThemeToggle from "@/components/ThemeToggle";
import PromptCustomizer from "@/components/PromptCustomizer";

const EXAMPLE_TOPICS = [
  "Impact of AI on drug discovery",
  "How do large language models work?",
  "The future of quantum computing",
  "Climate change mitigation technologies",
  "History and evolution of the internet",
];

interface SessionSummary {
  id: string;
  topic: string;
  status: "running" | "completed" | "failed";
  created_at: string;
}

export default function HomePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [depth, setDepth] = useState(3);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "failed">("all");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [daysFilter, setDaysFilter] = useState<number | null>(null);
  const [customPrompts, setCustomPrompts] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Only load sessions started in this browser session
    const localIds: string[] = JSON.parse(localStorage.getItem("rm_sessions") ?? "[]");
    if (localIds.length === 0) return;

    fetch("/api/research/sessions")
      .then((r) => r.json())
      .then((data: SessionSummary[]) => {
        // Filter to only show sessions this user started
        const mine = data.filter((s) => localIds.includes(s.id));
        setSessions(mine);
      })
      .catch(() => {});
  }, []);

  // Topic suggestions from history
  useEffect(() => {
    if (!topic.trim() || topic.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const matches = sessions
      .filter(s => s.status === "completed" &&
        s.topic.toLowerCase().includes(topic.toLowerCase()) &&
        s.topic.toLowerCase() !== topic.toLowerCase())
      .map(s => s.topic)
      .slice(0, 4);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }, [topic, sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchTopic = s.topic.toLowerCase().includes(historySearch.toLowerCase());
      const matchStatus = statusFilter === "all" || s.status === statusFilter;

      // Date filter
      let matchDate = true;
      if (daysFilter) {
        const createdDate = new Date(s.created_at);
        const cutoffDate = new Date(Date.now() - daysFilter * 24 * 60 * 60 * 1000);
        matchDate = createdDate > cutoffDate;
      }

      return matchTopic && matchStatus && matchDate;
    });
  }, [sessions, historySearch, statusFilter, daysFilter]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setShowSuggestions(false);
    setLoading(true);
    try {
      const { session_id } = await startResearch(
        topic.trim(),
        depth,
        customPrompts.length > 0 ? customPrompts : undefined
      );
      // Save to localStorage so only this browser sees it in history
      const existing: string[] = JSON.parse(localStorage.getItem("rm_sessions") ?? "[]");
      localStorage.setItem("rm_sessions", JSON.stringify([session_id, ...existing]));
      router.push(`/research/${session_id}?topic=${encodeURIComponent(topic.trim())}&depth=${depth}`);
    } catch {
      toast.error("Failed to start research. Is the backend running?");
      setLoading(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation();
    setOpenMenu(null);
    try {
      await deleteResearch(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      toast.success("Session deleted");
    } catch {
      toast.error("Failed to delete session");
    }
  }

  async function handleRetry(e: React.MouseEvent, sessionId: string, sessionTopic: string) {
    e.stopPropagation();
    setOpenMenu(null);
    try {
      const { session_id } = await retryResearch(sessionId);
      router.push(`/research/${session_id}?topic=${encodeURIComponent(sessionTopic)}&depth=3`);
    } catch {
      toast.error("Failed to retry");
    }
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

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "completed") return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
    return <Loader2 className="w-4 h-4 text-brand-400 animate-spin shrink-0" />;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Header with Theme Toggle */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
        onClick={() => { setOpenMenu(null); setShowSuggestions(false); }}
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500/20 border border-brand-500/30 mb-4">
            <Sparkles className="w-7 h-7 text-brand-500" />
          </div>
          <h1 className="text-4xl font-bold dark:text-white text-slate-900 mb-2">ResearchMind</h1>
          <p className="dark:text-slate-400 text-slate-600 text-sm sm:text-base">Multi-agent AI research. Enter a topic, watch the agents work.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-4 sm:p-6 space-y-4">
          {/* Custom Prompts */}
          <PromptCustomizer onSelectPrompt={setCustomPrompts} />

          <div className="relative" onClick={e => e.stopPropagation()}>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 z-10" />
            <input
              ref={inputRef}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="What do you want to research?"
              className="w-full dark:bg-white/5 bg-slate-50 dark:border-white/10 border-slate-200 rounded-xl pl-12 pr-4 py-3 sm:py-4 dark:text-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-brand-500 transition-colors text-base sm:text-lg"
              autoFocus
              autoComplete="off"
            />
            {/* Suggestions dropdown */}
            <AnimatePresence>
              {showSuggestions && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute top-full left-0 right-0 mt-1 glass rounded-xl overflow-hidden z-20 border border-brand-500/20"
                >
                  <p className="text-xs text-slate-500 px-4 pt-3 pb-1">From your history</p>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setTopic(s); setShowSuggestions(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-brand-500/10 hover:text-white transition-colors flex items-center gap-2"
                    >
                      <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      {s}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <label className="text-sm text-slate-400 shrink-0">Depth</label>
            <input
              type="range" min={2} max={5} value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="flex-1 accent-brand-500"
            />
            <span className="text-sm text-slate-300 shrink-0">{depth} questions</span>
          </div>

          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 sm:py-3.5 rounded-xl transition-colors text-sm sm:text-base"
          >
            {loading ? <>Launching agents...</> : <>Start Research <ChevronRight className="w-4 h-4" /></>}
          </button>
        </form>

        {/* Compare link */}
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => router.push("/compare")}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-400 transition-colors"
          >
            <GitCompare className="w-3.5 h-3.5" />
            Compare research depths
          </button>
        </div>

        {/* Examples */}
        <div className="mt-5">
          <p className="text-xs text-slate-500 mb-3 text-center">Try an example</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {EXAMPLE_TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => setTopic(t)}
                className="text-xs glass px-3 py-1.5 rounded-full dark:text-slate-300 text-slate-600 hover:text-brand-500 hover:border-brand-500/50 transition-colors"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* History */}
        {sessions.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-10"
          >
            {/* History header + search + filter */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <div className="flex items-center gap-2 shrink-0">
                <Clock className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-medium dark:text-slate-400 text-slate-700">
                  Recent Research
                  <span className="ml-2 text-xs dark:text-slate-600 text-slate-500">({sessions.length})</span>
                </h2>
              </div>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search past research..."
                  className="w-full dark:bg-white/5 bg-slate-100 dark:border-white/10 border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs dark:text-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500/50 transition-colors"
                />
              </div>
              <div className="flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                {(["all", "completed", "failed"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`text-xs px-2.5 py-1 rounded-full transition-colors capitalize ${
                      statusFilter === f ? "bg-brand-500 text-white" : "dark:text-slate-400 text-slate-600 hover:text-brand-500 glass"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Date range filter */}
              <div className="flex items-center gap-1 flex-wrap">
                {([7, 30, 90, null] as const).map((days) => (
                  <button
                    key={days ?? "all"}
                    onClick={() => setDaysFilter(days)}
                    className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                      daysFilter === days ? "bg-brand-500 text-white" : "dark:text-slate-400 text-slate-600 hover:text-brand-500 glass"
                    }`}
                  >
                    {days ? `${days}d` : "All"}
                  </button>
                ))}
              </div>
            </div>

            {/* Session list */}
            <div className="space-y-2">
              <AnimatePresence>
                {filteredSessions.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-8 text-slate-500 text-sm"
                  >
                    No research sessions match your search
                  </motion.div>
                ) : (
                  filteredSessions.map((s) => (
                    <motion.div
                      key={s.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className="relative"
                    >
                      <button
                        onClick={() => router.push(`/research/${s.id}?topic=${encodeURIComponent(s.topic)}&depth=3`)}
                        className="w-full glass rounded-xl px-4 py-3 flex items-center gap-3 hover:border-brand-500/40 transition-colors text-left"
                      >
                        <StatusIcon status={s.status} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm dark:text-white text-slate-800 truncate">{s.topic}</p>
                          <p className="text-xs dark:text-slate-500 text-slate-500 capitalize">{s.status} · {timeAgo(s.created_at)}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                      </button>

                      {/* Actions menu */}
                      <div className="absolute right-10 top-1/2 -translate-y-1/2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === s.id ? null : s.id); }}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        <AnimatePresence>
                          {openMenu === s.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="absolute right-0 top-8 glass rounded-xl overflow-hidden z-30 w-36 border border-white/10"
                              onClick={e => e.stopPropagation()}
                            >
                              {s.status === "failed" && (
                                <button
                                  onClick={(e) => handleRetry(e, s.id, s.topic)}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                                >
                                  <RefreshCw className="w-3.5 h-3.5 text-brand-400" />
                                  Retry
                                </button>
                              )}
                              <button
                                onClick={(e) => handleDelete(e, s.id)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-300 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
