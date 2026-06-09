"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, X, ChevronRight,
  BrainCircuit, Search, FileDown, FolderOpen,
  BookOpen, GitCompare, ArrowRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: BrainCircuit,
    color: "text-brand-400",
    bg: "bg-brand-500/10",
    title: "Multi-Agent Research",
    desc: "Parallel AI agents explore sub-questions simultaneously, then synthesize a structured report.",
  },
  {
    icon: Search,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    title: "Full-Text Search",
    desc: "Search across all your report bodies — not just titles — to find any fact you've researched.",
  },
  {
    icon: FileDown,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    title: "Export Anywhere",
    desc: "Download reports as PDF, Word (DOCX), Markdown, or HTML — ready to share or publish.",
  },
  {
    icon: FolderOpen,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    title: "Organize with Folders",
    desc: "Group research sessions into color-coded collections to keep your work tidy.",
  },
  {
    icon: GitCompare,
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    title: "Compare Sessions",
    desc: "Pick any two completed sessions and see a side-by-side analysis with source overlap and shared concepts.",
  },
  {
    icon: BookOpen,
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    title: "Citation Manager",
    desc: "Auto-generated citations in APA, MLA, or Chicago — copy them all with one click.",
  },
];

const STEPS = [
  { num: 1, text: "Type any research topic in the search box" },
  { num: 2, text: "Set the depth (2–5 sub-questions) and hit Start" },
  { num: 3, text: "Watch AI agents research in real-time and build your report" },
];

interface Props {
  onClose: () => void;
  onSignIn?: () => void;
}

export default function OnboardingModal({ onClose, onSignIn }: Props) {
  const [step, setStep] = useState<"welcome" | "features">("welcome");

  function handleClose() {
    if (typeof window !== "undefined") {
      localStorage.setItem("rm_onboarded", "1");
    }
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg dark:bg-slate-900 bg-white rounded-3xl border dark:border-white/10 border-slate-200 shadow-2xl overflow-hidden"
      >
        {/* Gradient accent top bar */}
        <div className="h-1 w-full bg-gradient-to-r from-brand-500 via-violet-500 to-emerald-500" />

        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg dark:hover:bg-white/10 hover:bg-slate-100 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <AnimatePresence mode="wait">

          {/* ── Step 1: Welcome ───────────────────────────────────────── */}
          {step === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="p-7"
            >
              {/* Logo */}
              <div className="flex flex-col items-center text-center mb-7">
                <div className="w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-brand-500" />
                </div>
                <h2 className="text-2xl font-bold dark:text-white text-slate-900 mb-2">
                  Welcome to ResearchMind
                </h2>
                <p className="dark:text-slate-400 text-slate-600 text-sm leading-relaxed max-w-sm">
                  AI-powered deep research in minutes. Enter any topic and watch multiple agents work in parallel to build a structured, cited report.
                </p>
              </div>

              {/* How it works */}
              <div className="dark:bg-white/5 bg-slate-50 rounded-2xl p-4 mb-6 space-y-3">
                <p className="text-xs font-semibold dark:text-slate-300 text-slate-700 uppercase tracking-wider mb-3">How it works</p>
                {STEPS.map((s, i) => (
                  <div key={s.num} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {s.num}
                    </div>
                    <p className="text-sm dark:text-slate-300 text-slate-700 leading-snug">{s.text}</p>
                    {i < STEPS.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-1 ml-auto" />
                    )}
                  </div>
                ))}
              </div>

              {/* CTAs */}
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => setStep("features")}
                  className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium py-3 rounded-xl transition-colors text-sm"
                >
                  See what's possible <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleClose}
                  className="w-full py-2.5 text-sm dark:text-slate-400 text-slate-600 hover:dark:text-white hover:text-slate-900 transition-colors rounded-xl dark:hover:bg-white/5 hover:bg-slate-50"
                >
                  Skip — take me straight in
                </button>
              </div>

              {/* Sign in nudge */}
              <p className="text-xs text-slate-500 text-center mt-4">
                No account needed to try it.{" "}
                {onSignIn && (
                  <button
                    onClick={() => { handleClose(); onSignIn(); }}
                    className="text-brand-400 hover:text-brand-300 transition-colors underline"
                  >
                    Sign in
                  </button>
                )}
                {onSignIn && " to save & organize your research."}
              </p>
            </motion.div>
          )}

          {/* ── Step 2: Features ──────────────────────────────────────── */}
          {step === "features" && (
            <motion.div
              key="features"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="p-7"
            >
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold dark:text-white text-slate-900 mb-1">Everything you get</h2>
                <p className="text-sm dark:text-slate-400 text-slate-600">All features are free to use</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {FEATURES.map(({ icon: Icon, color, bg, title, desc }) => (
                  <div key={title} className="flex items-start gap-3 dark:bg-white/5 bg-slate-50 rounded-xl p-3.5">
                    <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold dark:text-white text-slate-900 mb-0.5">{title}</p>
                      <p className="text-xs dark:text-slate-400 text-slate-600 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setStep("welcome")}
                  className="flex-1 py-2.5 text-sm dark:text-slate-400 text-slate-600 hover:dark:text-white hover:text-slate-900 transition-colors rounded-xl dark:hover:bg-white/5 hover:bg-slate-50 border dark:border-white/10 border-slate-200"
                >
                  ← Back
                </button>
                <button
                  onClick={handleClose}
                  className="flex-[2] flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
                >
                  Start researching <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
