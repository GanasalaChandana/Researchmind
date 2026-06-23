import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Forward auth header
    const auth = req.headers.get("authorization");
    if (auth) {
      headers["Authorization"] = auth;
    }

    const backendUrl = `${BACKEND}/research/dashboard/stats`;

    const response = await fetch(backendUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { success: false, data: null },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { success: false, data: null, error: error.message },
      { status: 500 }
    );
  }
}
