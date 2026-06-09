import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

/** GET /api/apikeys — list current user's API keys */
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization") ?? "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${BACKEND}/api/v1/keys`, {
      headers: { Authorization: token },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "Backend error", status: res.status }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Proxy error" }, { status: 500 });
  }
}

/** POST /api/apikeys — create a new API key */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization") ?? "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/api/v1/keys`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Proxy error" }, { status: 500 });
  }
}
