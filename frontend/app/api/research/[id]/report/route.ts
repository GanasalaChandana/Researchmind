import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

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
    if (!res.ok) return NextResponse.json(null, { status: res.status === 401 ? 401 : 404 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null, { status: 500 });
  }
}
