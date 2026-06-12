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
  customPrompts?: string[],
  language?: string,
  docIds?: string[],
  modelTier?: string,
): EventSource {
  const params = new URLSearchParams({ topic, depth: String(depth) });
  if (customPrompts && customPrompts.length > 0) {
    params.append("custom_prompts", JSON.stringify(customPrompts));
  }
  if (language && language !== "English") {
    params.append("language", language);
  }
  if (docIds && docIds.length > 0) {
    params.append("doc_ids", docIds.join(","));
  }
  if (modelTier && modelTier !== "balanced") {
    params.append("model_tier", modelTier);
  }
  // Use Next.js API proxy to avoid Vercel SSE buffering issues
  return new EventSource(`/api/research/${sessionId}/stream?${params}`);
}

export interface UploadedDoc {
  id: string;
  filename: string;
  file_type: string;
  char_count: number;
  created_at: string;
}

export async function uploadDocuments(files: File[]): Promise<UploadedDoc[]> {
  const token = typeof window !== "undefined" ? localStorage.getItem("rm_access_token") : null;
  if (!token) throw new Error("Not authenticated");
  const form = new FormData();
  for (const f of files) form.append("files", f);
  const res = await fetch(`${BACKEND}/documents/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Upload failed");
  }
  const data = await res.json();
  return data.documents ?? [];
}

export async function deleteUploadedDoc(docId: string): Promise<void> {
  const token = typeof window !== "undefined" ? localStorage.getItem("rm_access_token") : null;
  if (!token) throw new Error("Not authenticated");
  await fetch(`${BACKEND}/documents/${docId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
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

// ─── Collections ─────────────────────────────────────────────────────────────

export interface Collection {
  id: string;
  name: string;
  description?: string;
  color: string;
  session_count: number;
  created_at: string;
}

function _authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("rm_access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listCollections(): Promise<Collection[]> {
  const res = await fetch("/api/collections", {
    headers: _authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.collections ?? [];
}

export async function createCollection(
  name: string,
  color = "indigo"
): Promise<Collection | null> {
  const res = await fetch("/api/collections", {
    method: "POST",
    headers: { ..._authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function deleteCollection(id: string): Promise<void> {
  await fetch(`/api/collections/${id}`, {
    method: "DELETE",
    headers: _authHeaders(),
  });
}

export async function moveSessionToCollection(
  sessionId: string,
  collectionId: string | null
): Promise<void> {
  await fetch(`/api/research/${sessionId}/collection`, {
    method: "PUT",
    headers: { ..._authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ collection_id: collectionId }),
  });
}

// ─── Full-text content search ─────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  topic: string;
  status: string;
  created_at: string;
  snippet: string;
  match_in: string;
  tags?: string[];
  collection_id?: string | null;
}

export async function searchReportContent(query: string): Promise<SearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  const headers = _authHeaders();
  try {
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(query.trim())}`,
      { headers, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

// ─── Refresh / re-run ────────────────────────────────────────────────────────

export async function refreshResearch(sessionId: string): Promise<{ new_session_id: string }> {
  const res = await fetch(`/api/research/${sessionId}/refresh`, {
    method: "POST",
    headers: _authHeaders(),
  });
  if (!res.ok) throw new Error("Refresh failed");
  return res.json();
}

// ─── Backend comparison ───────────────────────────────────────────────────────

export interface CompareResult {
  overall_similarity: number;
  verdict: string;
  summaries?: { agreement: string[]; contradiction: string[] };
  sections?: { heading: string; similarity: number }[];
  sources?: { shared: string[]; only_a: string[]; only_b: string[] };
  entities?: { shared: string[]; only_a: string[]; only_b: string[] };
}

export async function compareResearchSessions(idA: string, idB: string): Promise<CompareResult | null> {
  try {
    const res = await fetch(`/api/research/compare?a=${idA}&b=${idB}`, {
      headers: _authHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Bulk operations ──────────────────────────────────────────────────────────

export async function bulkDeleteSessions(sessionIds: string[]): Promise<{ deleted: number }> {
  const res = await fetch("/api/research/bulk/delete", {
    method: "POST",
    headers: { ..._authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ session_ids: sessionIds }),
  });
  if (!res.ok) throw new Error("Bulk delete failed");
  return res.json();
}

export async function bulkTagSessions(sessionIds: string[], tags: string[]): Promise<{ updated: number }> {
  const res = await fetch("/api/research/bulk/tag", {
    method: "POST",
    headers: { ..._authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ session_ids: sessionIds, tags }),
  });
  if (!res.ok) throw new Error("Bulk tag failed");
  return res.json();
}

// ─── Report versioning ────────────────────────────────────────────────────────

export interface ReportVersion {
  version: number;
  created_at: string;
  session_id: string;
}

export async function getReportVersions(sessionId: string): Promise<ReportVersion[]> {
  const res = await fetch(`/api/research/${sessionId}/versions`, {
    headers: _authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.versions ?? [];
}

export async function getReportVersion(sessionId: string, version: number): Promise<any | null> {
  const res = await fetch(`/api/research/${sessionId}/versions/${version}`, {
    headers: _authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

// ─── Schedules ────────────────────────────────────────────────────────────────

export interface Schedule {
  id: string;
  topic: string;
  frequency: "daily" | "weekly";
  hour: number;
  day_of_week: number;
  depth: number;
  is_active: boolean;
  notify_email: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export async function listSchedules(): Promise<Schedule[]> {
  const res = await fetch("/api/schedules", { headers: _authHeaders(), cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.schedules ?? [];
}

export async function createSchedule(payload: {
  topic: string;
  frequency: "daily" | "weekly";
  hour: number;
  day_of_week: number;
  depth: number;
  notify_email: boolean;
}): Promise<Schedule> {
  const res = await fetch("/api/schedules", {
    method: "POST",
    headers: { ..._authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create schedule");
  return res.json();
}

export async function toggleSchedule(id: string, is_active: boolean): Promise<Schedule> {
  const res = await fetch(`/api/schedules/${id}`, {
    method: "PATCH",
    headers: { ..._authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ is_active }),
  });
  if (!res.ok) throw new Error("Failed to toggle schedule");
  return res.json();
}

export async function deleteSchedule(id: string): Promise<void> {
  await fetch(`/api/schedules/${id}`, { method: "DELETE", headers: _authHeaders() });
}

export async function runScheduleNow(id: string): Promise<{ session_id: string }> {
  const res = await fetch(`/api/schedules/${id}/run`, {
    method: "POST",
    headers: _authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to trigger schedule");
  return res.json();
}

export async function getDashboardStats(): Promise<any> {
  const headers: Record<string, string> = {};
  const token = typeof window !== "undefined" ? localStorage.getItem("rm_access_token") : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api/research/analytics`, { headers });
  if (!res.ok) throw new Error("Failed to fetch dashboard stats");
  const data = await res.json();
  return data.data || {};
}
