export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url);
  const style = searchParams.get("style") || "apa";

  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

  try {
    const response = await fetch(
      `${backendUrl}/research/${params.id}/citations?style=${style}`
    );

    if (!response.ok) {
      return Response.json(
        { error: "Failed to fetch citations" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: `Citations error: ${String(error)}` },
      { status: 500 }
    );
  }
}
