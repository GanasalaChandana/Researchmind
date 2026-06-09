import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization") ?? "";
  if (!token) return NextResponse.json({ entities: [] });

  const limit = req.nextUrl.searchParams.get("limit") ?? "20";
  const days  = req.nextUrl.searchParams.get("days")  ?? "30";

  try {
    const url = `${BACKEND}/research/entities/top?limit=${limit}&days=${days}`;
    const res = await fetch(url, { headers: { Authorization: token }, cache: "no-store" });
    if (!res.ok) return NextResponse.json({ entities: [] });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ entities: [] });
  }
}
