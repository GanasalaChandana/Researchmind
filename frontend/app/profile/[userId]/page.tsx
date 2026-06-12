"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Calendar, Star, Tag, Loader2, UserCircle2, Copy, Check } from "lucide-react";
import toast from "react-hot-toast";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

interface PublicSession {
  id: string;
  topic: string;
  created_at: string;
  is_favorite: boolean;
  tags: { name: string; color?: string }[];
}

interface Profile {
  id: string;
  name: string;
  research_count: number;
  joined_at: string;
  sessions: PublicSession[];
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetch(`${BACKEND}/profile/${userId}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [userId]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast.success("Profile link copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-slate-950 bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center dark:bg-slate-950 bg-slate-50 gap-3">
        <UserCircle2 className="w-12 h-12 dark:text-slate-600 text-slate-300" />
        <p className="dark:text-slate-400 text-slate-500">Profile not found</p>
        <button onClick={() => router.push("/")} className="text-sm text-brand-400 hover:underline">Go home</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen dark:bg-slate-950 bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm dark:text-slate-400 text-slate-500 hover:text-brand-400 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Profile header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-6 mb-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500/30 to-violet-500/20 flex items-center justify-center text-2xl font-bold text-brand-400">
                {profile.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl font-bold dark:text-white text-slate-900">{profile.name}</h1>
                <p className="text-sm dark:text-slate-400 text-slate-500 flex items-center gap-1.5 mt-0.5">
                  <Calendar className="w-3.5 h-3.5" /> Joined {timeAgo(profile.joined_at)}
                </p>
              </div>
            </div>
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg dark:bg-white/5 bg-slate-100 dark:text-slate-400 text-slate-500 hover:text-brand-400 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Share"}
            </button>
          </div>

          {/* Stats */}
          <div className="flex gap-6 mt-5 pt-5 border-t dark:border-white/8 border-slate-200">
            <div className="text-center">
              <p className="text-2xl font-bold dark:text-white text-slate-900">{profile.research_count}</p>
              <p className="text-xs dark:text-slate-400 text-slate-500 flex items-center gap-1 justify-center mt-0.5">
                <BookOpen className="w-3 h-3" /> Reports
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold dark:text-white text-slate-900">
                {profile.sessions.filter(s => s.is_favorite).length}
              </p>
              <p className="text-xs dark:text-slate-400 text-slate-500 flex items-center gap-1 justify-center mt-0.5">
                <Star className="w-3 h-3" /> Pinned
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold dark:text-white text-slate-900">
                {[...new Set(profile.sessions.flatMap(s => s.tags.map(t => t.name)))].length}
              </p>
              <p className="text-xs dark:text-slate-400 text-slate-500 flex items-center gap-1 justify-center mt-0.5">
                <Tag className="w-3 h-3" /> Topics
              </p>
            </div>
          </div>
        </motion.div>

        {/* Research sessions */}
        <h2 className="text-sm font-semibold dark:text-slate-400 text-slate-500 uppercase tracking-wide mb-3">
          Recent Research
        </h2>
        {profile.sessions.length === 0 ? (
          <p className="text-sm dark:text-slate-500 text-slate-400 text-center py-8">No public research yet.</p>
        ) : (
          <div className="space-y-3">
            {profile.sessions.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass rounded-xl p-4 hover:border-brand-500/30 transition-colors cursor-pointer"
                onClick={() => router.push(`/research/${s.id}?topic=${encodeURIComponent(s.topic)}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {s.is_favorite && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full mb-1.5">
                        📌 Pinned
                      </span>
                    )}
                    <p className="text-sm font-medium dark:text-slate-200 text-slate-700 line-clamp-2">{s.topic}</p>
                    {s.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {s.tags.slice(0, 4).map(tag => (
                          <span key={tag.name} className="text-[10px] px-2 py-0.5 rounded-full dark:bg-white/5 bg-slate-100 dark:text-slate-400 text-slate-500">
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-xs dark:text-slate-500 text-slate-400 shrink-0">{timeAgo(s.created_at)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
