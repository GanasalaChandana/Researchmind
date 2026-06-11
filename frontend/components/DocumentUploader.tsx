"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Paperclip, X, FileText, Loader2, AlertCircle } from "lucide-react";
import { uploadDocuments, deleteUploadedDoc, type UploadedDoc } from "@/lib/api";

interface Props {
  docs: UploadedDoc[];
  onChange: (docs: UploadedDoc[]) => void;
}

const ALLOWED_EXT = [".pdf", ".txt", ".md", ".csv"];

function fileIcon(type: string) {
  return <FileText className="w-3.5 h-3.5 shrink-0" />;
}

function humanSize(chars: number) {
  if (chars < 1000) return `${chars} chars`;
  return `${(chars / 1000).toFixed(1)}k chars`;
}

export default function DocumentUploader({ docs, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const list = Array.from(files);
    const invalid = list.filter(f => !ALLOWED_EXT.some(ext => f.name.toLowerCase().endsWith(ext)));
    if (invalid.length) {
      setError(`Unsupported: ${invalid.map(f => f.name).join(", ")}. Use PDF, TXT, MD, or CSV.`);
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadDocuments(list);
      onChange([...docs, ...uploaded]);
    } catch (e: any) {
      setError(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [docs]);

  async function removeDoc(doc: UploadedDoc) {
    try {
      await deleteUploadedDoc(doc.id);
    } catch {}
    onChange(docs.filter(d => d.id !== doc.id));
  }

  return (
    <div className="mt-3">
      {/* Drop zone / attach button */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border cursor-pointer transition-all select-none
          ${dragging
            ? "border-brand-500/60 bg-brand-500/10 dark:bg-brand-500/10"
            : "border-dashed dark:border-white/15 border-slate-300 hover:border-brand-500/40 hover:bg-brand-500/5 dark:hover:bg-white/[0.03]"
          }`}
      >
        {uploading
          ? <Loader2 className="w-4 h-4 text-brand-400 animate-spin shrink-0" />
          : <Paperclip className="w-4 h-4 dark:text-slate-400 text-slate-500 shrink-0" />
        }
        <span className="text-sm dark:text-slate-400 text-slate-500">
          {uploading
            ? "Uploading…"
            : dragging
            ? "Drop files here"
            : docs.length === 0
            ? "Attach documents — PDF, TXT, MD, CSV"
            : "Attach more documents"
          }
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.csv"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1.5 flex items-center gap-2 text-xs text-red-400 px-1"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Uploaded file chips */}
      <AnimatePresence>
        {docs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-2 mt-2"
          >
            {docs.map(doc => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full glass border dark:border-white/10 border-slate-200 text-xs dark:text-slate-300 text-slate-600 max-w-[220px]"
              >
                {fileIcon(doc.file_type)}
                <span className="truncate">{doc.filename}</span>
                <span className="dark:text-slate-500 text-slate-400 shrink-0">
                  {humanSize(doc.char_count)}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); removeDoc(doc); }}
                  className="ml-0.5 dark:text-slate-500 text-slate-400 hover:text-red-400 transition-colors shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
