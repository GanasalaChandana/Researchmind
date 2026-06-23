import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization") ?? "";
  const a = req.nextUrl.searchParams.get("a") ?? "";
  const b = req.nextUrl.searchParams.get("b") ?? "";

  if (!a || !b) {
    return NextResponse.json({ error: "Missing session ids" }, { status: 400 });
  }

  try {
    const res = await fetch(`${BACKEND}/research/compare?a=${a}&b=${b}`, {
      headers: { Authorization: token },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Compare failed" }, { status: 500 });
  }
}
