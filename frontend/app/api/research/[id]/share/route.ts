export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
  const auth = request.headers.get("Authorization");
  const response = await fetch(
    `${backendUrl}/research/${params.id}/share`,
    { method: "POST", headers: auth ? { Authorization: auth } : {} }
  );

  if (!response.ok) {
    return Response.json({ error: "Share creation failed" }, { status: response.status });
  }

  const data = await response.json();
  return Response.json(data);
}
