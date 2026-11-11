import { getVideoDownload } from "@/lib/video-downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = getVideoDownload(id);
  if (!item) return Response.json({ error: "Esse link de vídeo expirou. Gere um novo download." }, { status: 404 });

  const filenameParam = new URL(request.url).searchParams.get("name");
  const safeName = (filenameParam || "sorteio-super-connect")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/\.(mp4|webm)$/i, "")
    .slice(0, 90);
  return new Response(new Uint8Array(item.data), {
    headers: {
      "Content-Type": item.mimeType,
      "Content-Disposition": `attachment; filename="${safeName}.${item.extension}"`,
      "Content-Length": String(item.data.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
