import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization") ?? "";
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/research/bulk/delete`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Bulk delete failed" }, { status: 500 });
  }
}
