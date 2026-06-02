"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startResearch } from "@/lib/api";
import { motion } from "framer-motion";
import { GitCompare, Search, ChevronRight, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

export default function ComparePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    try {
      // Start two sessions simultaneously at depth 3 and depth 5
      const [res1, res2] = await Promise.all([
        startResearch(topic.trim(), 3),
        startResearch(topic.trim(), 5),
      ]);
      // Save both session IDs to localStorage
      const existing: string[] = JSON.parse(localStorage.getItem("rm_sessions") ?? "[]");
      localStorage.setItem("rm_sessions", JSON.stringify([res1.session_id, res2.session_id, ...existing]));
      router.push(
        `/compare/${res1.session_id}/${res2.session_id}?topic=${encodeURIComponent(topic.trim())}`
      );
    } catch {
      toast.error("Failed to start comparison");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl"
      >
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500/20 border border-brand-500/30 mb-4">
            <GitCompare className="w-7 h-7 text-brand-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Depth Comparison</h1>
          <p className="text-slate-400 text-sm">
            Run the same topic at <span className="text-brand-400 font-medium">3 sub-questions</span> vs{" "}
            <span className="text-emerald-400 font-medium">5 sub-questions</span> — see the difference in depth
          </p>
        </div>

        {/* What changes */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="glass rounded-xl p-4 border-l-2 border-brand-500">
            <p className="text-xs text-slate-500 mb-1">Depth 3</p>
            <p className="text-sm font-medium text-white">Breadth overview</p>
            <p className="text-xs text-slate-400 mt-1">3 sub-questions · ~6 sources · faster</p>
          </div>
          <div className="glass rounded-xl p-4 border-l-2 border-emerald-500">
            <p className="text-xs text-slate-500 mb-1">Depth 5</p>
            <p className="text-sm font-medium text-white">Deep dive</p>
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
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
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
    </div>
  );
}
