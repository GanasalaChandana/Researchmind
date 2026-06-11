"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Send, Loader2, Trash2, ChevronDown } from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

interface Comment {
  id: string;
  author_name: string;
  content: string;
  created_at: string;
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

export default function ReportComments({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!open || !BACKEND) return;
    setLoading(true);
    fetch(`${BACKEND}/research/${sessionId}/comments`)
      .then(r => r.json())
      .then(d => setComments(d.comments ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, sessionId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND}/research/${sessionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_name: author.trim() || "Anonymous",
          content: content.trim(),
        }),
      });
      if (res.ok) {
        const c = await res.json();
        setComments(prev => [...prev, c]);
        setContent("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 glass rounded-xl hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25">
            <MessageCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold dark:text-white text-slate-900">Comments</p>
            <p className="text-xs text-slate-500">Leave a note on this shared report</p>
          </div>
          {comments.length > 0 && (
            <span className="text-xs text-slate-500 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
              {comments.length}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="glass rounded-b-xl border-t border-white/5 p-4 space-y-4">
              {/* Comment list */}
              {loading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-3">No comments yet — be the first!</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {comments.map(c => (
                    <div key={c.id} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">
                        {c.author_name[0]?.toUpperCase() ?? "A"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold dark:text-slate-200 text-slate-800">{c.author_name}</span>
                          <span className="text-[10px] text-slate-500">{timeAgo(c.created_at)}</span>
                        </div>
                        <p className="text-xs dark:text-slate-300 text-slate-700 mt-0.5 leading-relaxed">{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Post form */}
              <form onSubmit={submit} className="space-y-2 border-t dark:border-white/8 border-slate-200 pt-3">
                <input
                  type="text"
                  value={author}
                  onChange={e => setAuthor(e.target.value)}
                  placeholder="Your name (optional)"
                  maxLength={80}
                  className="w-full dark:bg-white/5 bg-slate-50 border dark:border-white/10 border-slate-200 rounded-lg px-3 py-2 text-xs dark:text-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                />
                <div className="flex gap-2">
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Write a comment…"
                    rows={2}
                    maxLength={2000}
                    className="flex-1 dark:bg-white/5 bg-slate-50 border dark:border-white/10 border-slate-200 rounded-lg px-3 py-2 text-xs dark:text-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={!content.trim() || submitting}
                    className="shrink-0 w-9 h-9 self-end flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 transition-colors"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
