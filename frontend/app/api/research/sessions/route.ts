import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const headers: Record<string, string> = {};
    // Forward Authorization header so backend can filter by user
    const auth = req.headers.get("Authorization");
    if (auth) headers["Authorization"] = auth;

    // Forward query parameters to backend
    const { searchParams } = new URL(req.url);
    const queryString = searchParams.toString();
    const url = queryString
      ? `${BACKEND}/research/sessions/list?${queryString}`
      : `${BACKEND}/research/sessions/list`;

    const res = await fetch(url, {
      cache: "no-store",
      headers,
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ items: [], total: 0, offset: 0, limit: 20, has_more: false });
  }
}
