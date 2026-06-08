import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const headers: Record<string, string> = {};
    const auth = request.headers.get("Authorization");
    if (auth) headers["Authorization"] = auth;

    const res = await fetch(`${BACKEND}/research/dashboard/stats`, {
      cache: "no-store",
      headers,
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, data: null }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ success: false, data: null }, { status: 500 });
  }
}
