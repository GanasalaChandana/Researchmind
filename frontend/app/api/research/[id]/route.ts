import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = await fetch(`${BACKEND}/research/${params.id}`, { method: "DELETE" });
  const data = await res.json();
  return NextResponse.json(data);
}
