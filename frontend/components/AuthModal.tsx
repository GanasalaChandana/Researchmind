"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X, Eye, EyeOff, Loader2, User, Mail, Lock, KeyRound, ArrowLeft } from "lucide-react";
import { register, login, forgotPassword, resetPassword } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type Mode = "login" | "register" | "forgot" | "reset";

export default function AuthModal({
  onClose,
  initialMode = "login",
  initialToken = "",
}: {
  onClose: () => void;
  initialMode?: Mode;
  initialToken?: string;
}) {
  const { setUser } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({ name: "", email: "", password: "", token: initialToken });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (mode === "register" && !form.name.trim()) e.name = "Name is required";
    if (mode !== "reset" && !form.email.includes("@")) e.email = "Enter a valid email";
    if (mode === "reset" && !form.token.trim()) e.token = "Reset code is required";
    if ((mode === "login" || mode === "register" || mode === "reset") && form.password.length < 8)
      e.password = "Password must be at least 8 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      if (mode === "register" || mode === "login") {
        const tokens =
          mode === "register"
            ? await register(form.email, form.password, form.name)
            : await login(form.email, form.password);
        setUser(tokens.user);
        toast.success(mode === "register" ? "Account created! Welcome 🎉" : "Welcome back!");
        onClose();
      } else if (mode === "forgot") {
        const res = await forgotPassword(form.email);
        // Backend returns the reset token directly until email delivery is wired up.
        if (res.reset_token) {
          setForm((f) => ({ ...f, token: res.reset_token!, password: "" }));
          setMode("reset");
          toast.success("Reset code generated — set your new password");
        } else {
          toast.success(res.message || "If that email exists, a reset link was sent");
          setMode("login");
        }
      } else if (mode === "reset") {
        await resetPassword(form.token, form.password);
        toast.success("Password reset! You can now sign in.");
        setForm((f) => ({ ...f, password: "", token: "" }));
        setMode("login");
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const titles: Record<Mode, { title: string; subtitle: string }> = {
    login: { title: "Welcome back", subtitle: "Sign in to access your research history" },
    register: { title: "Create account", subtitle: "Start researching with AI agents" },
    forgot: { title: "Reset password", subtitle: "Enter your email to get a reset code" },
    reset: { title: "Set new password", subtitle: "Enter the reset code and your new password" },
  };

  const submitLabel: Record<Mode, string> = {
    login: "Sign In",
    register: "Create Account",
    forgot: "Send Reset Code",
    reset: "Reset Password",
  };

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
          <div className="flex items-center gap-2">
            {(mode === "forgot" || mode === "reset") && (
              <button
                onClick={() => { setMode("login"); setErrors({}); }}
                className="dark:text-slate-400 text-slate-500 hover:text-brand-500 transition-colors"
                aria-label="Back to sign in"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h2 className="text-lg font-bold dark:text-white text-slate-900">
                {titles[mode].title}
              </h2>
              <p className="text-xs dark:text-slate-400 text-slate-500 mt-0.5">
                {titles[mode].subtitle}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="dark:text-slate-400 text-slate-500 hover:text-red-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* OAuth buttons — only on login/register */}
        {(mode === "login" || mode === "register") && (
          <div className="space-y-2 mb-4">
            <button
              type="button"
              onClick={() => { window.location.href = `${BACKEND}/auth/oauth/google`; }}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl
                         border dark:border-white/10 border-slate-200
                         dark:bg-white/5 bg-slate-50 dark:hover:bg-white/10 hover:bg-slate-100
                         dark:text-white text-slate-800 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = `${BACKEND}/auth/oauth/github`; }}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl
                         border dark:border-white/10 border-slate-200
                         dark:bg-white/5 bg-slate-50 dark:hover:bg-white/10 hover:bg-slate-100
                         dark:text-white text-slate-800 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
              Continue with GitHub
            </button>
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px dark:bg-white/10 bg-slate-200" />
              <span className="text-xs dark:text-slate-500 text-slate-400">or</span>
              <div className="flex-1 h-px dark:bg-white/10 bg-slate-200" />
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && field("name", "Full Name", "text", <User className="w-4 h-4" />)}
          {mode !== "reset" && field("email", "Email", "email", <Mail className="w-4 h-4" />)}
          {mode === "reset" && field("token", "Reset Code", "text", <KeyRound className="w-4 h-4" />)}
          {mode !== "forgot" && field("password", mode === "reset" ? "New Password" : "Password", "password", <Lock className="w-4 h-4" />)}

          {/* Forgot password link (login only) */}
          {mode === "login" && (
            <div className="flex justify-end -mt-1">
              <button
                type="button"
                onClick={() => { setMode("forgot"); setErrors({}); }}
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50
                       text-white font-medium py-2.5 rounded-xl transition-colors
                       flex items-center justify-center gap-2 mt-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitLabel[mode]}
          </button>
        </form>

        {/* Switch mode (login/register only) */}
        {(mode === "login" || mode === "register") && (
          <p className="text-center text-sm dark:text-slate-400 text-slate-500 mt-4">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setErrors({}); }}
              className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
