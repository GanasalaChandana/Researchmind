/**
 * Client-side auth helpers — store tokens in localStorage,
 * expose typed API calls, and provide a React context hook.
 */

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  research_count: number;
  monthly_count?: number;
  api_key?: string;
}

interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

// ── Storage ──────────────────────────────────────────────────────────────────

export function saveTokens(tokens: AuthTokens) {
  // Clear previous user's session history before saving new user
  const prevUser = getSavedUser();
  if (prevUser && prevUser.id !== tokens.user.id) {
    localStorage.removeItem("rm_sessions");
  }
  localStorage.setItem("rm_access_token", tokens.access_token);
  localStorage.setItem("rm_refresh_token", tokens.refresh_token);
  localStorage.setItem("rm_user", JSON.stringify(tokens.user));
}

export function clearTokens() {
  localStorage.removeItem("rm_access_token");
  localStorage.removeItem("rm_refresh_token");
  localStorage.removeItem("rm_user");
  localStorage.removeItem("rm_sessions"); // Clear session history on logout
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("rm_access_token");
}

export function getSavedUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("rm_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function authFetch(path: string, options: RequestInit = {}) {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api/auth/${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.detail || data.message || "Request failed");
  }
  return data;
}

export async function register(email: string, password: string, name: string): Promise<AuthTokens> {
  const data = await authFetch("register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
  saveTokens(data);
  return data;
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const data = await authFetch("login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  saveTokens(data);
  return data;
}

export async function logout(refreshToken: string) {
  try {
    await authFetch("logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } finally {
    clearTokens();
  }
}

export async function getMe(): Promise<User> {
  return authFetch("me");
}

export async function updateMe(fields: { name?: string; email?: string }): Promise<User> {
  return authFetch("me", { method: "PATCH", body: JSON.stringify(fields) });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return authFetch("change-password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export async function forgotPassword(email: string): Promise<{ message: string; reset_token?: string }> {
  return authFetch("forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string) {
  return authFetch("reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}
