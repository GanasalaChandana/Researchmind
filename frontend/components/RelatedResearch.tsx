"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Network, ChevronRight, Loader2, GitBranch } from "lucide-react";
import { useRouter } from "next/navigation";

interface RelatedSession {
  id: string;
  topic: string;
  created_at: string;
  shared_count: number;
  shared_entities: string[];
}

function _authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("rm_access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  const hrs  = Math.floor(diff / 3600000);
  const mins = Math.floor(diff / 60000);
  if (days > 0) return `${days}d ago`;
  if (hrs  > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

// Color by entity index — gives each tag a consistent tint
const TAG_COLORS = [
  "bg-brand-500/15 text-brand-300 border-brand-500/25",
  "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  "bg-amber-500/15 text-amber-300 border-amber-500/25",
  "bg-violet-500/15 text-violet-300 border-violet-500/25",
  "bg-rose-500/15 text-rose-300 border-rose-500/25",
  "bg-sky-500/15 text-sky-300 border-sky-500/25",
];

interface Props {
  sessionId: string;
  /** Only fetch once status is "completed" */
  ready: boolean;
}

export default function RelatedResearch({ sessionId, ready }: Props) {
  const router = useRouter();
  const [items, setItems]       = useState<RelatedSession[]>([]);
  const [loading, setLoading]   = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!ready) return;
    const headers = _authHeaders();
    if (!headers["Authorization"]) return; // unauthenticated — skip

    setLoading(true);
    fetch(`/api/research/${sessionId}/related`, { headers, cache: "no-store" })
      .then(r => r.ok ? r.json() : { related: [] })
      .then(data => { setItems(data.related ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId, ready]);

  // Nothing to show yet
  if (!ready || (loading && items.length === 0)) {
    if (loading) {
      return (
        <div className="flex items-center gap-2 text-xs text-slate-600 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Looking for related research…</span>
        </div>
      );
    }
    return null;
  }

  if (!loading && items.length === 0) return null; // no related sessions

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-6"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-2 mb-3 group"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-500/15 border border-brand-500/25 flex items-center justify-center">
            <GitBranch className="w-3.5 h-3.5 text-brand-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">
            Related Research
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400">
            {items.length}
          </span>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="related-list"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2">
              {items.map((item, i) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => router.push(`/research/${item.id}?topic=${encodeURIComponent(item.topic)}`)}
                  className="w-full text-left glass rounded-xl px-4 py-3.5 hover:bg-white/[0.07] transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Topic */}
                      <p className="text-sm font-medium text-slate-200 group-hover:text-white truncate transition-colors">
                        {item.topic}
                      </p>

                      {/* Shared entity chips */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {item.shared_entities.slice(0, 5).map((ent, j) => (
                          <span
                            key={ent}
                            className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${TAG_COLORS[j % TAG_COLORS.length]}`}
                          >
                            <Network className="w-2.5 h-2.5" />
                            {ent}
                          </span>
                        ))}
                        {item.shared_entities.length > 5 && (
                          <span className="text-[10px] text-slate-500">
                            +{item.shared_entities.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Meta: shared count + time */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-semibold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20 whitespace-nowrap">
                        {item.shared_count} shared
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {timeAgo(item.created_at)}
                      </span>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>

            <p className="text-[11px] text-slate-600 mt-3 text-center">
              Sessions linked by shared knowledge-graph entities
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
