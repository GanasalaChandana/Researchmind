"use client";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 dark:bg-slate-950 bg-slate-50">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
        </div>

        <h1 className="text-2xl font-bold dark:text-white text-slate-900 mb-2">Something went wrong</h1>
        <p className="dark:text-slate-400 text-slate-500 text-sm mb-8">
          An unexpected error occurred. Try refreshing — if it keeps happening, please report it.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <a
            href="/"
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl dark:bg-white/5 bg-slate-100 dark:hover:bg-white/10 hover:bg-slate-200 dark:text-slate-300 text-slate-700 font-medium text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </a>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs dark:text-slate-600 text-slate-400 font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
