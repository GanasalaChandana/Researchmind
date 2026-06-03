export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "markdown";

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  const response = await fetch(
    `${backendUrl}/research/${params.id}/export/${format}`
  );

  if (!response.ok) {
    return Response.json({ error: "Export failed" }, { status: response.status });
  }

  const data = await response.json();
  return Response.json(data);
}
