"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import {
  CalendarClock, Plus, Trash2, Play, Pause, ArrowLeft,
  Loader2, Clock, RefreshCw, CheckCircle2, ChevronRight,
  Bell, BellOff, Zap,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Schedule {
  id: string;
  topic: string;
  frequency: "daily" | "weekly";
  day_of_week: number;
  hour: number;
  depth: number;
  is_active: boolean;
  notify_email: boolean;
  last_run_at: string | null;
  last_session_id: string | null;
  run_count: number;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function token(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("rm_access_token") ?? "";
}

function authHeaders() {
  return { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
}

function freqLabel(s: Schedule): string {
  if (s.frequency === "daily") return `Daily · ${s.hour}:00 UTC`;
  return `Weekly · ${DAYS[s.day_of_week]} · ${s.hour}:00 UTC`;
}

function nextRunDisplay(s: Schedule): string {
  const now   = new Date();
  const next  = new Date();
  next.setUTCHours(s.hour, 0, 0, 0);

  if (s.frequency === "daily") {
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  } else {
    // weekly: find next occurrence of day_of_week
    const curDow = now.getUTCDay() === 0 ? 6 : now.getUTCDay() - 1; // 0=Mon
    let diff = (s.day_of_week - curDow + 7) % 7;
    if (diff === 0 && next <= now) diff = 7;
    next.setUTCDate(now.getUTCDate() + diff);
  }

  return next.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    + ` at ${s.hour}:00 UTC`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const router              = useRouter();
  const { isAuthenticated } = useAuth();

  const [schedules, setSchedules]   = useState<Schedule[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [showForm,  setShowForm]    = useState(false);
  const [running,   setRunning]     = useState<string | null>(null);   // schedule id being triggered

  // ── Form state ──────────────────────────────────────────────────────────────
  const [topic,       setTopic]       = useState("");
  const [frequency,   setFrequency]   = useState<"daily" | "weekly">("weekly");
  const [dayOfWeek,   setDayOfWeek]   = useState(0);
  const [hour,        setHour]        = useState(9);
  const [depth,       setDepth]       = useState(3);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [creating,    setCreating]    = useState(false);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) { router.push("/"); return; }
    fetchSchedules();
  }, [isAuthenticated]);

  // ── API helpers ─────────────────────────────────────────────────────────────
  async function fetchSchedules() {
    setLoading(true);
    try {
      const res = await fetch(`/api/schedules`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function createSchedule() {
    if (!topic.trim()) { toast.error("Topic cannot be empty"); return; }
    setCreating(true);
    try {
      const res = await fetch(`/api/schedules`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ topic: topic.trim(), frequency, day_of_week: dayOfWeek, hour, depth, notify_email: notifyEmail }),
      });
      if (!res.ok) { toast.error("Failed to create schedule"); return; }
      const sched: Schedule = await res.json();
      setSchedules(prev => [sched, ...prev]);
      setShowForm(false);
      setTopic("");
      toast.success("Schedule created!");
    } catch {
      toast.error("Network error");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(s: Schedule) {
    const res = await fetch(`/api/schedules/${s.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ is_active: !s.is_active }),
    });
    if (res.ok) {
      const updated: Schedule = await res.json();
      setSchedules(prev => prev.map(x => x.id === s.id ? updated : x));
      toast.success(updated.is_active ? "Schedule resumed" : "Schedule paused");
    } else {
      toast.error("Failed to update schedule");
    }
  }

  async function deleteSchedule(id: string) {
    const res = await fetch(`/api/schedules/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) {
      setSchedules(prev => prev.filter(s => s.id !== id));
      toast.success("Schedule deleted");
    } else {
      toast.error("Failed to delete");
    }
  }

  async function runNow(s: Schedule) {
    setRunning(s.id);
    try {
      const res = await fetch(`/api/schedules/${s.id}/run`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("Research triggered! Check your history shortly.");
        // Refresh to update last_run_at
        setTimeout(fetchSchedules, 3000);
        // Navigate to the new session
        setTimeout(() => router.push(`/research/${data.session_id}?topic=${encodeURIComponent(s.topic)}`), 800);
      } else {
        toast.error("Failed to trigger run");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setRunning(null);
    }
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen px-4 py-8 max-w-3xl mx-auto">

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-5 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back
        </button>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-500/15 border border-brand-500/20">
              <CalendarClock className="w-6 h-6 text-brand-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold dark:text-white text-slate-900">Scheduled Research</h1>
              <p className="text-sm text-slate-500">Auto-run research on a daily or weekly cadence</p>
            </div>
          </div>

          <button
            onClick={() => setShowForm(f => !f)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Schedule
          </button>
        </div>
      </motion.div>

      {/* ── Create form ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mb-6"
          >
            <div className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-white mb-1">New Scheduled Research</h2>

              {/* Topic */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Research topic</label>
                <input
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createSchedule()}
                  placeholder="e.g. Latest AI research papers"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                />
              </div>

              {/* Frequency + timing row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Frequency</label>
                  <select
                    value={frequency}
                    onChange={e => setFrequency(e.target.value as "daily" | "weekly")}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>

                {frequency === "weekly" && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Day</label>
                    <select
                      value={dayOfWeek}
                      onChange={e => setDayOfWeek(Number(e.target.value))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                    >
                      {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Hour (UTC)</label>
                  <select
                    value={hour}
                    onChange={e => setHour(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                  >
                    {HOURS.map(h => (
                      <option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Depth</label>
                  <select
                    value={depth}
                    onChange={e => setDepth(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                  >
                    {[1,2,3,4,5].map(d => <option key={d} value={d}>{d} questions</option>)}
                  </select>
                </div>
              </div>

              {/* Notify toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none group">
                <div
                  onClick={() => setNotifyEmail(n => !n)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${notifyEmail ? "bg-brand-500" : "bg-slate-700"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${notifyEmail ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
                <span className="text-sm text-slate-300">
                  Email me when research completes
                </span>
                {notifyEmail ? <Bell className="w-3.5 h-3.5 text-brand-400" /> : <BellOff className="w-3.5 h-3.5 text-slate-500" />}
              </label>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={createSchedule}
                  disabled={creating || !topic.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create
                </button>
                <button
                  onClick={() => { setShowForm(false); setTopic(""); }}
                  className="px-4 py-2 text-slate-400 hover:text-white text-sm rounded-lg hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Schedule list ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 text-brand-400 animate-spin" />
        </div>
      ) : schedules.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass rounded-2xl p-12 text-center"
        >
          <CalendarClock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-300 font-medium mb-1">No schedules yet</p>
          <p className="text-slate-500 text-sm max-w-xs mx-auto mb-6">
            Set a topic to auto-research daily or weekly — results appear in your history automatically
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> Create your first schedule
          </button>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`glass rounded-2xl p-5 transition-opacity ${!s.is_active ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">

                {/* Left: info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${s.is_active ? "bg-emerald-400" : "bg-slate-500"}`} />
                    <p className="text-sm font-semibold text-white truncate">{s.topic}</p>
                    {!s.is_active && (
                      <span className="text-[10px] bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">
                        Paused
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-wrap mt-2">
                    {/* Frequency badge */}
                    <span className="flex items-center gap-1.5 text-xs text-slate-400 bg-white/5 border border-white/8 rounded-full px-2.5 py-0.5">
                      <Clock className="w-3 h-3" />
                      {freqLabel(s)}
                    </span>

                    {/* Run count */}
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <CheckCircle2 className="w-3 h-3" />
                      {s.run_count} run{s.run_count !== 1 ? "s" : ""}
                    </span>

                    {/* Email notification */}
                    {s.notify_email
                      ? <span title="Email notifications on"><Bell    className="w-3 h-3 text-brand-400" /></span>
                      : <span title="Email notifications off"><BellOff className="w-3 h-3 text-slate-600" /></span>
                    }
                  </div>

                  {/* Last run + next run */}
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    {s.last_run_at && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" />
                        Last run {timeAgo(s.last_run_at)}
                        {s.last_session_id && (
                          <button
                            onClick={() => router.push(`/research/${s.last_session_id}`)}
                            className="ml-1 text-brand-400 hover:text-brand-300 flex items-center gap-0.5 transition-colors"
                          >
                            View <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    )}
                    {s.is_active && (
                      <span className="text-xs text-slate-500">
                        Next: {nextRunDisplay(s)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Run now */}
                  <button
                    onClick={() => runNow(s)}
                    disabled={running === s.id}
                    title="Run now"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                  >
                    {running === s.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Zap     className="w-3.5 h-3.5" />
                    }
                    <span className="hidden sm:inline">Run now</span>
                  </button>

                  {/* Pause / Resume */}
                  <button
                    onClick={() => toggleActive(s)}
                    title={s.is_active ? "Pause" : "Resume"}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    {s.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => deleteSchedule(s.id)}
                    title="Delete"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Info footer */}
      {schedules.length > 0 && (
        <p className="text-xs text-slate-600 text-center mt-8">
          Schedules run in UTC · results appear in your research history · email digest requires a verified sender in Resend
        </p>
      )}
    </div>
  );
}
