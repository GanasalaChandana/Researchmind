"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import {
  Webhook as WebhookIcon, Plus, Trash2, Play, Pause, ArrowLeft,
  Loader2, CheckCircle2, XCircle, ChevronDown, Zap,
  Copy, Eye, EyeOff, AlertTriangle, Clock,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret_hint: string | null;
  is_active: boolean;
  created_at: string;
  last_fired_at: string | null;
  total_deliveries: number;
  total_failures: number;
  // returned once on creation
  secret?: string;
}

interface Delivery {
  id: string;
  webhook_id: string;
  session_id: string | null;
  event: string;
  status_code: number | null;
  duration_ms: number | null;
  success: boolean;
  attempt: number;
  error: string | null;
  delivered_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
const ALL_EVENTS = ["completed", "failed"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function token(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("rm_access_token") ?? "";
}

function auth() {
  return { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
}

function timeago(iso: string | null): string {
  if (!iso) return "never";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [hooks, setHooks]           = useState<Webhook[]>([]);
  const [loading, setLoading]       = useState(true);
  const [creating, setCreating]     = useState(false);
  const [showForm, setShowForm]     = useState(false);

  // Create form state
  const [formUrl, setFormUrl]       = useState("");
  const [formEvents, setFormEvents] = useState<string[]>(["completed", "failed"]);
  const [formSecret, setFormSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  // Newly created secret — shown once
  const [newSecret, setNewSecret]   = useState<{ id: string; secret: string } | null>(null);

  // Per-webhook delivery log expansion
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});
  const [loadingDel, setLoadingDel] = useState<string | null>(null);

  // Testing state
  const [testing, setTesting]       = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/");
  }, [authLoading, user]);

  useEffect(() => {
    if (user) fetchHooks();
  }, [user]);

  async function fetchHooks() {
    setLoading(true);
    try {
      const r = await fetch(`${BACKEND}/webhooks`, { headers: auth() });
      if (r.ok) {
        const data = await r.json();
        setHooks(data.webhooks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function createHook() {
    if (!formUrl.trim()) return toast.error("URL is required");
    if (formEvents.length === 0) return toast.error("Select at least one event");

    setCreating(true);
    try {
      const r = await fetch(`${BACKEND}/webhooks`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ url: formUrl.trim(), events: formEvents, secret: formSecret || null }),
      });
      if (!r.ok) {
        const err = await r.json();
        toast.error(err.detail ?? "Failed to create webhook");
        return;
      }
      const data = await r.json();
      const created: Webhook = data.webhook;
      setHooks(prev => [created, ...prev]);
      // Show the secret once
      if (created.secret) {
        setNewSecret({ id: created.id, secret: created.secret });
      }
      setFormUrl("");
      setFormEvents(["completed", "failed"]);
      setFormSecret("");
      setShowForm(false);
      toast.success("Webhook registered");
    } finally {
      setCreating(false);
    }
  }

  async function toggleHook(id: string, is_active: boolean) {
    const r = await fetch(`${BACKEND}/webhooks/${id}`, {
      method: "PATCH",
      headers: auth(),
      body: JSON.stringify({ is_active }),
    });
    if (r.ok) {
      setHooks(prev => prev.map(h => h.id === id ? { ...h, is_active } : h));
      toast.success(is_active ? "Webhook resumed" : "Webhook paused");
    } else {
      toast.error("Failed to update webhook");
    }
  }

  async function deleteHook(id: string) {
    if (!confirm("Delete this webhook? This will also remove its delivery history.")) return;
    const r = await fetch(`${BACKEND}/webhooks/${id}`, { method: "DELETE", headers: auth() });
    if (r.ok) {
      setHooks(prev => prev.filter(h => h.id !== id));
      if (expanded === id) setExpanded(null);
      toast.success("Webhook deleted");
    } else {
      toast.error("Failed to delete webhook");
    }
  }

  async function testHook(id: string) {
    setTesting(id);
    try {
      const r = await fetch(`${BACKEND}/webhooks/${id}/test`, { method: "POST", headers: auth() });
      const data = await r.json();
      if (data.success) {
        toast.success(`Test delivered (${data.status_code}) in ${data.duration_ms}ms`);
      } else {
        toast.error(`Test failed: ${data.error ?? `HTTP ${data.status_code}`}`);
      }
    } catch {
      toast.error("Test request failed");
    } finally {
      setTesting(null);
    }
  }

  async function loadDeliveries(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (deliveries[id]) return;
    setLoadingDel(id);
    try {
      const r = await fetch(`${BACKEND}/webhooks/${id}/deliveries`, { headers: auth() });
      if (r.ok) {
        const data = await r.json();
        setDeliveries(prev => ({ ...prev, [id]: data.deliveries ?? [] }));
      }
    } finally {
      setLoadingDel(null);
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
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors text-slate-400"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="p-2 rounded-xl bg-brand-500/15 border border-brand-500/25">
              <WebhookIcon className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Webhooks</h1>
              <p className="text-xs text-slate-500">Get notified when research completes</p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(f => !f); setNewSecret(null); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Webhook
          </button>
        </div>

        {/* One-time secret banner */}
        <AnimatePresence>
          {newSecret && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-300 mb-1">Save your webhook secret</p>
                  <p className="text-xs text-amber-400/80 mb-2">
                    This is shown only once. Copy it now — you won't be able to retrieve it later.
                  </p>
                  <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
                    <code className="text-xs text-amber-200 flex-1 break-all font-mono">
                      {newSecret.secret}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(newSecret.secret);
                        toast.success("Copied");
                      }}
                      className="shrink-0 p-1 rounded hover:bg-white/10 text-amber-400"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setNewSecret(null)}
                  className="text-amber-400/60 hover:text-amber-400 text-lg leading-none"
                >×</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Create form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="glass rounded-xl p-5 border border-white/8">
                <h2 className="text-sm font-semibold text-white mb-4">New Webhook</h2>

                {/* URL */}
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-1 block">Endpoint URL</label>
                  <input
                    type="url"
                    value={formUrl}
                    onChange={e => setFormUrl(e.target.value)}
                    placeholder="https://your-server.com/hooks/researchmind"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                  />
                </div>

                {/* Events */}
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-2 block">Events to receive</label>
                  <div className="flex gap-3">
                    {ALL_EVENTS.map(ev => (
                      <label key={ev} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formEvents.includes(ev)}
                          onChange={e => {
                            setFormEvents(prev =>
                              e.target.checked ? [...prev, ev] : prev.filter(x => x !== ev)
                            );
                          }}
                          className="accent-brand-500"
                        />
                        <span className="text-sm text-slate-300 capitalize">{ev}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Secret */}
                <div className="mb-5">
                  <label className="text-xs text-slate-400 mb-1 block">
                    Signing secret <span className="text-slate-600">(optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showSecret ? "text" : "password"}
                      value={formSecret}
                      onChange={e => setFormSecret(e.target.value)}
                      placeholder="Leave blank to skip HMAC verification"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Deliveries will include <code className="text-slate-500">X-ResearchMind-Signature: sha256=…</code>
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={createHook}
                    disabled={creating}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Register
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-slate-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Webhook list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
          </div>
        ) : hooks.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <WebhookIcon className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium mb-1">No webhooks registered</p>
            <p className="text-xs">Add a webhook to receive real-time events when research completes.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {hooks.map(hook => (
              <div key={hook.id} className="glass rounded-xl border border-white/8 overflow-hidden">
                {/* Webhook header row */}
                <div className="p-4 flex items-start gap-3">
                  {/* Status dot */}
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${hook.is_active ? "bg-emerald-400" : "bg-slate-600"}`} />

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-mono truncate" title={hook.url}>
                      {hook.url}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {hook.events.map(ev => (
                        <span
                          key={ev}
                          className={`text-xs px-2 py-0.5 rounded-full border ${
                            ev === "completed"
                              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                              : "bg-red-500/10 border-red-500/25 text-red-400"
                          }`}
                        >
                          {ev}
                        </span>
                      ))}
                      {hook.secret_hint && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                          signed
                        </span>
                      )}
                      <span className="text-xs text-slate-600">·</span>
                      <span className="text-xs text-slate-500">
                        {hook.total_deliveries} delivered
                        {hook.total_failures > 0 && (
                          <span className="text-red-400"> · {hook.total_failures} failed</span>
                        )}
                      </span>
                      {hook.last_fired_at && (
                        <>
                          <span className="text-xs text-slate-600">·</span>
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {timeago(hook.last_fired_at)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => testHook(hook.id)}
                      disabled={testing === hook.id}
                      title="Send test event"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-50"
                    >
                      {testing === hook.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Zap className="w-3.5 h-3.5" />
                      }
                    </button>
                    <button
                      onClick={() => toggleHook(hook.id, !hook.is_active)}
                      title={hook.is_active ? "Pause" : "Resume"}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      {hook.is_active
                        ? <Pause className="w-3.5 h-3.5" />
                        : <Play  className="w-3.5 h-3.5" />
                      }
                    </button>
                    <button
                      onClick={() => deleteHook(hook.id)}
                      title="Delete"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => loadDeliveries(hook.id)}
                      title="Delivery log"
                      className={`p-1.5 rounded-lg transition-colors ${
                        expanded === hook.id
                          ? "text-brand-400 bg-brand-500/10"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${expanded === hook.id ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Delivery log */}
                <AnimatePresence>
                  {expanded === hook.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-white/6 px-4 py-3">
                        <p className="text-xs text-slate-500 mb-2 font-medium">Recent deliveries</p>

                        {loadingDel === hook.id ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
                          </div>
                        ) : (deliveries[hook.id] ?? []).length === 0 ? (
                          <p className="text-xs text-slate-600 py-2">No deliveries yet.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {(deliveries[hook.id] ?? []).map(d => (
                              <div key={d.id} className="flex items-center gap-3 text-xs">
                                {d.success
                                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  : <XCircle      className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                }
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                  d.event === "completed" ? "bg-emerald-500/10 text-emerald-400"
                                  : d.event === "failed"  ? "bg-red-500/10 text-red-400"
                                  : "bg-white/5 text-slate-400"
                                }`}>{d.event}</span>
                                {d.status_code && (
                                  <span className={`font-mono ${d.success ? "text-slate-400" : "text-red-400"}`}>
                                    {d.status_code}
                                  </span>
                                )}
                                {d.duration_ms != null && (
                                  <span className="text-slate-600">{d.duration_ms}ms</span>
                                )}
                                {d.attempt > 1 && (
                                  <span className="text-amber-500">attempt {d.attempt}</span>
                                )}
                                {d.error && (
                                  <span className="text-red-400 truncate" title={d.error}>
                                    {d.error}
                                  </span>
                                )}
                                <span className="ml-auto text-slate-600 shrink-0">{timeago(d.delivered_at)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}

        {/* Docs callout */}
        <div className="mt-8 p-4 rounded-xl bg-white/[0.02] border border-white/6 text-xs text-slate-500">
          <p className="font-semibold text-slate-400 mb-1">Payload format</p>
          <pre className="text-slate-600 overflow-x-auto">{`{
  "event":       "completed",
  "session_id":  "abc123",
  "timestamp":   "2025-01-01T12:00:00Z",
  "delivery_id": "del_…",
  "data": { "topic": "…", "summary": "…" }
}`}</pre>
        </div>

      </div>
    </div>
  );
}
