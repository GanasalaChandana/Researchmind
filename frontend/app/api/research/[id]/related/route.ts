import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = req.headers.get("authorization") ?? "";
  if (!token) return NextResponse.json({ related: [] });

  try {
    const url = `${BACKEND}/research/${params.id}/related`;
    const res = await fetch(url, {
      headers: { Authorization: token },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ related: [] });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ related: [] });
  }
}
