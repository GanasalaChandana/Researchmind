"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import {
  Link2, ArrowLeft, Loader2, Trash2, ChevronRight,
  CheckCircle2, XCircle, Clock, Play, Pause, Zap,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChainStep {
  id: string;
  chain_id: string;
  session_id: string | null;
  topic: string;
  step_order: number;
  status: "pending" | "running" | "completed" | "failed";
  started_at: string | null;
  completed_at: string | null;
}

interface Chain {
  id: string;
  name: string;
  user_id: string;
  root_session_id: string | null;
  auto_run: boolean;
  status: "active" | "completed" | "paused";
  created_at: string;
  steps: ChainStep[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function token() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("rm_access_token") ?? "";
}

function auth() {
  return { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
}

function timeago(iso: string | null): string {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function stepIcon(status: ChainStep["status"]) {
  if (status === "completed") return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === "failed")    return <XCircle      className="w-4 h-4 text-red-400" />;
  if (status === "running")   return <Loader2      className="w-4 h-4 text-brand-400 animate-spin" />;
  return <Clock className="w-4 h-4 text-slate-600" />;
}

function chainProgress(chain: Chain): string {
  const done = chain.steps.filter(s => s.status === "completed").length;
  return `${done}/${chain.steps.length}`;
}

function chainStatusColor(chain: Chain): string {
  if (chain.status === "completed") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (chain.status === "paused")    return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  const running = chain.steps.some(s => s.status === "running");
  if (running)                      return "text-brand-400 bg-brand-500/10 border-brand-500/20";
  return "text-slate-400 bg-white/5 border-white/10";
}

function chainStatusLabel(chain: Chain): string {
  if (chain.status === "completed") return "completed";
  if (chain.status === "paused")    return "paused";
  if (chain.steps.some(s => s.status === "running")) return "running";
  return "queued";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChainsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [chains, setChains]   = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/");
  }, [authLoading, user]);

  useEffect(() => {
    if (user) fetchChains();
  }, [user]);

  // Auto-refresh while any chain is running
  useEffect(() => {
    const hasRunning = chains.some(
      c => c.status === "active" && c.steps.some(s => s.status === "running")
    );
    if (!hasRunning) return;
    const t = setTimeout(fetchChains, 5000);
    return () => clearTimeout(t);
  }, [chains]);

  async function fetchChains() {
    try {
      const r = await fetch(`${BACKEND}/chains`, { headers: auth() });
      if (r.ok) setChains((await r.json()).chains ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAutoRun(chain: Chain) {
    const r = await fetch(`${BACKEND}/chains/${chain.id}`, {
      method: "PATCH",
      headers: auth(),
      body: JSON.stringify({ auto_run: !chain.auto_run }),
    });
    if (r.ok) {
      setChains(prev => prev.map(c => c.id === chain.id ? { ...c, auto_run: !c.auto_run } : c));
      toast.success(chain.auto_run ? "Auto-run paused" : "Auto-run resumed");
    }
  }

  async function deleteChain(id: string) {
    if (!confirm("Delete this chain? The research sessions will not be deleted.")) return;
    const r = await fetch(`${BACKEND}/chains/${id}`, { method: "DELETE", headers: auth() });
    if (r.ok) {
      setChains(prev => prev.filter(c => c.id !== id));
      toast.success("Chain deleted");
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white px-4 py-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push("/")}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-slate-400"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="p-2 rounded-xl bg-violet-500/15 border border-violet-500/25">
            <Link2 className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Research Chains</h1>
            <p className="text-xs text-slate-500">Sequential multi-topic research series</p>
          </div>
        </div>

        {/* Chain list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
          </div>
        ) : chains.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Link2 className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium mb-1">No chains yet</p>
            <p className="text-xs max-w-xs mx-auto">
              Complete any research session and click "Continue as Research Chain" to start one.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {chains.map(chain => (
              <div key={chain.id} className="glass rounded-xl border border-white/8 overflow-hidden">

                {/* Chain header */}
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-white truncate">{chain.name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${chainStatusColor(chain)}`}>
                        {chainStatusLabel(chain)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{chainProgress(chain)} steps done</span>
                      <span>·</span>
                      <span>{chain.auto_run ? "auto-run on" : "auto-run off"}</span>
                      <span>·</span>
                      <span>{timeago(chain.created_at)}</span>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${(chain.steps.filter(s => s.status === "completed").length / chain.steps.length) * 100}%`
                        }}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleAutoRun(chain)}
                      title={chain.auto_run ? "Pause auto-run" : "Resume auto-run"}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      {chain.auto_run ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => deleteChain(chain.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setExpanded(e => e === chain.id ? null : chain.id)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        expanded === chain.id
                          ? "text-violet-400 bg-violet-500/10"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <ChevronRight
                        className={`w-3.5 h-3.5 transition-transform ${expanded === chain.id ? "rotate-90" : ""}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Steps detail */}
                <AnimatePresence>
                  {expanded === chain.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-white/6 px-4 py-3 space-y-2">
                        {chain.steps.map((step, i) => (
                          <div key={step.id} className="flex items-start gap-3">
                            {/* Connector line */}
                            <div className="flex flex-col items-center">
                              {stepIcon(step.status)}
                              {i < chain.steps.length - 1 && (
                                <div className="w-px h-4 bg-white/10 mt-1" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0 pb-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm ${
                                  step.status === "completed" ? "text-white" :
                                  step.status === "running"   ? "text-brand-300" :
                                  step.status === "failed"    ? "text-red-400" :
                                  "text-slate-500"
                                }`}>
                                  {step.topic}
                                </span>
                                {step.status === "running" && (
                                  <span className="text-[10px] text-brand-400 animate-pulse">researching…</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-600">
                                {step.completed_at && <span>done {timeago(step.completed_at)}</span>}
                                {step.session_id && step.status === "completed" && (
                                  <button
                                    onClick={() => router.push(`/research/${step.session_id}`)}
                                    className="text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-0.5"
                                  >
                                    View report <ChevronRight className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            ))}
          </div>
        )}

        {/* How it works */}
        <div className="mt-8 p-4 rounded-xl bg-white/[0.02] border border-white/6 text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-400 mb-2">How chains work</p>
          <p>1. Complete any research session and click <strong className="text-slate-400">"Continue as Research Chain"</strong></p>
          <p>2. The AI suggests 3 follow-up topics — edit, add, or remove as needed</p>
          <p>3. With <strong className="text-slate-400">auto-run on</strong>, each step starts automatically when the previous one finishes</p>
          <p>4. View any step's full report by clicking <strong className="text-slate-400">"View report"</strong> in the chain steps</p>
        </div>

      </div>
    </div>
  );
}
