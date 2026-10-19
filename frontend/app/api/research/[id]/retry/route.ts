import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const headers: Record<string, string> = {};
  const auth = req.headers.get("Authorization");
  if (auth) headers["Authorization"] = auth;

  const res = await fetch(`${BACKEND}/research/${params.id}/retry`, { method: "POST", headers });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
