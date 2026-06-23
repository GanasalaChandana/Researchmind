export async function GET(
  request: Request,
  { params }: { params: { id: string; format: string } }
) {
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

  try {
    const response = await fetch(
      `${backendUrl}/research/${params.id}/export/${params.format}`
    );

    if (!response.ok) {
      return Response.json(
        { error: `Export failed: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: `Export error: ${String(error)}` },
      { status: 500 }
    );
  }
}
