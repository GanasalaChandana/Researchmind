"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  startResearch, deleteResearch, retryResearch, toggleFavorite,
  addTag, removeTag, getUserTags,
  listCollections, createCollection, deleteCollection, moveSessionToCollection,
  searchReportContent, bulkDeleteSessions, bulkTagSessions,
  type Collection, type SearchResult,
} from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Sparkles, ChevronRight, Clock,
  CheckCircle2, XCircle, Loader2, Filter,
  Trash2, RefreshCw, MoreHorizontal, GitCompare,
  SortAsc, SortDesc, Calendar, Tag, X, Star, BarChart3, Code2, CalendarClock, Webhook, Link2,
  FolderOpen, Plus, Check, FolderPlus, Brain, Network, FileText, Zap,
  Square, CheckSquare, Tags,
} from "lucide-react";
import toast from "react-hot-toast";
import ThemeToggle from "@/components/ThemeToggle";
import DocumentUploader from "@/components/DocumentUploader";
import { type UploadedDoc } from "@/lib/api";
import PromptCustomizer from "@/components/PromptCustomizer";
import AuthModal from "@/components/AuthModal";
import OnboardingModal from "@/components/OnboardingModal";
import { useAuth } from "@/context/AuthContext";
import { logout } from "@/lib/auth";
import { LogIn, LogOut, UserCircle2, Globe } from "lucide-react";
import { useLanguage, LANGUAGES } from "@/context/LanguageContext";

const EXAMPLE_TOPICS = [
  "Impact of AI on drug discovery",
  "How do large language models work?",
  "The future of quantum computing",
  "Climate change mitigation technologies",
  "History and evolution of the internet",
];

const RESEARCH_TEMPLATES = [
  {
    category: "Literature Review",
    icon: "📚",
    color: "text-brand-400",
    bg: "bg-brand-500/10 border-brand-500/20",
    topics: [
      "Literature review: transformer architectures in NLP",
      "Literature review: CRISPR gene editing applications",
      "Literature review: renewable energy storage technologies",
    ],
  },
  {
    category: "Market Analysis",
    icon: "📈",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    topics: [
      "Market analysis: global electric vehicle industry 2025",
      "Market analysis: AI SaaS competitive landscape",
      "Market analysis: quantum computing commercial adoption",
    ],
  },
  {
    category: "Technology Deep Dive",
    icon: "⚙️",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
    topics: [
      "How does retrieval-augmented generation (RAG) work?",
      "Technical deep dive: Kubernetes architecture and scaling",
      "How do diffusion models generate images?",
    ],
  },
  {
    category: "Competitor Research",
    icon: "🔍",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    topics: [
      "Competitor analysis: OpenAI vs Anthropic vs Google Gemini",
      "Competitor analysis: Notion vs Obsidian vs Roam Research",
      "Competitor analysis: AWS vs Azure vs Google Cloud 2025",
    ],
  },
  {
    category: "Policy & Society",
    icon: "🏛️",
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    topics: [
      "AI regulation policies across EU, US, and China",
      "Impact of remote work on urban planning and real estate",
      "Universal basic income: evidence from global pilot programs",
    ],
  },
  {
    category: "Science & Health",
    icon: "🧬",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/20",
    topics: [
      "Microbiome research: gut-brain axis and mental health",
      "mRNA vaccine technology: beyond COVID-19 applications",
      "Longevity research: current science on aging reversal",
    ],
  },
];

const ROTATING_WORDS = [
  { word: "searches", color: "text-brand-400" },
  { word: "reads",    color: "text-violet-400" },
  { word: "synthesizes", color: "text-emerald-400" },
];

const PIPELINE_STEPS = [
  { label: "Orchestrating", color: "text-brand-400",   dot: "bg-brand-400" },
  { label: "Searching",     color: "text-violet-400",  dot: "bg-violet-400" },
  { label: "Reading",       color: "text-emerald-400", dot: "bg-emerald-400" },
  { label: "Synthesizing",  color: "text-amber-400",   dot: "bg-amber-400" },
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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
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
  const [wordIdx, setWordIdx] = useState(0);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user, signOut, isAuthenticated } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [activeTemplateCategory, setActiveTemplateCategory] = useState(RESEARCH_TEMPLATES[0].category);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [trendingTopics, setTrendingTopics] = useState<{ topic: string; count: number }[]>([]);
  const [modelTier, setModelTier] = useState<"fast" | "balanced" | "deep">("balanced");

  // Rotating tagline word
  useEffect(() => {
    const t = setInterval(() => setWordIdx(i => (i + 1) % ROTATING_WORDS.length), 2200);
    return () => clearInterval(t);
  }, []);

  // Fetch trending topics on mount
  useEffect(() => {
    fetch("/api/research/trending")
      .then(r => r.json())
      .then(d => setTrendingTopics(d.trending ?? []))
      .catch(() => {});
  }, []);

  // Cycling placeholder in the search input
  useEffect(() => {
    const t = setInterval(() => setPlaceholderIdx(i => (i + 1) % EXAMPLE_TOPICS.length), 3500);
    return () => clearInterval(t);
  }, []);

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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} session(s)? This cannot be undone.`)) return;
    const ids = Array.from(selectedIds);
    try {
      await bulkDeleteSessions(ids);
      setSessions((prev) => prev.filter((s) => !ids.includes(s.id)));
      setSelectedIds(new Set());
      setSelectMode(false);
      toast.success(`Deleted ${ids.length} session(s)`);
    } catch {
      toast.error("Bulk delete failed");
    }
  }

  async function handleBulkTag() {
    const tags = bulkTagInput.split(",").map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) return;
    const ids = Array.from(selectedIds);
    try {
      await bulkTagSessions(ids, tags);
      setShowBulkTagModal(false);
      setBulkTagInput("");
      setSelectedIds(new Set());
      setSelectMode(false);
      toast.success(`Tagged ${ids.length} session(s)`);
    } catch {
      toast.error("Bulk tag failed");
    }
  }

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
      const langParam  = language !== "English" ? `&language=${encodeURIComponent(language)}` : "";
      const docParam   = uploadedDocs.length > 0 ? `&doc_ids=${uploadedDocs.map(d => d.id).join(",")}` : "";
      const modelParam = modelTier !== "balanced" ? `&model_tier=${modelTier}` : "";
      router.push(`/research/${session_id}?topic=${encodeURIComponent(topic.trim())}&depth=${depth}${langParam}${docParam}${modelParam}`);
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
    if (days > 0) return t.daysAgo(days);
    if (hours > 0) return t.hoursAgo(hours);
    if (mins > 0) return t.minutesAgo(mins);
    return t.justNow;
  }

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "completed") return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
    return <Loader2 className="w-4 h-4 text-brand-400 animate-spin shrink-0" />;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start px-4 pt-16 pb-12 relative overflow-x-hidden">

      {/* ── Animated background ── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        {/* Dot grid texture */}
        <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "radial-gradient(circle, #94a3b8 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        {/* Gradient orbs */}
        <div className="absolute -top-60 -right-60 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-60 -left-60 w-[600px] h-[600px] bg-violet-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1.5s", animationDuration: "4s" }} />
        <div className="absolute top-1/3 left-1/4 w-72 h-72 bg-brand-400/6 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "3s", animationDuration: "5s" }} />
      </div>

      {/* Top bar: Auth + Theme — fixed so it stays visible on scroll */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-end gap-2 px-4 py-3 backdrop-blur-md dark:bg-slate-950/80 bg-white/80 border-b dark:border-white/5 border-slate-200/60">
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
              <span className="hidden sm:inline">{t.signOut}</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                       bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            {t.signIn}
          </button>
        )}
        {isAuthenticated && (
          <>
            <div className="hidden sm:flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5 border border-white/8">
              {[
                { icon: <BarChart3    className="w-3.5 h-3.5" />, label: "Dashboard", path: "/dashboard",  title: "Analytics" },
                { icon: <Code2        className="w-3.5 h-3.5" />, label: "API",       path: "/developer",  title: "Developer API" },
                { icon: <CalendarClock className="w-3.5 h-3.5"/>, label: "Schedules", path: "/schedules",  title: "Scheduled research" },
                { icon: <Webhook      className="w-3.5 h-3.5" />, label: "Webhooks",  path: "/webhooks",   title: "Webhooks" },
                { icon: <Link2        className="w-3.5 h-3.5" />, label: "Chains",    path: "/chains",     title: "Research chains" },
              ].map(nav => (
                <button
                  key={nav.path}
                  onClick={() => router.push(nav.path)}
                  title={nav.title}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {nav.icon}
                  <span>{nav.label}</span>
                </button>
              ))}
            </div>
            {/* Mobile: just icons */}
            <div className="flex sm:hidden items-center gap-1">
              {[
                { icon: <BarChart3    className="w-4 h-4" />, path: "/dashboard",  title: "Dashboard" },
                { icon: <CalendarClock className="w-4 h-4"/>, path: "/schedules",  title: "Schedules" },
                { icon: <Link2        className="w-4 h-4" />, path: "/chains",     title: "Chains" },
              ].map(nav => (
                <button key={nav.path} onClick={() => router.push(nav.path)} title={nav.title}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
                  {nav.icon}
                </button>
              ))}
            </div>
          </>
        )}
        <button
          onClick={() => setShowOnboarding(true)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg dark:text-slate-400 text-slate-600 hover:dark:text-white hover:text-slate-900 dark:hover:bg-white/5 hover:bg-slate-100 transition-colors"
          title="What can ResearchMind do?"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t.tour}</span>
        </button>
        {/* Language picker */}
        <div className="relative">
          <button
            onClick={() => setShowLangPicker(v => !v)}
            title="Research language"
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg dark:text-slate-400 text-slate-600 hover:dark:text-white hover:text-slate-900 dark:hover:bg-white/5 hover:bg-slate-100 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{language}</span>
          </button>
          <AnimatePresence>
            {showLangPicker && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full mt-1 z-50 w-40 rounded-xl overflow-hidden shadow-xl border dark:border-white/10 border-slate-200 dark:bg-slate-900 bg-white"
              >
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => { setLanguage(lang.code); setShowLangPicker(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors
                      ${language === lang.code
                        ? "dark:bg-brand-500/20 bg-brand-50 dark:text-brand-300 text-brand-700"
                        : "dark:hover:bg-white/5 hover:bg-slate-50 dark:text-slate-300 text-slate-700"}`}
                  >
                    <span>{lang.native}</span>
                    {language === lang.code && <Check className="w-3 h-3" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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

      {/* Bulk Action Bar — floats at bottom when select mode is active */}
      <AnimatePresence>
        {selectMode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/15 bg-slate-900/95 backdrop-blur-lg shadow-2xl shadow-black/40"
          >
            <span className="text-sm text-slate-300 font-medium min-w-[80px]">
              {selectedIds.size} selected
            </span>
            <button
              disabled={selectedIds.size === 0}
              onClick={() => setShowBulkTagModal(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/30 disabled:opacity-40 transition-colors"
            >
              <Tags className="w-3.5 h-3.5" /> Tag
            </button>
            <button
              disabled={selectedIds.size === 0}
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 disabled:opacity-40 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button
              onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
              className="text-xs px-3 py-1.5 rounded-lg text-slate-400 hover:text-white glass transition-colors"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Tag Modal */}
      <AnimatePresence>
        {showBulkTagModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-base font-semibold text-white mb-1">Tag {selectedIds.size} session(s)</h3>
              <p className="text-xs text-slate-500 mb-4">Comma-separated tags, e.g. <span className="text-brand-400">ai, research, 2026</span></p>
              <input
                type="text"
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBulkTag()}
                placeholder="tag1, tag2, ..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500 mb-4"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleBulkTag}
                  disabled={!bulkTagInput.trim()}
                  className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
                >
                  Apply Tags
                </button>
                <button
                  onClick={() => { setShowBulkTagModal(false); setBulkTagInput(""); }}
                  className="px-4 py-2 glass text-slate-400 hover:text-white text-sm rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
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
        {/* ── Hero ── */}
        <div className="text-center mb-8 sm:mb-12">

          {/* Badge pill */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.0 }}
            className="inline-flex items-center gap-2 mb-4 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-xs text-brand-300"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            {t.badgePowered}
          </motion.div>

          {/* Logo — centered as a block */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 180, damping: 14 }}
            className="flex items-center justify-center mb-5"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-gradient-to-br from-brand-500/30 via-brand-500/20 to-violet-500/20 border border-brand-500/40 shadow-2xl shadow-brand-500/20">
              <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-brand-400" />
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl font-black tracking-tight mb-3"
          >
            <span className="bg-gradient-to-r from-white via-slate-200 to-brand-300 bg-clip-text text-transparent dark:from-white dark:via-slate-200 dark:to-brand-300 from-slate-900 via-slate-700 to-brand-600">
              ResearchMind
            </span>
          </motion.h1>

          {/* Tagline with rotating word — fixed spacing */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="dark:text-slate-400 text-slate-600 text-base sm:text-lg max-w-sm mx-auto leading-relaxed h-7 flex items-center justify-center gap-1.5"
          >
            <span>{t.heroTagline1}</span>
            <AnimatePresence mode="wait">
              <motion.span
                key={ROTATING_WORDS[wordIdx].word}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
                className={`font-semibold ${ROTATING_WORDS[wordIdx].color}`}
              >
                {t.heroTaglineRotating[wordIdx % t.heroTaglineRotating.length]}
              </motion.span>
            </AnimatePresence>
            <span>—</span>
          </motion.div>

          {/* Live capability dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.28 }}
            className="flex items-center justify-center gap-4 sm:gap-5 mt-4 text-xs text-slate-500 flex-wrap"
          >
            {[
              { dot: "bg-brand-400",   label: t.dot1 },
              { dot: "bg-violet-400",  label: t.dot2 },
              { dot: "bg-emerald-400", label: t.dot3 },
              { dot: "bg-amber-400",   label: t.dot4 },
            ].map(({ dot, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${dot} shadow-sm`} />
                {label}
              </span>
            ))}
          </motion.div>
        </div>

        {/* Form */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="relative glass rounded-2xl p-4 sm:p-6 space-y-4 border dark:border-brand-500/20 border-slate-200/80 shadow-xl shadow-brand-500/10 dark:shadow-brand-500/10 ring-1 ring-brand-500/5"
        >
          {/* Custom Prompts */}
          <PromptCustomizer onSelectPrompt={setCustomPrompts} />

          <div className="relative group" onClick={e => e.stopPropagation()}>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 z-10 group-focus-within:text-brand-400 transition-colors" />
            <input
              ref={inputRef}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder={topic ? "What do you want to research?" : `Try: ${EXAMPLE_TOPICS[placeholderIdx]}`}
              className="w-full dark:bg-white/5 bg-slate-50 dark:border-white/10 border-slate-200 rounded-xl pl-12 pr-4 py-3.5 sm:py-4 dark:text-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60 dark:focus:border-brand-500/60 focus:shadow-lg focus:shadow-brand-500/10 transition-all text-base sm:text-lg"
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

          {/* Depth control */}
          <div className="flex items-center gap-3 sm:gap-4 px-1">
            <label className="text-sm text-slate-400 shrink-0 w-12">{t.depth}</label>
            <div className="flex-1 relative">
              <input
                type="range" min={2} max={5} value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="w-full accent-brand-500 h-1.5 rounded-full"
              />
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              <span className="text-sm font-semibold text-white tabular-nums">{depth}</span>
              <span className="text-xs text-slate-500">{t.questions}</span>
            </div>
          </div>

          {/* Model selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs dark:text-slate-500 text-slate-400 shrink-0">Model:</span>
            {([
              { key: "fast",     label: "Fast",     sub: "8B · quick",      color: "text-amber-400  border-amber-500/30  bg-amber-500/10"  },
              { key: "balanced", label: "Balanced", sub: "70B · default",   color: "text-brand-400  border-brand-500/30  bg-brand-500/10"  },
              { key: "deep",     label: "Deep",     sub: "70B · thorough",  color: "text-violet-400 border-violet-500/30 bg-violet-500/10" },
            ] as const).map(({ key, label, sub, color }) => (
              <button
                key={key}
                type="button"
                onClick={() => setModelTier(key)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
                  modelTier === key
                    ? color
                    : "dark:text-slate-500 text-slate-400 border-transparent hover:border-slate-600"
                }`}
              >
                {label}
                <span className="dark:text-slate-600 text-slate-400 hidden sm:inline">{sub}</span>
              </button>
            ))}
          </div>

          {/* Document uploader — only for authenticated users */}
          {isAuthenticated && (
            <DocumentUploader docs={uploadedDocs} onChange={setUploadedDocs} />
          )}

          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all duration-200 shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:scale-[1.01] active:scale-[0.99] text-sm sm:text-base"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Launching agents…</>
              : <><Zap className="w-4 h-4" /> {t.startResearch} <ChevronRight className="w-4 h-4 ml-1" /></>
            }
          </button>

          {/* Pipeline step indicator — visible while loading */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-center gap-1 pt-3 pb-1">
                  {PIPELINE_STEPS.map((step, i) => (
                    <div key={step.label} className="flex items-center gap-1">
                      <motion.div
                        className="flex items-center gap-1"
                        animate={{ opacity: [0.35, 1, 0.35] }}
                        transition={{ repeat: Infinity, duration: 2.4, delay: i * 0.6 }}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${step.dot} shrink-0`} />
                        <span className={`text-[10px] font-medium ${step.color}`}>{step.label}</span>
                      </motion.div>
                      {i < PIPELINE_STEPS.length - 1 && (
                        <span className="text-slate-700 text-[10px] mx-0.5">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.form>

        {/* Compare link */}
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => router.push("/compare")}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-400 transition-colors"
          >
            <GitCompare className="w-3.5 h-3.5" />
            {t.compareDepths}
          </button>
        </div>

        {/* ── Research Templates ── */}
        <div className="mt-5">
          <button
            onClick={() => setShowTemplates(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 glass rounded-xl border dark:border-white/8 border-slate-200 hover:border-brand-500/30 transition-all group"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">🗂️</span>
              <span className="text-sm font-medium dark:text-slate-300 text-slate-700">Research Templates</span>
              <span className="text-xs dark:text-slate-500 text-slate-400 hidden sm:inline">— start from a proven framework</span>
            </div>
            <motion.div animate={{ rotate: showTemplates ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronRight className="w-4 h-4 dark:text-slate-500 text-slate-400 rotate-90" />
            </motion.div>
          </button>

          <AnimatePresence>
            {showTemplates && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 glass rounded-xl border dark:border-white/8 border-slate-200 overflow-hidden">
                  {/* Category tabs */}
                  <div className="flex overflow-x-auto scrollbar-hide border-b dark:border-white/8 border-slate-200 px-2 pt-2 gap-1">
                    {RESEARCH_TEMPLATES.map(tmpl => (
                      <button
                        key={tmpl.category}
                        onClick={() => setActiveTemplateCategory(tmpl.category)}
                        className={`shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-t-lg font-medium transition-all border-b-2 ${
                          activeTemplateCategory === tmpl.category
                            ? `${tmpl.color} border-current dark:bg-white/5 bg-slate-50`
                            : "dark:text-slate-500 text-slate-400 border-transparent hover:dark:text-slate-300 hover:text-slate-600"
                        }`}
                      >
                        <span>{tmpl.icon}</span>
                        <span className="hidden sm:inline">{tmpl.category}</span>
                      </button>
                    ))}
                  </div>

                  {/* Template topics */}
                  <div className="p-3 space-y-2">
                    {RESEARCH_TEMPLATES.find(t => t.category === activeTemplateCategory)?.topics.map(topic => (
                      <motion.button
                        key={topic}
                        whileHover={{ x: 4 }}
                        onClick={() => {
                          setTopic(topic);
                          setShowTemplates(false);
                          inputRef.current?.focus();
                        }}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left dark:hover:bg-white/5 hover:bg-slate-50 transition-colors group/item border border-transparent hover:border-brand-500/20"
                      >
                        <span className="text-sm dark:text-slate-300 text-slate-700 leading-snug">{topic}</span>
                        <ChevronRight className="w-3.5 h-3.5 dark:text-slate-600 text-slate-400 group-hover/item:text-brand-400 shrink-0 transition-colors" />
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Trending Topics ── */}
        {trendingTopics.length > 0 && (
          <div className="mt-5">
            <p className="text-xs text-slate-500 mb-3 text-center tracking-wide uppercase font-medium flex items-center justify-center gap-1.5">
              <span>🔥</span> Trending on ResearchMind
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {trendingTopics.map(({ topic, count }) => (
                <motion.button
                  key={topic}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setTopic(topic)}
                  className="flex items-center gap-1.5 text-xs glass px-3.5 py-1.5 rounded-full dark:text-slate-300 text-slate-600 hover:text-brand-400 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all border border-transparent"
                >
                  {topic}
                  <span className="dark:text-slate-600 text-slate-400 text-[10px]">{count}</span>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* Examples */}
        <div className="mt-5">
          <p className="text-xs text-slate-500 mb-3 text-center tracking-wide uppercase font-medium">{t.tryAnExample}</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {EXAMPLE_TOPICS.map((t) => (
              <motion.button
                key={t}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setTopic(t)}
                className="text-xs glass px-3.5 py-1.5 rounded-full dark:text-slate-300 text-slate-600 hover:text-brand-400 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all border border-transparent"
              >
                {t}
              </motion.button>
            ))}
          </div>
        </div>

        {/* ── Capability cards ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2"
        >
          {[
            { icon: <Brain    className="w-5 h-5" />, label: t.dot1, sub: t.cap1Sub, color: "text-brand-400",   bg: "bg-brand-500/8   border-brand-500/15"  },
            { icon: <Network  className="w-5 h-5" />, label: t.dot2, sub: t.cap2Sub, color: "text-violet-400", bg: "bg-violet-500/8  border-violet-500/15" },
            { icon: <FileText className="w-5 h-5" />, label: t.dot3, sub: t.cap3Sub, color: "text-emerald-400",bg: "bg-emerald-500/8 border-emerald-500/15"},
            { icon: <Link2    className="w-5 h-5" />, label: t.dot4, sub: t.cap4Sub, color: "text-amber-400",  bg: "bg-amber-500/8   border-amber-500/15"  },
          ].map(f => (
            <motion.div
              key={f.label}
              whileHover={{ scale: 1.03, y: -2 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={`flex flex-col gap-2 p-3.5 rounded-xl border ${f.bg} cursor-default`}
            >
              <span className={f.color}>{f.icon}</span>
              <p className="text-xs font-semibold dark:text-white text-slate-800">{f.label}</p>
              <p className="text-[10px] dark:text-slate-500 text-slate-500 leading-snug">{f.sub}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* ── How it works ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42 }}
          className="mt-6 glass rounded-2xl p-5 sm:p-6 border dark:border-white/6 border-slate-200/60"
        >
          <p className="text-xs font-semibold dark:text-slate-400 text-slate-500 uppercase tracking-wider mb-5 text-center">{t.howItWorks}</p>
          <div className="grid grid-cols-4 gap-3 relative">
            {/* Connector line — sits behind icons using absolute positioning */}
            <div
              className="absolute hidden sm:block h-px"
              style={{
                top: "20px",
                left: "calc(12.5% + 20px)",
                right: "calc(12.5% + 20px)",
                background: "linear-gradient(90deg, rgba(99,102,241,0.4), rgba(139,92,246,0.4), rgba(16,185,129,0.4), rgba(245,158,11,0.4))",
              }}
            />
            {[
              { icon: <Brain    className="w-4 h-4" />, label: t.step1Title, sub: t.step1Desc, color: "text-brand-400",   ring: "ring-brand-500/40",   bg: "bg-brand-500/15"   },
              { icon: <Search   className="w-4 h-4" />, label: t.step2Title, sub: t.step2Desc, color: "text-violet-400", ring: "ring-violet-500/40", bg: "bg-violet-500/15" },
              { icon: <FileText className="w-4 h-4" />, label: t.step3Title, sub: t.step3Desc, color: "text-emerald-400",ring: "ring-emerald-500/40",bg: "bg-emerald-500/15"},
              { icon: <Sparkles className="w-4 h-4" />, label: t.step4Title, sub: t.step4Desc, color: "text-amber-400",  ring: "ring-amber-500/40",  bg: "bg-amber-500/15"  },
            ].map(s => (
              <div key={s.label} className="flex flex-col items-center text-center gap-2">
                {/* Icon bubble — z-10 so it sits on top of the connector line */}
                <div className={`relative z-10 w-10 h-10 rounded-xl dark:bg-slate-900 bg-white ${s.bg} ring-1 ${s.ring} flex items-center justify-center shrink-0`}>
                  <span className={s.color}>{s.icon}</span>
                </div>
                <div>
                  <p className={`text-xs font-semibold ${s.color}`}>{s.label}</p>
                  <p className="text-[10px] dark:text-slate-500 text-slate-500 leading-snug mt-0.5 hidden sm:block">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Guest CTA — only for non-authenticated users ── */}
        {!isAuthenticated && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-8 relative overflow-hidden rounded-2xl border dark:border-brand-500/20 border-brand-200/60 p-6 sm:p-8 text-center"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.06) 50%, rgba(16,185,129,0.05) 100%)" }}
          >
            {/* Background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-violet-500/5 pointer-events-none" />
            <div className="relative z-10">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-500/25 mb-4">
                <UserCircle2 className="w-6 h-6 text-brand-400" />
              </div>
              <h3 className="text-base font-bold dark:text-white text-slate-800 mb-2">
                {t.saveHistory}
              </h3>
              <p className="text-sm dark:text-slate-400 text-slate-600 max-w-xs mx-auto mb-5 leading-relaxed">
                {t.guestCtaDetail}
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-brand-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <LogIn className="w-4 h-4" />
                  {t.getStarted}
                </button>
                <button
                  onClick={() => setShowOnboarding(true)}
                  className="flex items-center gap-2 px-5 py-2.5 glass border dark:border-white/10 border-slate-200 text-sm dark:text-slate-300 text-slate-700 rounded-xl hover:dark:bg-white/5 hover:bg-slate-50 transition-all"
                >
                  <Sparkles className="w-4 h-4 text-brand-400" />
                  See what&apos;s possible
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* History — always shown when authenticated */}
        {isAuthenticated && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-12"
          >
            {/* History header */}
            <div className="mb-4">
              {/* Gradient divider with label */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <div className="flex items-center gap-1.5 text-xs dark:text-slate-500 text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  <h2 className="font-medium">{t.recentResearch}</h2>
                  <span className="dark:bg-white/8 bg-slate-200 dark:text-slate-400 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">
                    {filteredSessions.length}/{totalSessions}
                  </span>
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
              <div />
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
                  <span className="hidden sm:inline">{sortOrder === "newest" ? t.newest : t.oldest}</span>
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
                  {t.filters}
                  {activeFilterCount > 0 && (
                    <span className="ml-1 bg-white/30 text-white text-[10px] px-1.5 rounded-full font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {/* Select mode toggle */}
                {isAuthenticated && filteredSessions.length > 0 && (
                  <button
                    onClick={() => { setSelectMode(v => !v); setSelectedIds(new Set()); }}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ${
                      selectMode
                        ? "bg-brand-500 text-white"
                        : "dark:text-slate-400 text-slate-600 hover:text-brand-500 glass"
                    }`}
                  >
                    {selectMode ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                    Select
                  </button>
                )}
              </div>
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
                  <FolderOpen className="w-3 h-3" /> {t.all}
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
                      placeholder={t.folderName}
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
                    <Plus className="w-3 h-3" /> {t.newFolder}
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
                placeholder={t.searchPast}
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
                        <span className="text-xs dark:text-slate-400 text-slate-600 font-medium">{t.status}</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {(["all", "completed", "failed"] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => setStatusFilter(f)}
                            className={`text-xs px-3 py-1 rounded-full transition-colors ${
                              statusFilter === f
                                ? f === "completed" ? "bg-emerald-500 text-white"
                                  : f === "failed" ? "bg-red-500 text-white"
                                  : "bg-brand-500 text-white"
                                : "dark:text-slate-400 text-slate-600 hover:text-brand-500 glass"
                            }`}
                          >
                            {f === "completed" ? `✓ ${t.statusCompleted}` : f === "failed" ? `✗ ${t.statusFailed}` : t.all}
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
                          {t.favorites}
                        </button>
                      </div>
                    </div>
                    {/* Date filter */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span className="text-xs dark:text-slate-400 text-slate-600 font-medium">{t.dateRange}</span>
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
                            {days === 7 ? t.last7d : days === 30 ? t.last30d : days === 90 ? t.last90d : t.allTime}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Tag filter */}
                    {isAuthenticated && userTags.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Tag className="w-3 h-3 text-slate-500" />
                          <span className="text-xs dark:text-slate-400 text-slate-600 font-medium">{t.tags}</span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={() => setSelectedTag(null)}
                            className={`text-xs px-3 py-1 rounded-full transition-colors ${
                              selectedTag === null ? "bg-brand-500 text-white" : "dark:text-slate-400 text-slate-600 hover:text-brand-500 glass"
                            }`}
                          >
                            {t.all}
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
                        <motion.div
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                          className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500/20 to-violet-500/10 border border-brand-500/20 flex items-center justify-center mx-auto shadow-lg shadow-brand-500/10"
                        >
                          <Sparkles className="w-7 h-7 text-brand-400" />
                        </motion.div>
                        <div>
                          <p className="text-base font-semibold dark:text-slate-200 text-slate-700 mb-1.5">Start your first research</p>
                          <p className="text-xs dark:text-slate-500 text-slate-500 max-w-xs mx-auto">
                            Type any topic above and hit{" "}
                            <span className="text-brand-400 font-medium">Start Research</span>.
                            4 AI agents will search, read, and synthesize a full report for you.
                          </p>
                        </div>
                        <button
                          onClick={() => setShowOnboarding(true)}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 hover:bg-brand-500/20 transition-colors"
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
                      className="relative group flex items-center gap-2"
                    >
                      {/* Select checkbox */}
                      {selectMode && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSelect(s.id); }}
                          className="shrink-0 w-5 h-5 flex items-center justify-center text-brand-400"
                        >
                          {selectedIds.has(s.id)
                            ? <CheckSquare className="w-5 h-5 text-brand-400" />
                            : <Square className="w-5 h-5 text-slate-500" />
                          }
                        </button>
                      )}

                      {/* Card */}
                      <div
                        onClick={() => selectMode ? toggleSelect(s.id) : router.push(`/research/${s.id}?topic=${encodeURIComponent(s.topic)}&depth=3`)}
                        className={`relative flex-1 rounded-2xl border dark:border-white/8 border-slate-200 dark:bg-white/[0.03] bg-white hover:dark:bg-white/[0.07] hover:bg-slate-50/80 dark:hover:border-white/15 hover:border-slate-300 transition-all duration-200 cursor-pointer overflow-hidden shadow-sm hover:shadow-lg dark:hover:shadow-brand-500/5 hover:translate-y-[-1px] ${
                          selectMode && selectedIds.has(s.id) ? "ring-2 ring-brand-500/60" : ""
                        }`}
                      >
                        {/* Left status accent bar */}
                        <div className={`absolute inset-y-0 left-0 w-[3px] rounded-l-2xl transition-all duration-200 ${
                          s.status === "completed" ? "bg-emerald-400 group-hover:shadow-sm group-hover:shadow-emerald-400/50" :
                          s.status === "failed"    ? "bg-red-400" :
                                                     "bg-brand-400 animate-pulse"
                        }`} />

                        <div className="pl-5 pr-24 py-4">
                          {/* Topic */}
                          <h3 className="text-sm font-semibold dark:text-slate-100 text-slate-800 leading-snug mb-2 line-clamp-2 group-hover:dark:text-white transition-colors">
                            {s.topic}
                          </h3>

                          {/* Meta row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                              s.status === "completed" ? "bg-emerald-500/15 text-emerald-400" :
                              s.status === "failed"    ? "bg-red-500/15 text-red-400" :
                                                         "bg-brand-500/15 text-brand-400"
                            }`}>
                              <StatusIcon status={s.status} />
                              <span>{s.status === "completed" ? t.statusCompleted : s.status === "failed" ? t.statusFailed : t.statusRunning}</span>
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
                            placeholder={t.newTag}
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
