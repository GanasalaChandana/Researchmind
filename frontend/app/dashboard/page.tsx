"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDashboardStats } from "@/lib/api";
import { motion } from "framer-motion";
import {
  ArrowLeft, BarChart3, TrendingUp, CheckCircle2,
  XCircle, Clock, Star, Loader2, Zap, Target,
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

const StatCard = ({
  label, value, sub, icon: Icon, color, delay,
}: {
  label: string; value: string | number; sub?: string;
  icon: any; color: string; delay: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.3 }}
    className={`relative rounded-2xl border p-5 overflow-hidden ${color}`}
  >
    {/* Background icon watermark */}
    <Icon className="absolute -right-3 -bottom-3 w-20 h-20 opacity-[0.07]" />
    <div className="relative z-10">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">{label}</p>
      <p className="text-4xl font-bold mb-1">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
    <Icon className="absolute top-4 right-4 w-5 h-5 opacity-40" />
  </motion.div>
);

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) { router.push("/"); return; }
    getDashboardStats()
      .then(setStats)
      .catch((err) => setError(err.message || "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-sm text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen p-6 max-w-5xl mx-auto">
        <button onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="rounded-2xl border border-white/10 p-8 text-center">
          <p className="text-slate-400">Failed to load dashboard</p>
        </div>
      </div>
    );
  }

  const maxTopicCount = Math.max(...(stats.top_topics.map((t) => t.count) || [1]), 1);
  const maxDayCount = Math.max(...(stats.sessions_by_date.slice(-7).map((d) => d.count) || [1]), 1);

  return (
    <div className="min-h-screen px-4 py-8 max-w-5xl mx-auto">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <button onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-5 group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to research
        </button>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/20">
            <BarChart3 className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold dark:text-white text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500">Your research analytics & insights</p>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard label="Total Sessions" value={stats.total} icon={BarChart3}
          color="dark:bg-white/[0.03] bg-white border-slate-200 dark:border-white/8 dark:text-white text-slate-800"
          delay={0} />
        <StatCard label="Completed" value={stats.completed} sub={`${stats.success_rate}% success rate`}
          icon={CheckCircle2}
          color="dark:bg-emerald-500/[0.07] bg-emerald-50 border-emerald-500/20 text-emerald-400"
          delay={0.05} />
        <StatCard label="Failed" value={stats.failed}
          sub={`${stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(1) : 0}% fail rate`}
          icon={XCircle}
          color="dark:bg-red-500/[0.07] bg-red-50 border-red-500/20 text-red-400"
          delay={0.1} />
        <StatCard label="In Progress" value={stats.running} icon={Clock}
          color="dark:bg-blue-500/[0.07] bg-blue-50 border-blue-500/20 text-blue-400"
          delay={0.15} />
        <StatCard label="Favorites" value={stats.favorites} icon={Star}
          color="dark:bg-amber-500/[0.07] bg-amber-50 border-amber-500/20 text-amber-400"
          delay={0.2} />
        <StatCard label="Avg Depth" value={`${stats.avg_depth}q`} sub="questions per session"
          icon={TrendingUp}
          color="dark:bg-purple-500/[0.07] bg-purple-50 border-purple-500/20 text-purple-400"
          delay={0.25} />
      </div>

      {/* Bottom two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top Topics */}
        {stats.top_topics.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border dark:border-white/8 border-slate-200 dark:bg-white/[0.02] bg-white p-5">
            <div className="flex items-center gap-2 mb-5">
              <Target className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold dark:text-white text-slate-800">Top Topics</h2>
            </div>
            <div className="space-y-3.5">
              {stats.top_topics.map((topic, idx) => (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs dark:text-slate-300 text-slate-700 truncate max-w-[80%]">{topic.topic}</p>
                    <span className="text-xs font-semibold dark:text-slate-400 text-slate-500 ml-2">{topic.count}×</span>
                  </div>
                  <div className="h-1.5 dark:bg-slate-700/60 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(topic.count / maxTopicCount) * 100}%` }}
                      transition={{ delay: 0.4 + idx * 0.05, duration: 0.5 }}
                      className="h-full rounded-full"
                      style={{
                        background: `hsl(${230 + idx * 15}, 70%, ${60 - idx * 4}%)`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Activity Chart */}
        {stats.sessions_by_date.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="rounded-2xl border dark:border-white/8 border-slate-200 dark:bg-white/[0.02] bg-white p-5">
            <div className="flex items-center gap-2 mb-5">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold dark:text-white text-slate-800">Last 7 Days Activity</h2>
            </div>
            <div className="space-y-3">
              {stats.sessions_by_date.slice(-7).map((day, idx) => {
                const completedPct = day.count > 0 ? (day.completed / day.count) * 100 : 0;
                const failedPct = 100 - completedPct;
                const barWidth = day.count > 0 ? Math.max((day.count / maxDayCount) * 100, 8) : 0;
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-xs dark:text-slate-500 text-slate-400 w-10 shrink-0 text-right">
                      {new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <div className="flex-1 h-5 dark:bg-slate-700/40 bg-slate-100 rounded-full overflow-hidden">
                      {day.count > 0 && (
                        <motion.div
                          className="h-full flex rounded-full overflow-hidden"
                          initial={{ width: 0 }}
                          animate={{ width: `${barWidth}%` }}
                          transition={{ delay: 0.45 + idx * 0.05, duration: 0.4 }}
                        >
                          <div className="bg-emerald-500" style={{ width: `${completedPct}%` }} />
                          {failedPct > 0 && (
                            <div className="bg-red-400/70" style={{ width: `${failedPct}%` }} />
                          )}
                        </motion.div>
                      )}
                    </div>
                    <span className="text-xs font-medium dark:text-slate-400 text-slate-500 w-5 text-right">{day.count}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t dark:border-white/5 border-slate-100">
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Completed
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400/70 inline-block" /> Failed
              </span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
