import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Forward Authorization so backend can associate session with user
  const auth = req.headers.get("Authorization");
  if (auth) headers["Authorization"] = auth;

  const res = await fetch(`${BACKEND}/research/start`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data);
}
