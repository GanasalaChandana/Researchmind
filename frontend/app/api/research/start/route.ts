import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // seconds — allow Render cold start

const BACKEND = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = req.headers.get("Authorization");
  if (auth) headers["Authorization"] = auth;

  try {
    const res = await fetch(`${BACKEND}/research/start`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error("Backend fetch failed:", BACKEND, err?.message);
    return NextResponse.json({ detail: `Backend unreachable: ${err?.message}` }, { status: 502 });
  }
}
