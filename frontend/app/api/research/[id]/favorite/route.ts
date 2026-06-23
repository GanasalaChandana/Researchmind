import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.text();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = req.headers.get("Authorization");
  if (auth) headers["Authorization"] = auth;

  const res = await fetch(`${BACKEND}/research/${params.id}/favorite`, {
    method: "POST",
    headers,
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
