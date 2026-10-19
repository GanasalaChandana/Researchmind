import { NextRequest, NextResponse } from "next/server";

// Same address the stream/start proxies use (known to work); BACKEND_URL as fallback.
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000");

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const headers: Record<string, string> = {};
    const auth = req.headers.get("Authorization");
    if (auth) headers["Authorization"] = auth;

    const res = await fetch(`${BACKEND}/research/${params.id}/report`, {
      cache: "no-store",
      headers,
    });
    if (!res.ok) {
      // Pass the real status through (the page treats 401 as "private"); body is null for old callers.
      return NextResponse.json(null, {
        status: res.status === 401 ? 401 : 404,
        headers: { "x-upstream-status": String(res.status) },
      });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("report proxy failed:", BACKEND, err?.message);
    return NextResponse.json(null, { status: 500, headers: { "x-proxy-error": String(err?.message ?? "fetch failed").slice(0, 120) } });
  }
}
