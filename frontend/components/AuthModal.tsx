"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Eye, EyeOff, Loader2, User, Mail, Lock } from "lucide-react";
import { register, login } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";

type Mode = "login" | "register";

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const { setUser } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (mode === "register" && !form.name.trim()) e.name = "Name is required";
    if (!form.email.includes("@")) e.email = "Enter a valid email";
    if (form.password.length < 8) e.password = "Password must be at least 8 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const tokens =
        mode === "register"
          ? await register(form.email, form.password, form.name)
          : await login(form.email, form.password);

      setUser(tokens.user);
      toast.success(mode === "register" ? "Account created! Welcome 🎉" : "Welcome back!");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const field = (
    id: keyof typeof form,
    label: string,
    type: string,
    icon: React.ReactNode
  ) => (
    <div>
      <label className="text-xs dark:text-slate-400 text-slate-600 font-medium block mb-1.5">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 dark:text-slate-500 text-slate-400">
          {icon}
        </span>
        <input
          id={id}
          type={id === "password" ? (showPassword ? "text" : "password") : type}
          value={form[id]}
          onChange={(e) => setForm({ ...form, [id]: e.target.value })}
          placeholder={label}
          className={`w-full pl-9 pr-${id === "password" ? "10" : "4"} py-2.5 rounded-lg text-sm
            dark:bg-white/5 bg-slate-50 dark:border-white/10 border
            dark:text-white text-slate-900 placeholder-slate-400
            focus:outline-none focus:border-brand-500 transition-colors
            ${errors[id] ? "border-red-400" : "border-slate-200 dark:border-white/10"}`}
        />
        {id === "password" && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 dark:text-slate-500 text-slate-400 hover:text-brand-500"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {errors[id] && <p className="text-xs text-red-400 mt-1">{errors[id]}</p>}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        className="dark:bg-slate-900 bg-white border dark:border-slate-700 border-slate-200
                   rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold dark:text-white text-slate-900">
              {mode === "login" ? "Welcome back" : "Create account"}
            </h2>
            <p className="text-xs dark:text-slate-400 text-slate-500 mt-0.5">
              {mode === "login"
                ? "Sign in to access your research history"
                : "Start researching with AI agents"}
            </p>
          </div>
          <button onClick={onClose} className="dark:text-slate-400 text-slate-500 hover:text-red-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && field("name", "Full Name", "text", <User className="w-4 h-4" />)}
          {field("email", "Email", "email", <Mail className="w-4 h-4" />)}
          {field("password", "Password", "password", <Lock className="w-4 h-4" />)}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50
                       text-white font-medium py-2.5 rounded-xl transition-colors
                       flex items-center justify-center gap-2 mt-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {/* Switch mode */}
        <p className="text-center text-sm dark:text-slate-400 text-slate-500 mt-4">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setErrors({}); }}
            className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </motion.div>
    </motion.div>
  );
}
