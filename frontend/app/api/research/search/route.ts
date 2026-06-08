import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization") ?? "";
  const q = req.nextUrl.searchParams.get("q") ?? "";

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [], query: q, total: 0 });
  }

  try {
    const url = `${BACKEND}/research/search?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { Authorization: token },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Backend search failed", status: res.status },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[search proxy]", err);
    return NextResponse.json({ error: "Search proxy error" }, { status: 500 });
  }
}
