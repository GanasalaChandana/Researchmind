"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { startResearch, deleteResearch, retryResearch, toggleFavorite, addTag, removeTag, getUserTags } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Sparkles, ChevronRight, Clock,
  CheckCircle2, XCircle, Loader2, Filter,
  Trash2, RefreshCw, MoreHorizontal, GitCompare,
  SortAsc, SortDesc, Calendar, Tag, X, Star, BarChart3
} from "lucide-react";
import toast from "react-hot-toast";
import ThemeToggle from "@/components/ThemeToggle";
import PromptCustomizer from "@/components/PromptCustomizer";
import AuthModal from "@/components/AuthModal";
import { useAuth } from "@/context/AuthContext";
import { logout } from "@/lib/auth";
import { LogIn, LogOut, UserCircle2 } from "lucide-react";

const EXAMPLE_TOPICS = [
  "Impact of AI on drug discovery",
  "How do large language models work?",
  "The future of quantum computing",
  "Climate change mitigation technologies",
  "History and evolution of the internet",
];

interface SessionTag {
  name: string;
  color?: string;
}

interface SessionSummary {
  id: string;
  topic: string;
  status: "running" | "completed" | "failed";
  created_at: string;
  is_favorite?: boolean;
  tags?: SessionTag[];
}

export default function HomePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [depth, setDepth] = useState(3);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "failed">("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [daysFilter, setDaysFilter] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customPrompts, setCustomPrompts] = useState<string[]>([]);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalSessions, setTotalSessions] = useState(0);
  const [userTags, setUserTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState<string | null>(null);
  const itemsPerPage = 10;
  const inputRef = useRef<HTMLInputElement>(null);
  const { user, signOut, isAuthenticated } = useAuth();

  // If arriving from a password-reset email link (/?reset_token=...), open the
  // auth modal in reset mode with the code pre-filled, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rt = params.get("reset_token");
    if (rt) {
      setResetToken(rt);
      setShowAuthModal(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("reset_token");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("rm_access_token");
    const localIds: string[] = JSON.parse(localStorage.getItem("rm_sessions") ?? "[]");

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const offset = (currentPage - 1) * itemsPerPage;
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(itemsPerPage),
      status: statusFilter === "all" ? "" : statusFilter,
      favorites: String(favoritesOnly),
      search: historySearch,
      days: daysFilter ? String(daysFilter) : "",
      tag: selectedTag || "",
    });

    fetch(`/api/research/sessions?${params}`, { headers })
      .then((r) => r.json())
      .then((data: any) => {
        if (token) {
          // Authenticated: server already filtered to this user's sessions
          setSessions(data.items || []);
          setTotalSessions(data.total || 0);
        } else {
          // Unauthenticated: filter by localStorage IDs
          const items = (data.items || []).filter((s: any) => localIds.includes(s.id));
          setSessions(items);
          // For unauthenticated, show only local sessions count
          setTotalSessions(localIds.length);
        }
      })
      .catch(() => {});
  }, [isAuthenticated, currentPage, itemsPerPage, statusFilter, favoritesOnly, historySearch, daysFilter]);

  // Load user tags when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setUserTags([]);
      return;
    }
    getUserTags().then(setUserTags).catch(() => {});
  }, [isAuthenticated]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [historySearch, statusFilter, favoritesOnly, daysFilter, selectedTag]);

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

  // Sort the sessions (already filtered/paginated by backend)
  const filteredSessions = useMemo(() => {
    let result = [...sessions];
    result.sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
    return result;
  }, [sessions, sortOrder]);

  async function handleToggleFavorite(s: SessionSummary) {
    if (!isAuthenticated) {
      toast.error("Sign in to favorite research");
      return;
    }
    const next = !s.is_favorite;
    // Optimistic update
    setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_favorite: next } : x)));
    try {
      await toggleFavorite(s.id, next);
    } catch {
      // Revert on failure
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_favorite: !next } : x)));
      toast.error("Couldn't update favorite");
    }
  }

  async function handleAddTag(sessionId: string, tagName: string) {
    if (!tagName.trim()) return;
    try {
      await addTag(sessionId, tagName.trim());
      // Refresh tags and sessions
      const tags = await getUserTags();
      setUserTags(tags);
      // Trigger re-fetch of sessions
      setCurrentPage(1);
    } catch {
      toast.error("Failed to add tag");
    }
    setShowTagInput(null);
    setTagInput("");
  }

  async function handleRemoveTag(sessionId: string, tagName: string) {
    try {
      await removeTag(sessionId, tagName);
      // Refresh tags and sessions
      const tags = await getUserTags();
      setUserTags(tags);
      // Trigger re-fetch of sessions
      setCurrentPage(1);
    } catch {
      toast.error("Failed to remove tag");
    }
  }

  const activeFilterCount = [
    statusFilter !== "all",
    daysFilter !== null,
    historySearch.trim() !== "",
    selectedTag !== null,
  ].filter(Boolean).length;

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
      {/* Top-right: Auth + Theme */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {isAuthenticated ? (
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 text-xs dark:text-slate-400 text-slate-600">
              <UserCircle2 className="w-4 h-4" />
              {user?.name}
            </span>
            <button
              onClick={() => { logout(localStorage.getItem("rm_refresh_token") ?? ""); signOut(); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                         dark:text-slate-400 text-slate-600 hover:text-red-400
                         dark:hover:bg-white/5 hover:bg-slate-100 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                       bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign in
          </button>
        )}
        {isAuthenticated && (
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                       text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="View analytics dashboard"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
        )}
        <ThemeToggle />
      </div>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <AuthModal
            onClose={() => { setShowAuthModal(false); setResetToken(null); }}
            initialMode={resetToken ? "reset" : "login"}
            initialToken={resetToken ?? ""}
          />
        )}
      </AnimatePresence>

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
            {/* History header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-medium dark:text-slate-400 text-slate-700">
                  Recent Research
                </h2>
                <span className="text-xs dark:bg-white/10 bg-slate-200 dark:text-slate-400 text-slate-600 px-2 py-0.5 rounded-full">
                  {filteredSessions.length}/{totalSessions}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Sort toggle */}
                <button
                  onClick={() => setSortOrder(o => o === "newest" ? "oldest" : "newest")}
                  className="flex items-center gap-1 text-xs dark:text-slate-400 text-slate-600 hover:text-brand-500 transition-colors"
                  title={`Sort: ${sortOrder}`}
                >
                  {sortOrder === "newest"
                    ? <SortDesc className="w-3.5 h-3.5" />
                    : <SortAsc className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{sortOrder === "newest" ? "Newest" : "Oldest"}</span>
                </button>
                {/* Advanced filters toggle */}
                <button
                  onClick={() => setShowAdvanced(v => !v)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ${
                    showAdvanced || activeFilterCount > 0
                      ? "bg-brand-500 text-white"
                      : "dark:text-slate-400 text-slate-600 hover:text-brand-500 glass"
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="ml-1 bg-white/30 text-white text-[10px] px-1.5 rounded-full font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Search bar — always visible */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search past research..."
                className="w-full dark:bg-white/5 bg-slate-100 dark:border-white/10 border-slate-200 rounded-lg pl-8 pr-8 py-1.5 text-xs dark:text-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500/50 transition-colors"
              />
              {historySearch && (
                <button
                  onClick={() => setHistorySearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Advanced filter panel */}
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mb-3"
                >
                  <div className="glass rounded-xl p-3 space-y-3">
                    {/* Status filter */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Tag className="w-3 h-3 text-slate-500" />
                        <span className="text-xs dark:text-slate-400 text-slate-600 font-medium">Status</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {(["all", "completed", "failed"] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => setStatusFilter(f)}
                            className={`text-xs px-3 py-1 rounded-full transition-colors capitalize ${
                              statusFilter === f
                                ? f === "completed" ? "bg-emerald-500 text-white"
                                  : f === "failed" ? "bg-red-500 text-white"
                                  : "bg-brand-500 text-white"
                                : "dark:text-slate-400 text-slate-600 hover:text-brand-500 glass"
                            }`}
                          >
                            {f === "completed" && "✓ "}
                            {f === "failed" && "✗ "}
                            {f}
                          </button>
                        ))}
                        {/* Favorites toggle */}
                        <button
                          onClick={() => setFavoritesOnly((v) => !v)}
                          className={`text-xs px-3 py-1 rounded-full transition-colors flex items-center gap-1 ${
                            favoritesOnly
                              ? "bg-amber-500 text-white"
                              : "dark:text-slate-400 text-slate-600 hover:text-amber-500 glass"
                          }`}
                        >
                          <Star className={`w-3 h-3 ${favoritesOnly ? "fill-white" : ""}`} />
                          Favorites
                        </button>
                      </div>
                    </div>
                    {/* Date filter */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span className="text-xs dark:text-slate-400 text-slate-600 font-medium">Date Range</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {([7, 30, 90, null] as const).map((days) => (
                          <button
                            key={days ?? "all"}
                            onClick={() => setDaysFilter(days)}
                            className={`text-xs px-3 py-1 rounded-full transition-colors ${
                              daysFilter === days ? "bg-brand-500 text-white" : "dark:text-slate-400 text-slate-600 hover:text-brand-500 glass"
                            }`}
                          >
                            {days ? `Last ${days}d` : "All Time"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Tag filter */}
                    {isAuthenticated && userTags.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Tag className="w-3 h-3 text-slate-500" />
                          <span className="text-xs dark:text-slate-400 text-slate-600 font-medium">Tags</span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={() => setSelectedTag(null)}
                            className={`text-xs px-3 py-1 rounded-full transition-colors ${
                              selectedTag === null ? "bg-brand-500 text-white" : "dark:text-slate-400 text-slate-600 hover:text-brand-500 glass"
                            }`}
                          >
                            All
                          </button>
                          {userTags.map((tag) => (
                            <button
                              key={tag}
                              onClick={() => setSelectedTag(tag)}
                              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                                selectedTag === tag ? "bg-brand-500 text-white" : "dark:text-slate-400 text-slate-600 hover:text-brand-500 glass"
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Reset */}
                    {activeFilterCount > 0 && (
                      <button
                        onClick={() => { setStatusFilter("all"); setDaysFilter(null); setHistorySearch(""); setSelectedTag(null); }}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        ✕ Clear all filters
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            <p className="text-xs dark:text-slate-500 text-slate-500 capitalize">{s.status} · {timeAgo(s.created_at)}</p>
                            {(s.tags && s.tags.length > 0) && (
                              <div className="flex gap-1 flex-wrap">
                                {s.tags.map((tag: any) => (
                                  <span
                                    key={tag.name}
                                    className="text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTag(tag.name);
                                    }}
                                  >
                                    {tag.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                      </button>

                      {/* Favorite star (signed-in users only) */}
                      {isAuthenticated && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleFavorite(s); }}
                          className="absolute right-16 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                          title={s.is_favorite ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Star
                            className={`w-4 h-4 transition-colors ${
                              s.is_favorite
                                ? "fill-amber-400 text-amber-400"
                                : "text-slate-500 hover:text-amber-400"
                            }`}
                          />
                        </button>
                      )}

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
                              className="absolute right-0 top-8 glass rounded-xl overflow-hidden z-30 w-40 border border-white/10"
                              onClick={e => e.stopPropagation()}
                            >
                              {isAuthenticated && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowTagInput(showTagInput === s.id ? null : s.id);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5"
                                >
                                  <Tag className="w-3.5 h-3.5 text-brand-400" />
                                  Add tag
                                </button>
                              )}
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

                      {/* Tag input */}
                      {showTagInput === s.id && isAuthenticated && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="glass rounded-xl p-3 mt-2 flex gap-2"
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            placeholder="New tag..."
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleAddTag(s.id, tagInput);
                              } else if (e.key === "Escape") {
                                setShowTagInput(null);
                                setTagInput("");
                              }
                            }}
                            className="flex-1 bg-slate-800/50 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/50"
                            autoFocus
                          />
                          <button
                            onClick={() => handleAddTag(s.id, tagInput)}
                            className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded text-sm transition-colors"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => {
                              setShowTagInput(null);
                              setTagInput("");
                            }}
                            className="p-1.5 hover:bg-white/10 rounded transition-colors"
                          >
                            <X className="w-4 h-4 text-slate-400" />
                          </button>
                        </motion.div>
                      )}

                      {/* Existing tags (with remove option) */}
                      {isAuthenticated && s.tags && s.tags.length > 0 && showTagInput !== s.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="glass rounded-xl p-3 mt-2 flex flex-wrap gap-2"
                          onClick={e => e.stopPropagation()}
                        >
                          {s.tags.map((tag: any) => (
                            <button
                              key={tag.name}
                              onClick={() => handleRemoveTag(s.id, tag.name)}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-700/50 hover:bg-red-500/20 text-slate-300 hover:text-red-300 transition-colors border border-slate-600/50 hover:border-red-500/30"
                              title="Click to remove"
                            >
                              {tag.name}
                              <X className="w-3 h-3" />
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Pagination */}
            {totalSessions > itemsPerPage && (
              <div className="mt-6 flex items-center justify-between gap-4 glass rounded-lg p-4">
                <div className="text-sm text-slate-400">
                  {filteredSessions.length === 0
                    ? "No results"
                    : `Page ${currentPage} of ${Math.ceil(totalSessions / itemsPerPage)} (${totalSessions} total)`}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg text-sm border border-white/10 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  <div className="flex gap-1">
                    {Array.from(
                      { length: Math.ceil(totalSessions / itemsPerPage) },
                      (_, i) => i + 1
                    )
                      .slice(Math.max(0, currentPage - 2), currentPage + 1)
                      .map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-2 py-1.5 rounded-lg text-sm transition-colors ${
                            page === currentPage
                              ? "bg-brand-500 text-white"
                              : "border border-white/10 text-slate-400 hover:text-white"
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                  </div>
                  <button
                    onClick={() => setCurrentPage((p) => p + 1)}
                    disabled={currentPage >= Math.ceil(totalSessions / itemsPerPage)}
                    className="px-3 py-1.5 rounded-lg text-sm border border-white/10 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
