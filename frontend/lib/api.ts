const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function startResearch(
  topic: string,
  depth = 3,
  customPrompts?: string[]
): Promise<{ session_id: string }> {
  // Use Next.js API proxy to avoid CORS on the POST request
  const payload: any = { topic, depth };
  if (customPrompts && customPrompts.length > 0) {
    payload.custom_prompts = customPrompts;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = typeof window !== "undefined" ? localStorage.getItem("rm_access_token") : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api/research/start`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to start research session");
  return res.json();
}

export function streamResearch(
  sessionId: string,
  topic: string,
  depth = 3,
  customPrompts?: string[]
): EventSource {
  const params = new URLSearchParams({ topic, depth: String(depth) });
  if (customPrompts && customPrompts.length > 0) {
    params.append("custom_prompts", JSON.stringify(customPrompts));
  }
  // Use Next.js API proxy to avoid Vercel SSE buffering issues
  return new EventSource(`/api/research/${sessionId}/stream?${params}`);
}

export async function getReport(sessionId: string) {
  const res = await fetch(`${BACKEND}/research/${sessionId}/report`);
  if (!res.ok) throw new Error("Report not found");
  return res.json();
}

export async function deleteResearch(sessionId: string): Promise<void> {
  await fetch(`/api/research/${sessionId}`, { method: "DELETE" });
}

export async function retryResearch(sessionId: string): Promise<{ session_id: string; topic: string }> {
  const res = await fetch(`/api/research/${sessionId}/retry`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to retry");
  return res.json();
}

export async function toggleFavorite(sessionId: string, isFavorite: boolean): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = typeof window !== "undefined" ? localStorage.getItem("rm_access_token") : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api/research/${sessionId}/favorite`, {
    method: "POST",
    headers,
    body: JSON.stringify({ is_favorite: isFavorite }),
  });
  if (!res.ok) throw new Error("Failed to update favorite");
}

export async function createShareLink(sessionId: string): Promise<{ token: string; share_url: string; expires_at: string }> {
  const headers: Record<string, string> = {};
  const token = typeof window !== "undefined" ? localStorage.getItem("rm_access_token") : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api/research/${sessionId}/share`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error("Failed to create share link");
  const data = await res.json();
  return data;
}

export async function getSharedResearch(shareToken: string) {
  const res = await fetch(`${BACKEND}/research/shared/${shareToken}`);
  if (!res.ok) throw new Error("Share link expired or invalid");
  return res.json();
}

export async function addTag(sessionId: string, tagName: string, color?: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = typeof window !== "undefined" ? localStorage.getItem("rm_access_token") : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const params = new URLSearchParams({ tag_name: tagName });
  if (color) params.append("color", color);

  const res = await fetch(`/api/research/${sessionId}/tags?${params}`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error("Failed to add tag");
}

export async function removeTag(sessionId: string, tagName: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = typeof window !== "undefined" ? localStorage.getItem("rm_access_token") : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api/research/${sessionId}/tags?tag_name=${encodeURIComponent(tagName)}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error("Failed to remove tag");
}

export async function getUserTags(): Promise<string[]> {
  const headers: Record<string, string> = {};
  const token = typeof window !== "undefined" ? localStorage.getItem("rm_access_token") : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api/research/tags`, { headers });
  if (!res.ok) return [];
  const data = await res.json();
  return data.tags || [];
}

export async function getDashboardStats(): Promise<any> {
  const headers: Record<string, string> = {};
  const token = typeof window !== "undefined" ? localStorage.getItem("rm_access_token") : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api/research/dashboard`, { headers });
  if (!res.ok) throw new Error("Failed to fetch dashboard stats");
  const data = await res.json();
  return data.data || {};
}
