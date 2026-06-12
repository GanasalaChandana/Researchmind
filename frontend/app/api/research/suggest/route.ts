import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim() || q.trim().length < 3) return NextResponse.json({ suggestions: [] });
  try {
    const res = await fetch(`${BACKEND}/research/suggest?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
