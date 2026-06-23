import { NextRequest } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = params.id;
  const topic = req.nextUrl.searchParams.get("topic") ?? "";
  const depth = req.nextUrl.searchParams.get("depth") ?? "3";
  const language = req.nextUrl.searchParams.get("language");
  const docIds     = req.nextUrl.searchParams.get("doc_ids");
  const modelTier  = req.nextUrl.searchParams.get("model_tier");

  let backendUrl = `${BACKEND}/research/${sessionId}/stream?topic=${encodeURIComponent(topic)}&depth=${depth}`;
  if (language)  backendUrl += `&language=${encodeURIComponent(language)}`;
  if (docIds)    backendUrl += `&doc_ids=${encodeURIComponent(docIds)}`;
  if (modelTier) backendUrl += `&model_tier=${encodeURIComponent(modelTier)}`;

  const backendRes = await fetch(backendUrl, {
    headers: { Accept: "text/event-stream", "Cache-Control": "no-cache" },
  });

  // Stream the response directly to the client
  return new Response(backendRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
