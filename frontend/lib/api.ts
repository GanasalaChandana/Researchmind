const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function startResearch(topic: string, depth = 3): Promise<{ session_id: string }> {
  // Use Next.js API proxy to avoid CORS on the POST request
  const res = await fetch(`/api/research/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, depth }),
  });
  if (!res.ok) throw new Error("Failed to start research session");
  return res.json();
}

export function streamResearch(sessionId: string, topic: string, depth = 3): EventSource {
  const params = new URLSearchParams({ topic, depth: String(depth) });
  // Use Next.js API proxy to avoid Vercel SSE buffering issues
  return new EventSource(`/api/research/${sessionId}/stream?${params}`);
}

export async function getReport(sessionId: string) {
  const res = await fetch(`${BACKEND}/research/${sessionId}/report`);
  if (!res.ok) throw new Error("Report not found");
  return res.json();
}
