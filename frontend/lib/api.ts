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
  const res = await fetch(`/api/research/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
