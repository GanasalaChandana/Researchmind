import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const headers: Record<string, string> = {};
    const auth = request.headers.get("Authorization");
    if (auth) headers["Authorization"] = auth;

    const { searchParams } = new URL(request.url);
    const tagName = searchParams.get("tag_name");
    const color = searchParams.get("color");

    if (!tagName) {
      return NextResponse.json({ error: "tag_name required" }, { status: 400 });
    }

    const query = new URLSearchParams({ tag_name: tagName });
    if (color) query.append("color", color);

    const res = await fetch(`${BACKEND}/research/${params.id}/tags?${query}`, {
      method: "POST",
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to add tag" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to add tag" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const headers: Record<string, string> = {};
    const auth = request.headers.get("Authorization");
    if (auth) headers["Authorization"] = auth;

    const { searchParams } = new URL(request.url);
    const tagName = searchParams.get("tag_name");

    if (!tagName) {
      return NextResponse.json({ error: "tag_name required" }, { status: 400 });
    }

    const res = await fetch(
      `${BACKEND}/research/${params.id}/tags?tag_name=${encodeURIComponent(tagName)}`,
      {
        method: "DELETE",
        headers,
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to remove tag" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to remove tag" }, { status: 500 });
  }
}
