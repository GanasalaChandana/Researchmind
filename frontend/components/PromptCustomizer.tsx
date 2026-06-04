"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Edit2, Plus, Trash2, X, Settings } from "lucide-react";
import toast from "react-hot-toast";

interface CustomPrompt {
  id: string;
  name: string;
  description: string;
  prompts: string[];
  isDefault: boolean;
}

export default function PromptCustomizer({
  onSelectPrompt,
}: {
  onSelectPrompt: (prompts: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    prompts: ["", "", ""],
  });

  // Load custom prompts from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("rm_custom_prompts");
    if (saved) {
      const parsed = JSON.parse(saved);
      setCustomPrompts(parsed);
      const defaultPrompt = parsed.find((p: CustomPrompt) => p.isDefault);
      if (defaultPrompt) {
        setSelectedId(defaultPrompt.id);
      }
    }
  }, []);

  const handleSave = () => {
    const nonEmptyPrompts = formData.prompts.filter((p) => p.trim());
    if (!formData.name.trim()) {
      toast.error("Prompt set name is required");
      return;
    }
    if (nonEmptyPrompts.length === 0) {
      toast.error("At least one research question is required");
      return;
    }

    let updated: CustomPrompt[];
    if (editingId) {
      updated = customPrompts.map((p) =>
        p.id === editingId
          ? {
              ...p,
              name: formData.name,
              description: formData.description,
              prompts: nonEmptyPrompts,
            }
          : p
      );
      toast.success("Prompt set updated");
    } else {
      const newPrompt: CustomPrompt = {
        id: Date.now().toString(),
        name: formData.name,
        description: formData.description,
        prompts: nonEmptyPrompts,
        isDefault: customPrompts.length === 0,
      };
      updated = [...customPrompts, newPrompt];
      toast.success("Prompt set created");
    }

    setCustomPrompts(updated);
    localStorage.setItem("rm_custom_prompts", JSON.stringify(updated));
    resetForm();
  };

  const handleDelete = (id: string) => {
    const updated = customPrompts.filter((p) => p.id !== id);
    setCustomPrompts(updated);
    localStorage.setItem("rm_custom_prompts", JSON.stringify(updated));
    if (selectedId === id) {
      setSelectedId(updated[0]?.id || null);
    }
    toast.success("Prompt set deleted");
  };

  const handleSetDefault = (id: string) => {
    const updated = customPrompts.map((p) => ({
      ...p,
      isDefault: p.id === id,
    }));
    setCustomPrompts(updated);
    localStorage.setItem("rm_custom_prompts", JSON.stringify(updated));
    setSelectedId(id);
  };

  const handleSelect = (prompt: CustomPrompt) => {
    setSelectedId(prompt.id);
    onSelectPrompt(prompt.prompts);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      name: "",
      description: "",
      prompts: ["", "", ""],
    });
  };

  const startEdit = (prompt: CustomPrompt) => {
    setEditingId(prompt.id);
    setFormData({
      name: prompt.name,
      description: prompt.description,
      prompts: [...prompt.prompts, "", "", ""].slice(0, 5),
    });
  };

  if (customPrompts.length === 0 && !open) {
    return null;
  }

  return (
    <div className="mb-4">
      {/* Quick Select */}
      {customPrompts.length > 0 && !editingId && (
        <div className="flex flex-wrap gap-2 mb-3">
          {customPrompts.map((prompt) => (
            <motion.button
              key={prompt.id}
              onClick={() => handleSelect(prompt)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`text-xs px-3 py-1.5 rounded-full transition-all ${
                selectedId === prompt.id
                  ? "bg-brand-500 text-white border border-brand-400"
                  : "glass text-slate-300 hover:text-white border border-transparent hover:border-brand-500/50"
              }`}
              title={prompt.description}
            >
              {prompt.name}
              {prompt.isDefault && <span className="ml-1">✓</span>}
            </motion.button>
          ))}
          <button
            onClick={() => setOpen(true)}
            className="text-xs px-3 py-1.5 rounded-full glass text-slate-400 hover:text-white transition-colors flex items-center gap-1"
            title="Manage custom prompts"
          >
            <Settings className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Management Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setOpen(false);
              resetForm();
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">
                  {editingId ? "Edit Prompt Set" : "Custom Research Prompts"}
                </h3>
                <button
                  onClick={() => {
                    setOpen(false);
                    resetForm();
                  }}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-sm text-slate-300 block mb-2">
                    Prompt Set Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., Academic Analysis"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-300 block mb-2">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        description: e.target.value,
                      })
                    }
                    placeholder="What is this prompt set for?"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-300 block mb-2">
                    Research Questions
                  </label>
                  <div className="space-y-2">
                    {formData.prompts.map((prompt, i) => (
                      <input
                        key={i}
                        type="text"
                        value={prompt}
                        onChange={(e) => {
                          const newPrompts = [...formData.prompts];
                          newPrompts[i] = e.target.value;
                          setFormData({ ...formData, prompts: newPrompts });
                        }}
                        placeholder={`Question ${i + 1}`}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none transition-colors text-sm"
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Leave blank to skip. Minimum 1 question required.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-medium py-2 rounded-lg transition-colors"
                  >
                    {editingId ? "Update" : "Create"}
                  </button>
                  {editingId && (
                    <button
                      onClick={resetForm}
                      className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Existing Prompts */}
              {customPrompts.length > 0 && !editingId && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-3">
                    Your Prompt Sets
                  </h4>
                  <div className="space-y-2">
                    {customPrompts.map((prompt) => (
                      <div
                        key={prompt.id}
                        className={`p-3 rounded-lg border transition-all ${
                          selectedId === prompt.id
                            ? "bg-brand-500/10 border-brand-500"
                            : "bg-slate-800 border-slate-700 hover:border-slate-600"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h5 className="font-medium text-white">
                                {prompt.name}
                              </h5>
                              {prompt.isDefault && (
                                <span className="text-xs bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded">
                                  Default
                                </span>
                              )}
                            </div>
                            {prompt.description && (
                              <p className="text-xs text-slate-400 mt-1">
                                {prompt.description}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEdit(prompt)}
                              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(prompt.id)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {prompt.prompts.map((p, i) => (
                            <p key={i} className="text-xs text-slate-400">
                              <span className="text-slate-600">Q{i + 1}:</span>{" "}
                              {p}
                            </p>
                          ))}
                        </div>
                        {!prompt.isDefault && (
                          <button
                            onClick={() => handleSetDefault(prompt.id)}
                            className="text-xs text-slate-400 hover:text-brand-400 mt-2 transition-colors"
                          >
                            Set as default
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
