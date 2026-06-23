import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = req.headers.get("authorization") ?? "";
  try {
    const res = await fetch(`${BACKEND}/schedules/${params.id}/run`, {
      method: "POST",
      headers: { Authorization: token },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Failed to run schedule" }, { status: 500 });
  }
}
