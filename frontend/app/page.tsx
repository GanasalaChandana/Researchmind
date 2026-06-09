"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  startResearch, deleteResearch, retryResearch, toggleFavorite,
  addTag, removeTag, getUserTags,
  listCollections, createCollection, deleteCollection, moveSessionToCollection,
  searchReportContent,
  type Collection, type SearchResult,
} from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Sparkles, ChevronRight, Clock,
  CheckCircle2, XCircle, Loader2, Filter,
  Trash2, RefreshCw, MoreHorizontal, GitCompare,
  SortAsc, SortDesc, Calendar, Tag, X, Star, BarChart3, Code2, CalendarClock, Webhook,
  FolderOpen, Plus, Check, FolderPlus,
} from "lucide-react";
import toast from "react-hot-toast";
import ThemeToggle from "@/components/ThemeToggle";
import PromptCustomizer from "@/components/PromptCustomizer";
import AuthModal from "@/components/AuthModal";
import OnboardingModal from "@/components/OnboardingModal";
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
  collection_id?: string | null;
}

const COLLECTION_COLORS = ["indigo", "emerald", "amber", "rose", "violet", "sky"] as const;

const COLOR_MAP: Record<string, { pill: string; dot: string }> = {
  indigo:  { pill: "bg-indigo-500/15 text-indigo-400 border-indigo-500/25",  dot: "bg-indigo-400" },
  emerald: { pill: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
  amber:   { pill: "bg-amber-500/15 text-amber-400 border-amber-500/25",   dot: "bg-amber-400" },
  rose:    { pill: "bg-rose-500/15 text-rose-400 border-rose-500/25",     dot: "bg-rose-400" },
  violet:  { pill: "bg-violet-500/15 text-violet-400 border-violet-500/25",  dot: "bg-violet-400" },
  sky:     { pill: "bg-sky-500/15 text-sky-400 border-sky-500/25",       dot: "bg-sky-400" },
};

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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalSessions, setTotalSessions] = useState(0);
  const [userTags, setUserTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState<string | null>(null);
  // Content search
  const [contentResults, setContentResults] = useState<SearchResult[]>([]);
  const [contentSearching, setContentSearching] = useState(false);
  // Collections
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [showCollectionPicker, setShowCollectionPicker] = useState<string | null>(null);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionColor, setNewCollectionColor] = useState<string>("indigo");
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

  // Show onboarding modal on first visit
  useEffect(() => {
    if (!localStorage.getItem("rm_onboarded")) {
      setShowOnboarding(true);
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
      favorites: String(favoritesOnly),
    });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (historySearch) params.set("search", historySearch);
    if (daysFilter) params.set("days", String(daysFilter));
    if (selectedTag) params.set("tag", selectedTag);
    if (selectedCollection) params.set("collection", selectedCollection);

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
  }, [isAuthenticated, currentPage, itemsPerPage, statusFilter, favoritesOnly, historySearch, daysFilter, selectedTag, selectedCollection]);

  // Load user tags when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setUserTags([]);
      return;
    }
    getUserTags().then(setUserTags).catch(() => {});
  }, [isAuthenticated]);

  // Load collections when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setCollections([]);
      setSelectedCollection(null);
      return;
    }
    listCollections().then(setCollections).catch(() => {});
  }, [isAuthenticated]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [historySearch, statusFilter, favoritesOnly, daysFilter, selectedTag, selectedCollection]);

  // Debounced full-text content search (fires 400 ms after typing stops)
  useEffect(() => {
    const trimmed = historySearch.trim();
    if (!trimmed || trimmed.length < 2 || !isAuthenticated) {
      setContentResults([]);
      setContentSearching(false);
      return;
    }
    setContentSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchReportContent(trimmed);
      // Only show sessions NOT already visible in the topic-match list
      const topicIds = new Set(sessions.map((s) => s.id));
      setContentResults(results.filter((r) => !topicIds.has(r.id)));
      setContentSearching(false);
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [historySearch, isAuthenticated, sessions]);

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

  async function handleCreateCollection() {
    if (!newCollectionName.trim()) return;
    const coll = await createCollection(newCollectionName.trim(), newCollectionColor);
    if (coll) {
      setCollections((prev) => [coll, ...prev]);
      setNewCollectionName("");
      setShowNewCollection(false);
      toast.success(`Folder "${coll.name}" created`);
    } else {
      toast.error("Failed to create folder");
    }
  }

  async function handleDeleteCollection(collectionId: string) {
    await deleteCollection(collectionId);
    setCollections((prev) => prev.filter((c) => c.id !== collectionId));
    if (selectedCollection === collectionId) setSelectedCollection(null);
    // Refresh sessions so collection_id fields update
    setCurrentPage(1);
    toast.success("Folder deleted — sessions are still intact");
  }

  async function handleMoveToCollection(sessionId: string, collectionId: string | null) {
    // Optimistic update
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, collection_id: collectionId } : s))
    );
    setShowCollectionPicker(null);
    try {
      await moveSessionToCollection(sessionId, collectionId);
      // Refresh collection counts
      const cols = await listCollections();
      setCollections(cols);
      toast.success(collectionId ? "Moved to folder" : "Removed from folder");
    } catch {
      toast.error("Failed to move session");
    }
  }

  const activeFilterCount = [
    statusFilter !== "all",
    daysFilter !== null,
    historySearch.trim() !== "",
    selectedTag !== null,
    selectedCollection !== null,
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
    <div className="min-h-screen flex flex-col items-center justify-start px-4 pt-16 pb-12">
      {/* Top bar: Auth + Theme — fixed so it stays visible on scroll */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-end gap-2 px-4 py-3 backdrop-blur-sm dark:bg-slate-950/70 bg-white/70 border-b dark:border-white/5 border-slate-200/60">
        <div className="flex items-center gap-2">
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
          <>
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                         text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="View analytics dashboard"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button
              onClick={() => router.push("/developer")}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                         text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Developer API & keys"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">API</span>
            </button>
            <button
              onClick={() => router.push("/schedules")}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                         text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Scheduled research"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Schedules</span>
            </button>
            <button
              onClick={() => router.push("/webhooks")}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                         text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Webhook notifications"
            >
              <Webhook className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Webhooks</span>
            </button>
          </>
        )}
        <button
          onClick={() => setShowOnboarding(true)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg dark:text-slate-400 text-slate-600 hover:dark:text-white hover:text-slate-900 dark:hover:bg-white/5 hover:bg-slate-100 transition-colors"
          title="What can ResearchMind do?"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Tour</span>
        </button>
        <ThemeToggle />
        </div>
      </header>

      {/* Onboarding modal — shown only on first visit */}
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingModal
            onClose={() => setShowOnboarding(false)}
            onSignIn={() => { setShowOnboarding(false); setShowAuthModal(true); }}
          />
        )}
      </AnimatePresence>

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
        <div className="text-center mb-6 sm:mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-brand-500/20 border border-brand-500/30 mb-3 sm:mb-4">
            <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-brand-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold dark:text-white text-slate-900 mb-2">ResearchMind</h1>
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

        {/* History — always shown when authenticated */}
        {isAuthenticated && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-10"
          >
            {/* History header */}
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
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

            {/* Collections (folders) row */}
            {collections.length > 0 && (
              <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                {/* "All" pill */}
                <button
                  onClick={() => setSelectedCollection(null)}
                  className={`shrink-0 flex items-center gap-1 text-xs px-3 py-1 rounded-full transition-colors ${
                    !selectedCollection
                      ? "bg-brand-500 text-white"
                      : "glass dark:text-slate-400 text-slate-600 hover:text-brand-500"
                  }`}
                >
                  <FolderOpen className="w-3 h-3" /> All
                </button>

                {collections.map((c) => {
                  const cs = COLOR_MAP[c.color] ?? COLOR_MAP.indigo;
                  const isActive = selectedCollection === c.id;
                  return (
                    <div key={c.id} className="group/cpill relative shrink-0 flex items-center">
                      <button
                        onClick={() => setSelectedCollection(isActive ? null : c.id)}
                        className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full border transition-colors ${
                          isActive
                            ? `${cs.pill} border-current font-medium`
                            : "glass dark:text-slate-400 text-slate-600 hover:text-brand-500 border-transparent"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${cs.dot} shrink-0`} />
                        {c.name}
                        <span className="text-[10px] opacity-50 ml-0.5">({c.session_count})</span>
                      </button>
                      {/* Delete folder — only shown on hover */}
                      <button
                        onClick={() => handleDeleteCollection(c.id)}
                        title={`Delete folder "${c.name}"`}
                        className="hidden group-hover/cpill:flex ml-0.5 items-center justify-center w-4 h-4 rounded-full hover:bg-red-500/20 hover:text-red-400 text-slate-500 transition-colors"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  );
                })}

                {/* New folder button/form */}
                {showNewCollection ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleCreateCollection(); }}
                    className="shrink-0 flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                      placeholder="Folder name…"
                      className="w-28 text-xs dark:bg-white/5 bg-slate-100 border dark:border-white/10 border-slate-200 rounded-lg px-2.5 py-1 dark:text-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500/50"
                      autoFocus
                    />
                    {/* Color dots */}
                    {COLLECTION_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewCollectionColor(c)}
                        className={`w-3 h-3 rounded-full ${COLOR_MAP[c].dot} shrink-0 transition-transform ${newCollectionColor === c ? "scale-125 ring-2 ring-offset-1 dark:ring-offset-slate-900 ring-offset-white ring-white/40" : ""}`}
                      />
                    ))}
                    <button type="submit" className="shrink-0 text-xs px-2.5 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors">
                      Create
                    </button>
                    <button type="button" onClick={() => { setShowNewCollection(false); setNewCollectionName(""); }}
                      className="shrink-0 p-1 hover:bg-white/10 rounded transition-colors">
                      <X className="w-3 h-3 text-slate-400" />
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => setShowNewCollection(true)}
                    className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1 rounded-full glass dark:text-slate-400 text-slate-600 hover:text-brand-400 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> New folder
                  </button>
                )}
              </div>
            )}

            {/* When no collections exist yet — show a subtle create prompt */}
            {collections.length === 0 && !showNewCollection && (
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setShowNewCollection(true)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-brand-400 transition-colors"
                >
                  <FolderPlus className="w-3 h-3" /> Create folder
                </button>
              </div>
            )}
            {collections.length === 0 && showNewCollection && (
              <form
                onSubmit={(e) => { e.preventDefault(); handleCreateCollection(); }}
                className="flex items-center gap-1.5 mb-3"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Folder name…"
                  className="flex-1 text-xs dark:bg-white/5 bg-slate-100 border dark:border-white/10 border-slate-200 rounded-lg px-2.5 py-1 dark:text-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500/50"
                  autoFocus
                />
                {COLLECTION_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewCollectionColor(c)}
                    className={`w-3 h-3 rounded-full ${COLOR_MAP[c].dot} shrink-0 transition-transform ${newCollectionColor === c ? "scale-125 ring-2 ring-offset-1 dark:ring-offset-slate-900 ring-offset-white ring-white/40" : ""}`}
                  />
                ))}
                <button type="submit" className="shrink-0 text-xs px-2.5 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors">
                  Create
                </button>
                <button type="button" onClick={() => { setShowNewCollection(false); setNewCollectionName(""); }}
                  className="shrink-0 p-1 hover:bg-white/10 rounded transition-colors">
                  <X className="w-3 h-3 text-slate-400" />
                </button>
              </form>
            )}

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
                        onClick={() => { setStatusFilter("all"); setDaysFilter(null); setHistorySearch(""); setSelectedTag(null); setSelectedCollection(null); }}
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
                    className="text-center py-10"
                  >
                    {totalSessions === 0 ? (
                      /* First-time empty state */
                      <div className="space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto">
                          <Sparkles className="w-6 h-6 text-brand-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium dark:text-slate-300 text-slate-700 mb-1">No research yet</p>
                          <p className="text-xs dark:text-slate-500 text-slate-500">Type a topic above and hit <span className="text-brand-400 font-medium">Start Research</span> to create your first report.</p>
                        </div>
                        <button
                          onClick={() => setShowOnboarding(true)}
                          className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
                        >
                          <Sparkles className="w-3 h-3" /> See what ResearchMind can do
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm dark:text-slate-500 text-slate-500">No sessions match your filters</p>
                    )}
                  </motion.div>
                ) : (
                  filteredSessions.map((s) => (
                    <motion.div
                      key={s.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className="relative group"
                    >
                      {/* Card */}
                      <div
                        onClick={() => router.push(`/research/${s.id}?topic=${encodeURIComponent(s.topic)}&depth=3`)}
                        className="relative rounded-2xl border dark:border-white/8 border-slate-200 dark:bg-white/[0.03] bg-white hover:dark:bg-white/[0.06] hover:bg-slate-50 hover:border-indigo-400/40 dark:hover:border-indigo-500/30 transition-all duration-200 cursor-pointer overflow-hidden shadow-sm hover:shadow-md"
                      >
                        {/* Left status accent bar */}
                        <div className={`absolute inset-y-0 left-0 w-[3px] rounded-l-2xl ${
                          s.status === "completed" ? "bg-emerald-400" :
                          s.status === "failed"    ? "bg-red-400" :
                                                     "bg-indigo-400"
                        }`} />

                        <div className="pl-5 pr-24 py-4">
                          {/* Topic */}
                          <h3 className="text-sm font-semibold dark:text-slate-100 text-slate-800 leading-snug mb-2 line-clamp-2">
                            {s.topic}
                          </h3>

                          {/* Meta row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                              s.status === "completed" ? "bg-emerald-500/15 text-emerald-400" :
                              s.status === "failed"    ? "bg-red-500/15 text-red-400" :
                                                         "bg-indigo-500/15 text-indigo-400"
                            }`}>
                              <StatusIcon status={s.status} />
                              <span className="capitalize">{s.status}</span>
                            </span>
                            <span className="text-xs text-slate-500">{timeAgo(s.created_at)}</span>

                            {/* Folder badge */}
                            {s.collection_id && (() => {
                              const coll = collections.find((c) => c.id === s.collection_id);
                              if (!coll) return null;
                              const cs = COLOR_MAP[coll.color] ?? COLOR_MAP.indigo;
                              return (
                                <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${cs.pill}`}>
                                  <FolderOpen className="w-2.5 h-2.5" />
                                  {coll.name}
                                </span>
                              );
                            })()}

                            {/* Tags inline */}
                            {(Array.isArray(s.tags) ? s.tags : []).slice(0, 3).map((tag: any) => (
                              <button
                                key={tag.name}
                                onClick={(e) => { e.stopPropagation(); setSelectedTag(tag.name); }}
                                className="text-xs px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 hover:bg-brand-500/25 border border-brand-500/20 transition-colors"
                              >
                                #{tag.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Right: chevron */}
                        <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                      </div>

                      {/* Favorite star */}
                      {isAuthenticated && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleFavorite(s); }}
                          className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white/10 transition-colors z-10"
                          title={s.is_favorite ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Star className={`w-4 h-4 transition-colors ${
                            s.is_favorite ? "fill-amber-400 text-amber-400" : "text-slate-500 hover:text-amber-400"
                          }`} />
                        </button>
                      )}

                      {/* Actions menu */}
                      <div className="absolute right-[4.5rem] top-1/2 -translate-y-1/2 z-10">
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
                              {isAuthenticated && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenu(null);
                                    setShowCollectionPicker(showCollectionPicker === s.id ? null : s.id);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5"
                                >
                                  <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
                                  Move to folder
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

                      {/* Collection picker */}
                      {showCollectionPicker === s.id && isAuthenticated && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="glass rounded-xl p-3 mt-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                            <FolderOpen className="w-3 h-3" /> Move to folder
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {s.collection_id && (
                              <button
                                onClick={() => handleMoveToCollection(s.id, null)}
                                className="text-xs px-2.5 py-1 rounded-full glass text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors border border-transparent"
                              >
                                ✕ Remove from folder
                              </button>
                            )}
                            {collections.length === 0 && (
                              <p className="text-xs text-slate-500">No folders yet — create one above</p>
                            )}
                            {collections.map((c) => {
                              const cs = COLOR_MAP[c.color] ?? COLOR_MAP.indigo;
                              const isCurrent = s.collection_id === c.id;
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => handleMoveToCollection(s.id, c.id)}
                                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                    isCurrent
                                      ? `${cs.pill} border-current font-medium`
                                      : `glass ${cs.dot.replace("bg-", "text-")} border-transparent hover:border-current`
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${cs.dot} shrink-0`} />
                                  {c.name}
                                  {isCurrent && <Check className="w-2.5 h-2.5 ml-0.5" />}
                                </button>
                              );
                            })}
                          </div>
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
                          {(Array.isArray(s.tags) ? s.tags : []).map((tag: any) => (
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

            {/* ── Found in report content ─────────────────────────────── */}
            {(contentSearching || contentResults.length > 0) && (
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium dark:text-slate-400 text-slate-600">
                    📄 Also found in reports
                  </span>
                  {contentSearching
                    ? <Loader2 className="w-3 h-3 animate-spin text-brand-400" />
                    : <span className="text-xs dark:bg-white/10 bg-slate-200 dark:text-slate-400 text-slate-600 px-2 py-0.5 rounded-full">{contentResults.length}</span>
                  }
                </div>
                {!contentSearching && (
                  <div className="space-y-2">
                    {contentResults.map((r) => (
                      <motion.div
                        key={r.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="relative group"
                      >
                        <div
                          onClick={() => router.push(`/research/${r.id}?topic=${encodeURIComponent(r.topic)}&depth=3`)}
                          className="rounded-2xl border dark:border-white/8 border-slate-200 dark:bg-white/[0.03] bg-white hover:dark:bg-white/[0.06] hover:bg-slate-50 hover:border-indigo-400/40 dark:hover:border-indigo-500/30 transition-all duration-200 cursor-pointer overflow-hidden shadow-sm hover:shadow-md"
                        >
                          {/* Left accent — indigo always for content matches */}
                          <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl bg-brand-500/60" />
                          <div className="pl-5 pr-10 py-4">
                            <h3 className="text-sm font-semibold dark:text-slate-100 text-slate-800 leading-snug mb-1.5 line-clamp-1">
                              {r.topic}
                            </h3>
                            {/* Snippet */}
                            {r.snippet && (
                              <p className="text-xs dark:text-slate-400 text-slate-500 line-clamp-2 leading-relaxed mb-1.5">
                                …{r.snippet}…
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20">
                                Found in: {r.match_in}
                              </span>
                              <span className="text-xs text-slate-500">{timeAgo(r.created_at)}</span>
                            </div>
                          </div>
                          <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pagination */}
            {totalSessions > itemsPerPage && (
              <div className="mt-4 flex items-center justify-between gap-4 px-1">
                <p className="text-xs text-slate-500">
                  {`${(currentPage - 1) * itemsPerPage + 1}–${Math.min(currentPage * itemsPerPage, totalSessions)} of ${totalSessions}`}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border dark:border-white/10 border-slate-200 dark:text-slate-400 text-slate-600 hover:dark:text-white hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
