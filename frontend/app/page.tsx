"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startResearch } from "@/lib/api";
import { motion } from "framer-motion";
import { Search, Sparkles, ChevronRight, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

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

  useEffect(() => {
    fetch("/api/research/sessions")
      .then((r) => r.json())
      .then((data) => setSessions(data))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const { session_id } = await startResearch(topic.trim(), depth);
      router.push(`/research/${session_id}?topic=${encodeURIComponent(topic.trim())}&depth=${depth}`);
    } catch {
      toast.error("Failed to start research. Is the backend running?");
      setLoading(false);
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500/20 border border-brand-500/30 mb-4">
            <Sparkles className="w-7 h-7 text-brand-500" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">ResearchMind</h1>
          <p className="text-slate-400">Multi-agent AI research. Enter a topic, watch the agents work.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What do you want to research?"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors text-lg"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="text-sm text-slate-400 shrink-0">Research depth</label>
            <input
              type="range" min={2} max={5} value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="flex-1 accent-brand-500"
            />
            <span className="text-sm text-slate-300 w-24 text-right">{depth} sub-questions</span>
          </div>

          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3.5 rounded-xl transition-colors"
          >
            {loading ? <>Launching agents...</> : <>Start Research <ChevronRight className="w-4 h-4" /></>}
          </button>
        </form>

        {/* Examples */}
        <div className="mt-6">
          <p className="text-xs text-slate-500 mb-3 text-center">Try an example</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {EXAMPLE_TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => setTopic(t)}
                className="text-xs glass px-3 py-1.5 rounded-full text-slate-300 hover:text-white hover:border-brand-500/50 transition-colors"
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
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-medium text-slate-400">Recent Research</h2>
            </div>
            <div className="space-y-2">
              {sessions.map((s) => (
                <motion.button
                  key={s.id}
                  onClick={() => router.push(`/research/${s.id}?topic=${encodeURIComponent(s.topic)}&depth=3`)}
                  className="w-full glass rounded-xl px-4 py-3 flex items-center gap-3 hover:border-brand-500/40 transition-colors text-left"
                  whileHover={{ x: 2 }}
                >
                  <StatusIcon status={s.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{s.topic}</p>
                    <p className="text-xs text-slate-500">{timeAgo(s.created_at)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
