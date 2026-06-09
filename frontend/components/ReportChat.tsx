"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, Send, ChevronDown,
  Bot, User, Loader2, Sparkles, RotateCcw,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface Props {
  sessionId: string;
  topic: string;
  ready: boolean;          // only render when research is completed
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

const STARTER_QUESTIONS = [
  "What are the key takeaways?",
  "What are the main challenges identified?",
  "How do the sources compare?",
  "What are the future implications?",
];

// ─── Helper ──────────────────────────────────────────────────────────────────

function token(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("rm_access_token") ?? "";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReportChat({ sessionId, topic, ready }: Props) {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [streaming, setStreaming] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // ── Load persisted history when panel opens ───────────────────────────────
  useEffect(() => {
    if (!open || !ready || historyLoaded || !BACKEND) return;
    const tk = token();
    if (!tk) return;

    fetch(`${BACKEND}/research/${sessionId}/chat/history`, {
      headers: { Authorization: `Bearer ${tk}` },
      cache: "no-store",
    })
      .then(r => (r.ok ? r.json() : { messages: [] }))
      .then(data => {
        const loaded: Message[] = (data.messages ?? []).map((m: any) => ({
          id:      m.id,
          role:    m.role as "user" | "assistant",
          content: m.content,
        }));
        setMessages(loaded);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
  }, [open, ready, sessionId, historyLoaded]);

  // ── Auto-scroll on new content ────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Focus input when panel opens ─────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  // ── Submit a question ─────────────────────────────────────────────────────
  async function submit(question: string) {
    const q = question.trim();
    if (!q || streaming || !BACKEND) return;

    const tk = token();
    if (!tk) return;

    const userMsgId = `u_${Date.now()}`;
    const asstMsgId = `a_${Date.now()}`;

    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: "user",      content: q },
      { id: asstMsgId, role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch(`${BACKEND}/research/${sessionId}/chat`, {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${tk}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: q }),
      });

      if (!res.ok || !res.body) {
        setMessages(prev =>
          prev.map(m =>
            m.id === asstMsgId
              ? { ...m, content: "Failed to get a response. Please try again.", streaming: false }
              : m
          )
        );
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "chunk" && data.text) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === asstMsgId
                    ? { ...m, content: m.content + data.text }
                    : m
                )
              );
            } else if (data.type === "done") {
              setMessages(prev =>
                prev.map(m =>
                  m.id === asstMsgId ? { ...m, streaming: false } : m
                )
              );
            }
          } catch {}
        }
      }
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === asstMsgId
            ? { ...m, content: "Connection error. Please try again.", streaming: false }
            : m
        )
      );
    } finally {
      setStreaming(false);
      // Ensure streaming flag is cleared even if 'done' event was missed
      setMessages(prev =>
        prev.map(m => (m.streaming ? { ...m, streaming: false } : m))
      );
    }
  }

  async function clearHistory() {
    const tk = token();
    if (tk && BACKEND) {
      // Delete from DB so history doesn't reload on refresh
      fetch(`${BACKEND}/research/${sessionId}/chat/history`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tk}` },
      }).catch(() => {});
    }
    setMessages([]);
    // Keep historyLoaded = true so the useEffect doesn't immediately
    // re-fetch from DB and undo the clear
  }

  if (!ready) return null;

  return (
    <div className="mt-6">
      {/* ── Toggle header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 glass rounded-xl hover:bg-white/[0.04] transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-brand-500/15 border border-brand-500/25">
            <MessageSquare className="w-4 h-4 text-brand-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">Chat with this Report</p>
            <p className="text-xs text-slate-500">
              Ask follow-up questions — answered from the research
            </p>
          </div>
          {messages.length > 0 && (
            <span className="text-xs text-slate-500 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
              {messages.length} msg{messages.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* ── Collapsible body ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="glass rounded-b-xl border-t border-white/5">

              {/* Messages area */}
              <div className="h-96 overflow-y-auto p-4 space-y-4 scroll-smooth">

                {/* Empty state */}
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-4">
                    <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/15">
                      <Sparkles className="w-6 h-6 text-brand-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white mb-1">
                        Ask anything about this research
                      </p>
                      <p className="text-xs text-slate-500 max-w-xs">
                        Answers are grounded in the report — no hallucinations about things not in the research
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {STARTER_QUESTIONS.map(q => (
                        <button
                          key={q}
                          onClick={() => submit(q)}
                          disabled={streaming}
                          className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message list */}
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    {/* Avatar */}
                    <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                      msg.role === "user"
                        ? "bg-brand-500/20 border border-brand-500/30"
                        : "bg-slate-800 border border-white/10"
                    }`}>
                      {msg.role === "user"
                        ? <User className="w-3.5 h-3.5 text-brand-400" />
                        : <Bot  className="w-3.5 h-3.5 text-slate-300" />
                      }
                    </div>

                    {/* Bubble */}
                    <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-brand-500/15 border border-brand-500/20 text-white rounded-tr-sm"
                        : "bg-white/[0.04] border border-white/8 text-slate-200 rounded-tl-sm"
                    }`}>
                      {msg.content || (
                        msg.streaming && (
                          <span className="flex items-center gap-1.5 text-slate-500 text-xs">
                            <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                          </span>
                        )
                      )}
                      {msg.streaming && msg.content && (
                        <span className="inline-block w-0.5 h-4 bg-brand-400 ml-0.5 animate-pulse align-middle rounded-full" />
                      )}
                    </div>
                  </div>
                ))}

                <div ref={bottomRef} />
              </div>

              {/* ── Input row ── */}
              <div className="border-t border-white/8 p-3 flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    onClick={clearHistory}
                    disabled={streaming}
                    title="Clear chat"
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}

                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit(input);
                    }
                  }}
                  placeholder="Ask a follow-up question…"
                  disabled={streaming}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50 disabled:opacity-50 transition-shadow"
                />

                <button
                  onClick={() => submit(input)}
                  disabled={!input.trim() || streaming}
                  className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Send"
                >
                  {streaming
                    ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                    : <Send    className="w-4 h-4 text-white" />
                  }
                </button>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
