"use client";
import { ResearchReport } from "@/lib/types";
import { ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

export default function ReportViewer({ report }: { report: ResearchReport }) {
  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="glass rounded-xl p-6 border-l-4 border-brand-500">
        <h2 className="text-lg font-semibold text-white mb-2">Executive Summary</h2>
        <p className="text-slate-300 leading-relaxed">{report.summary}</p>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {report.sections.map((section, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass rounded-xl p-6"
          >
            <h3 className="text-base font-semibold text-white mb-3">{section.heading}</h3>
            <p className="text-slate-300 leading-relaxed text-sm whitespace-pre-wrap">{section.content}</p>
            {section.citations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {section.citations.map((c) => (
                  <a
                    key={c}
                    href={report.sources[c - 1]?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded-full hover:bg-brand-500/30 transition-colors"
                  >
                    [{c}] <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Sources */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Sources</h2>
        <div className="space-y-3">
          {report.sources.map((source, i) => (
            <div key={i} className="glass rounded-lg p-4 flex gap-4">
              <span className="text-brand-400 font-mono text-sm shrink-0 mt-0.5">[{i + 1}]</span>
              <div className="min-w-0">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-400 hover:text-blue-300 truncate block"
                >
                  {source.title || source.url}
                </a>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{source.summary}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
