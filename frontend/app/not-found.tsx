"use client";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  const router = useRouter();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 dark:bg-slate-950 bg-slate-50">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-brand-500/30 blur-xl scale-150" />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center shadow-xl">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          </div>
        </div>

        <p className="text-7xl font-black dark:text-slate-700 text-slate-200 mb-4 select-none">404</p>
        <h1 className="text-2xl font-bold dark:text-white text-slate-900 mb-2">Page not found</h1>
        <p className="dark:text-slate-400 text-slate-500 text-sm mb-8">
          This page doesn&apos;t exist. Maybe the research went too deep into the rabbit hole.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => router.push("/")}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </button>
          <button
            onClick={() => router.push("/")}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl dark:bg-white/5 bg-slate-100 dark:hover:bg-white/10 hover:bg-slate-200 dark:text-slate-300 text-slate-700 font-medium text-sm transition-colors"
          >
            <Search className="w-4 h-4" />
            Start researching
          </button>
        </div>
      </div>
    </div>
  );
}
