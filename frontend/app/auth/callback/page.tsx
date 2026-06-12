"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveTokens } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useAuth();

  useEffect(() => {
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const userRaw = params.get("user");
    const oauthError = params.get("oauth_error");

    if (oauthError) {
      toast.error(`Sign-in failed: ${oauthError.replace(/\+/g, " ")}`);
      router.replace("/");
      return;
    }

    if (!accessToken || !refreshToken || !userRaw) {
      toast.error("Invalid auth response");
      router.replace("/");
      return;
    }

    try {
      const user = JSON.parse(userRaw);
      saveTokens({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 86400,
        user,
      });
      setUser(user);
      toast.success(`Welcome, ${user.name}!`);
    } catch {
      toast.error("Failed to parse auth response");
    }

    router.replace("/");
  }, [params, router, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center dark:bg-slate-950 bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        <p className="text-sm dark:text-slate-400 text-slate-600">Signing you in…</p>
      </div>
    </div>
  );
}
