import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get("Authorization");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.text();
  const res = await fetch(`${BACKEND}/research/${params.id}/collection`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
