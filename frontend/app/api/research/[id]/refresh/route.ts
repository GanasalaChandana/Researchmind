import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = req.headers.get("authorization") ?? "";
  try {
    const res = await fetch(`${BACKEND}/research/${params.id}/refresh`, {
      method: "POST",
      headers: { Authorization: token },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}
