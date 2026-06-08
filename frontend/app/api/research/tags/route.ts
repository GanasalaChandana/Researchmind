import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const headers: Record<string, string> = {};
    const auth = req.headers.get("Authorization");
    if (auth) headers["Authorization"] = auth;

    const res = await fetch(`${BACKEND}/research/tags`, {
      cache: "no-store",
      headers,
    });

    if (!res.ok) {
      return NextResponse.json({ tags: [] });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ tags: [] });
  }
}
