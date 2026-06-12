"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { saveTokens } from "@/lib/auth";
import toast from "react-hot-toast";
import {
  User, Lock, Trash2, ArrowLeft, Loader2, Check, Eye, EyeOff, ExternalLink,
} from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

function token() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("rm_access_token") ?? "";
}
function authHeaders() {
  return { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
}

// ─── Profile section ──────────────────────────────────────────────────────────

function ProfileSection({ user, setUser }: { user: any; setUser: (u: any) => void }) {
  const [name, setName]       = useState(user?.name ?? "");
  const [email, setEmail]     = useState(user?.email ?? "");
  const [saving, setSaving]   = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() && !email.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND}/me`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ name: name.trim() || undefined, email: email.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Update failed");
      }
      const updated = await res.json();
      setUser(updated);
      // Persist updated user in localStorage
      const stored = localStorage.getItem("rm_user");
      if (stored) localStorage.setItem("rm_user", JSON.stringify({ ...JSON.parse(stored), ...updated }));
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err.message ?? "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass rounded-xl p-6">
      <h2 className="text-base font-semibold dark:text-white text-slate-900 mb-4 flex items-center gap-2">
        <User className="w-4 h-4 text-brand-400" /> Profile
      </h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-medium dark:text-slate-400 text-slate-500 mb-1">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm dark:bg-slate-800 bg-white border dark:border-slate-700 border-slate-200 dark:text-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium dark:text-slate-400 text-slate-500 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm dark:bg-slate-800 bg-white border dark:border-slate-700 border-slate-200 dark:text-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-medium transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

// ─── Password section ─────────────────────────────────────────────────────────

function PasswordSection({ isOAuthUser }: { isOAuthUser: boolean }) {
  const [current, setCurrent]   = useState("");
  const [next, setNext]         = useState("");
  const [confirm, setConfirm]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [showCur, setShowCur]   = useState(false);
  const [showNew, setShowNew]   = useState(false);

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { toast.error("Passwords don't match"); return; }
    if (next.length < 8)  { toast.error("Password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND}/change-password`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to change password");
      }
      toast.success("Password changed successfully");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  if (isOAuthUser) {
    return (
      <div className="glass rounded-xl p-6">
        <h2 className="text-base font-semibold dark:text-white text-slate-900 mb-2 flex items-center gap-2">
          <Lock className="w-4 h-4 text-brand-400" /> Password
        </h2>
        <p className="text-sm dark:text-slate-400 text-slate-500">
          You signed in with Google or GitHub — password login is not available for your account.
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-6">
      <h2 className="text-base font-semibold dark:text-white text-slate-900 mb-4 flex items-center gap-2">
        <Lock className="w-4 h-4 text-brand-400" /> Change Password
      </h2>
      <form onSubmit={handleChange} className="space-y-4">
        <div>
          <label className="block text-xs font-medium dark:text-slate-400 text-slate-500 mb-1">Current password</label>
          <div className="relative">
            <input
              type={showCur ? "text" : "password"}
              value={current}
              onChange={e => setCurrent(e.target.value)}
              required
              className="w-full px-3 py-2 pr-9 rounded-lg text-sm dark:bg-slate-800 bg-white border dark:border-slate-700 border-slate-200 dark:text-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button type="button" onClick={() => setShowCur(v => !v)} className="absolute right-2.5 top-2.5 dark:text-slate-400 text-slate-500">
              {showCur ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium dark:text-slate-400 text-slate-500 mb-1">New password</label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              value={next}
              onChange={e => setNext(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 pr-9 rounded-lg text-sm dark:bg-slate-800 bg-white border dark:border-slate-700 border-slate-200 dark:text-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-2.5 top-2.5 dark:text-slate-400 text-slate-500">
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium dark:text-slate-400 text-slate-500 mb-1">Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg text-sm dark:bg-slate-800 bg-white border dark:border-slate-700 border-slate-200 dark:text-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-medium transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          {saving ? "Changing…" : "Change password"}
        </button>
      </form>
    </div>
  );
}

// ─── Danger zone ──────────────────────────────────────────────────────────────

function DangerZone({ onDeleted }: { onDeleted: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleDelete() {
    if (confirm !== "DELETE") { toast.error('Type DELETE to confirm'); return; }
    setDeleting(true);
    try {
      const res = await fetch(`${BACKEND}/me`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to delete account");
      toast.success("Account deleted");
      onDeleted();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="glass rounded-xl p-6 border border-red-500/30">
      <h2 className="text-base font-semibold text-red-400 mb-2 flex items-center gap-2">
        <Trash2 className="w-4 h-4" /> Danger Zone
      </h2>
      <p className="text-sm dark:text-slate-400 text-slate-500 mb-4">
        Permanently delete your account and all associated data. This cannot be undone.
      </p>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors"
        >
          Delete my account
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium dark:text-slate-300 text-slate-700">
            Type <span className="font-mono font-bold text-red-400">DELETE</span> to confirm:
          </p>
          <input
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="DELETE"
            className="w-full px-3 py-2 rounded-lg text-sm dark:bg-slate-800 bg-white border border-red-500/50 dark:text-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting || confirm !== "DELETE"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
            <button
              onClick={() => { setOpen(false); setConfirm(""); }}
              className="px-4 py-2 rounded-lg dark:bg-slate-800 bg-slate-100 dark:text-slate-300 text-slate-700 text-sm font-medium transition-colors hover:opacity-80"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, setUser, signOut } = useAuth();
  const router = useRouter();

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-slate-950 bg-slate-50">
        <p className="dark:text-slate-400 text-slate-500 text-sm">Please sign in to access settings.</p>
      </div>
    );
  }

  const isOAuthUser = !user.email?.includes("@") === false &&
    (user as any).provider !== undefined;

  function handleDeleted() {
    signOut();
    router.replace("/");
  }

  return (
    <div className="min-h-screen dark:bg-slate-950 bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg dark:hover:bg-slate-800 hover:bg-slate-200 transition-colors dark:text-slate-400 text-slate-500"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold dark:text-white text-slate-900">Account Settings</h1>
            <p className="text-sm dark:text-slate-400 text-slate-500">{user.email}</p>
          </div>
        </div>

        <div className="space-y-6">
          <ProfileSection user={user} setUser={setUser} />

          {/* Public profile link */}
          <div className="glass rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium dark:text-white text-slate-900">Public Profile</p>
              <p className="text-xs dark:text-slate-400 text-slate-500 mt-0.5">Share your research portfolio with others</p>
            </div>
            <button
              onClick={() => router.push(`/profile/${user.id}`)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg dark:bg-white/5 bg-slate-100 dark:text-slate-300 text-slate-600 hover:text-brand-400 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> View
            </button>
          </div>

          <PasswordSection isOAuthUser={isOAuthUser} />
          <DangerZone onDeleted={handleDeleted} />
        </div>
      </div>
    </div>
  );
}
