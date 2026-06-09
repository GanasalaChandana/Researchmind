"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Key, Plus, Trash2, Copy, Check, Eye, EyeOff,
  AlertTriangle, ExternalLink, RefreshCw, Shield,
  Code2, Zap, ChevronDown, ChevronUp,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  request_count: number;
  is_active: boolean;
}

function _authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("rm_access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchKeys(): Promise<ApiKey[]> {
  const res = await fetch("/api/apikeys", { headers: _authHeaders(), cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.keys ?? [];
}

async function createKey(name: string): Promise<{ key: string; id: string; key_prefix: string; name: string; created_at: string } | null> {
  const res = await fetch("/api/apikeys", {
    method: "POST",
    headers: { ...(_authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return null;
  return await res.json();
}

async function deleteKey(id: string): Promise<boolean> {
  const res = await fetch(`/api/apikeys/${id}`, {
    method: "DELETE",
    headers: _authHeaders(),
  });
  return res.ok;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
    </button>
  );
}

const CODE_EXAMPLES = [
  {
    lang: "cURL",
    code: (key: string) => `curl https://your-backend.railway.app/api/v1/research/{session_id}/report \\
  -H "Authorization: Bearer ${key}"`,
  },
  {
    lang: "Python",
    code: (key: string) => `import requests

headers = {"Authorization": "Bearer ${key}"}
r = requests.get(
    "https://your-backend.railway.app/api/v1/research/{session_id}/report",
    headers=headers
)
print(r.json())`,
  },
  {
    lang: "JavaScript",
    code: (key: string) => `const res = await fetch(
  "https://your-backend.railway.app/api/v1/research/{session_id}/report",
  { headers: { Authorization: "Bearer ${key}" } }
);
const data = await res.json();`,
  },
];

export default function DeveloperPage() {
  const { isAuthenticated } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyResult, setNewKeyResult] = useState<{ key: string; name: string } | null>(null);
  const [showKeyValue, setShowKeyValue] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openExample, setOpenExample] = useState<string | null>("cURL");

  const load = useCallback(async () => {
    setLoading(true);
    setKeys(await fetchKeys());
    setLoading(false);
  }, []);

  useEffect(() => { if (isAuthenticated) load(); }, [isAuthenticated, load]);

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    const result = await createKey(newKeyName.trim());
    if (result) {
      setNewKeyResult({ key: result.key, name: result.name });
      setNewKeyName("");
      await load();
    }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await deleteKey(id);
    await load();
    setDeletingId(null);
  }

  const displayKey = newKeyResult?.key ?? "rm_xxxx...";

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-slate-950 bg-slate-50 p-6">
        <div className="text-center">
          <Shield className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold dark:text-white text-slate-900 mb-2">Sign in required</h2>
          <p className="dark:text-slate-400 text-slate-600">You need to be signed in to manage API keys.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen dark:bg-slate-950 bg-slate-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-brand-400" />
            </div>
            <h1 className="text-2xl font-bold dark:text-white text-slate-900">Developer API</h1>
          </div>
          <p className="dark:text-slate-400 text-slate-600 text-sm">
            Access your research programmatically. Rate limit: <strong className="dark:text-slate-200 text-slate-800">100 requests / hour</strong> per key.
          </p>
        </div>

        {/* New key revealed banner */}
        <AnimatePresence>
          {newKeyResult && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5"
            >
              <div className="flex items-start gap-3 mb-3">
                <Check className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-300 text-sm">Key created: <span className="text-white">{newKeyResult.name}</span></p>
                  <p className="text-xs text-emerald-400/80 mt-0.5">Save this key now — it won't be shown again.</p>
                </div>
                <button
                  onClick={() => setNewKeyResult(null)}
                  className="ml-auto text-emerald-400/60 hover:text-emerald-300 text-xs"
                >
                  Dismiss
                </button>
              </div>
              <div className="flex items-center gap-2 bg-black/30 rounded-xl px-4 py-3 font-mono text-sm">
                <span className="flex-1 text-emerald-200 overflow-x-auto whitespace-nowrap">
                  {showKeyValue ? newKeyResult.key : newKeyResult.key.replace(/./g, "•")}
                </span>
                <button
                  onClick={() => setShowKeyValue(v => !v)}
                  className="p-1.5 hover:bg-white/10 rounded-lg"
                  title={showKeyValue ? "Hide" : "Reveal"}
                >
                  {showKeyValue ? <EyeOff className="w-3.5 h-3.5 text-slate-400" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
                </button>
                <CopyButton text={newKeyResult.key} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Create key */}
        <section className="dark:bg-slate-900 bg-white rounded-2xl border dark:border-white/10 border-slate-200 p-6">
          <h2 className="text-sm font-semibold dark:text-slate-200 text-slate-800 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-brand-400" /> Create new key
          </h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder='e.g. "My app", "CI pipeline", "Notebook"'
              className="flex-1 bg-transparent border dark:border-white/10 border-slate-200 rounded-xl px-4 py-2.5 text-sm dark:text-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newKeyName.trim()}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              Generate
            </button>
          </div>
        </section>

        {/* Key list */}
        <section className="dark:bg-slate-900 bg-white rounded-2xl border dark:border-white/10 border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b dark:border-white/10 border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold dark:text-slate-200 text-slate-800 flex items-center gap-2">
              <Key className="w-4 h-4 text-slate-400" />
              Your keys <span className="text-slate-500 font-normal">({keys.length})</span>
            </h2>
            <button onClick={load} className="p-1.5 hover:bg-white/10 rounded-lg" title="Refresh">
              <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
          ) : keys.length === 0 ? (
            <div className="p-8 text-center">
              <Key className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No API keys yet. Create one above.</p>
            </div>
          ) : (
            <ul className="divide-y dark:divide-white/5 divide-slate-100">
              {keys.map(k => (
                <li key={k.id} className="px-6 py-4 flex items-center gap-4 hover:dark:bg-white/[0.02] hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium dark:text-white text-slate-900 truncate">{k.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <code className="text-xs font-mono dark:text-slate-400 text-slate-500">{k.key_prefix}••••</code>
                      <span className="text-xs dark:text-slate-500 text-slate-400">Created {fmtDate(k.created_at)}</span>
                      {k.last_used_at && (
                        <span className="text-xs dark:text-slate-500 text-slate-400">Last used {fmtDate(k.last_used_at)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {k.request_count > 0 && (
                      <span className="text-xs dark:text-slate-400 text-slate-500 flex items-center gap-1">
                        <Zap className="w-3 h-3" />{k.request_count.toLocaleString()} req
                      </span>
                    )}
                    <button
                      onClick={() => handleDelete(k.id)}
                      disabled={deletingId === k.id}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                      title="Revoke"
                    >
                      {deletingId === k.id
                        ? <RefreshCw className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Security notice */}
        <div className="flex gap-3 dark:bg-amber-500/5 bg-amber-50 border dark:border-amber-500/20 border-amber-200 rounded-2xl p-4">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs dark:text-amber-300/80 text-amber-700">
            Keep your API keys secret. Anyone with a key can make requests on your behalf.
            Revoke and regenerate keys if you suspect they have been compromised.
          </p>
        </div>

        {/* API docs */}
        <section className="dark:bg-slate-900 bg-white rounded-2xl border dark:border-white/10 border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b dark:border-white/10 border-slate-100">
            <h2 className="text-sm font-semibold dark:text-slate-200 text-slate-800 flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-slate-400" /> Quick start
            </h2>
          </div>

          {/* Endpoints table */}
          <div className="px-6 py-4 border-b dark:border-white/10 border-slate-100">
            <p className="text-xs font-semibold dark:text-slate-400 text-slate-500 uppercase tracking-wider mb-3">Endpoints</p>
            <table className="w-full text-xs">
              <tbody className="divide-y dark:divide-white/5 divide-slate-100">
                {[
                  ["GET", "/api/v1/research/{id}/status", "Poll research progress"],
                  ["GET", "/api/v1/research/{id}/report", "Fetch completed report"],
                  ["GET", "/api/v1/research/{id}/export/json", "Export as JSON"],
                  ["GET", "/api/v1/info", "Rate-limit status & endpoint list"],
                ].map(([method, path, desc]) => (
                  <tr key={path} className="hover:dark:bg-white/[0.02]">
                    <td className="py-2 pr-3 w-10">
                      <span className={`font-mono font-bold text-xs ${method === "GET" ? "text-emerald-400" : "text-amber-400"}`}>{method}</span>
                    </td>
                    <td className="py-2 pr-4 font-mono dark:text-slate-300 text-slate-700 whitespace-nowrap">{path}</td>
                    <td className="py-2 dark:text-slate-500 text-slate-400">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Code examples */}
          <div className="px-6 py-4 space-y-3">
            <p className="text-xs font-semibold dark:text-slate-400 text-slate-500 uppercase tracking-wider">Code examples</p>
            {CODE_EXAMPLES.map(ex => (
              <div key={ex.lang} className="rounded-xl overflow-hidden border dark:border-white/10 border-slate-200">
                <button
                  onClick={() => setOpenExample(openExample === ex.lang ? null : ex.lang)}
                  className="w-full flex items-center justify-between px-4 py-2.5 dark:bg-slate-800 bg-slate-50 hover:dark:bg-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span className="text-xs font-medium dark:text-slate-300 text-slate-700">{ex.lang}</span>
                  {openExample === ex.lang
                    ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                </button>
                <AnimatePresence>
                  {openExample === ex.lang && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="relative dark:bg-slate-950 bg-slate-900 px-4 py-4">
                        <pre className="text-xs font-mono text-emerald-300 whitespace-pre-wrap break-all leading-relaxed">
                          {ex.code(newKeyResult?.key ?? "<your-api-key>")}
                        </pre>
                        <div className="absolute top-3 right-3">
                          <CopyButton text={ex.code(newKeyResult?.key ?? "<your-api-key>")} />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
