/**
 * Proxy all /api/auth/* requests to the backend /auth/* endpoints.
 * Handles: register, login, refresh, logout, me, change-password
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

async function handler(req: NextRequest, { params }: { params: { path: string[] } }) {
  const subPath = params.path.join("/");
  const backendUrl = `${BACKEND}/auth/${subPath}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Forward Authorization header if present
  const authHeader = req.headers.get("Authorization");
  if (authHeader) headers["Authorization"] = authHeader;

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const body = await req.text();
      if (body) init.body = body;
    } catch {}
  }

  const res = await fetch(backendUrl, init);
  const data = await res.json().catch(() => ({}));

  return NextResponse.json(data, { status: res.status });
}

export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE };
