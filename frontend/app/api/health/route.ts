import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // a sleeping free-tier backend needs up to ~50s to wake

/** Wakes the backend and reports whether it answered. Used before a research run starts. */
export async function GET() {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BACKEND}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    return NextResponse.json({ ok: res.ok, ms: Date.now() - t0 }, { status: res.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ ok: false, ms: Date.now() - t0 }, { status: 504 });
  }
}
