"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDashboardStats } from "@/lib/api";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  Star,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface DashboardStats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  favorites: number;
  success_rate: number;
  avg_depth: number;
  top_topics: Array<{ topic: string; count: number }>;
  sessions_by_date: Array<{ date: string; count: number; completed: number }>;
  status_breakdown: Record<string, number>;
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/");
      return;
    }

    getDashboardStats()
      .then(setStats)
      .catch((err) => {
        setError(err.message || "Failed to load dashboard");
      })
      .finally(() => setLoading(false));
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          <p className="text-sm text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen p-6">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="glass rounded-xl p-8 text-center">
          <p className="text-slate-400">Failed to load dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-slate-400">Your research analytics & insights</p>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {/* Total Sessions */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-6 border border-white/10"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400 mb-1">Total Sessions</p>
              <p className="text-3xl font-bold text-white">{stats.total}</p>
            </div>
            <BarChart3 className="w-10 h-10 text-brand-500/30" />
          </div>
        </motion.div>

        {/* Completed */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass rounded-xl p-6 border border-emerald-500/20"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400 mb-1">Completed</p>
              <p className="text-3xl font-bold text-emerald-400">{stats.completed}</p>
              <p className="text-xs text-slate-500 mt-1">{stats.success_rate}% success</p>
            </div>
            <CheckCircle2 className="w-10 h-10 text-emerald-500/30" />
          </div>
        </motion.div>

        {/* Failed */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-xl p-6 border border-red-500/20"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400 mb-1">Failed</p>
              <p className="text-3xl font-bold text-red-400">{stats.failed}</p>
              <p className="text-xs text-slate-500 mt-1">
                {stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(1) : 0}% fail rate
              </p>
            </div>
            <XCircle className="w-10 h-10 text-red-500/30" />
          </div>
        </motion.div>

        {/* Running */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-xl p-6 border border-blue-500/20"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400 mb-1">In Progress</p>
              <p className="text-3xl font-bold text-blue-400">{stats.running}</p>
            </div>
            <Clock className="w-10 h-10 text-blue-500/30" />
          </div>
        </motion.div>

        {/* Favorites */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-xl p-6 border border-amber-500/20"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400 mb-1">Favorites</p>
              <p className="text-3xl font-bold text-amber-400">{stats.favorites}</p>
            </div>
            <Star className="w-10 h-10 text-amber-500/30 fill-amber-500/10" />
          </div>
        </motion.div>

        {/* Avg Depth */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass rounded-xl p-6 border border-purple-500/20"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400 mb-1">Avg Depth</p>
              <p className="text-3xl font-bold text-purple-400">{stats.avg_depth}</p>
              <p className="text-xs text-slate-500 mt-1">questions per research</p>
            </div>
            <TrendingUp className="w-10 h-10 text-purple-500/30" />
          </div>
        </motion.div>
      </div>

      {/* Top Topics */}
      {stats.top_topics.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="glass rounded-xl p-6 mb-8 border border-white/10"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Top Topics</h2>
          <div className="space-y-3">
            {stats.top_topics.map((topic, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm text-white truncate">{topic.topic}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full"
                      style={{
                        width: `${(topic.count / Math.max(...stats.top_topics.map((t) => t.count))) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-8 text-right">{topic.count}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Recent Activity */}
      {stats.sessions_by_date.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="glass rounded-xl p-6 border border-white/10"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Last 30 Days Activity</h2>
          <div className="space-y-2">
            {stats.sessions_by_date.slice(-7).map((day, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-12">
                  {new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-6 bg-slate-700 rounded-md overflow-hidden flex">
                    {day.count > 0 && (
                      <>
                        <div
                          className="bg-emerald-500"
                          style={{ width: `${(day.completed / day.count) * 100}%` }}
                          title={`${day.completed} completed`}
                        />
                        <div
                          className="bg-red-500/60"
                          style={{ width: `${((day.count - day.completed) / day.count) * 100}%` }}
                          title={`${day.count - day.completed} failed`}
                        />
                      </>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 w-8 text-right">{day.count}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-4">Green = completed, Red = failed</p>
        </motion.div>
      )}
    </div>
  );
}
