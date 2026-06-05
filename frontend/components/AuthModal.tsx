"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X, Eye, EyeOff, Loader2, User, Mail, Lock, KeyRound, ArrowLeft } from "lucide-react";
import { register, login, forgotPassword, resetPassword } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";

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
