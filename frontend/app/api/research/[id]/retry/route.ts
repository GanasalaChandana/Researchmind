import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = await fetch(`${BACKEND}/research/${params.id}/retry`, { method: "POST" });
  const data = await res.json();
  return NextResponse.json(data);
}
