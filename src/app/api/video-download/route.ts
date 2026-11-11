import { MAX_VIDEO_BYTES } from "@/lib/raffle-video-export";
import { saveVideoDownload } from "@/lib/video-downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const mimeType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (mimeType !== "video/mp4" && mimeType !== "video/webm") {
    return Response.json({ error: "Formato de vídeo inválido." }, { status: 400 });
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_VIDEO_BYTES) return Response.json({ error: "O vídeo ultrapassa o limite de 40 MB." }, { status: 413 });
  if (!request.body) return Response.json({ error: "O vídeo está vazio." }, { status: 400 });

  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_VIDEO_BYTES) {
        await reader.cancel();
        return Response.json({ error: "O vídeo ultrapassa o limite de 40 MB." }, { status: 413 });
      }
      chunks.push(value);
    }
    if (!total) return Response.json({ error: "O vídeo está vazio." }, { status: 400 });
    const extension = mimeType === "video/mp4" ? "mp4" : "webm";
    const downloadUrl = saveVideoDownload(Buffer.concat(chunks), mimeType, extension);
    return Response.json({ downloadUrl });
  } catch {
    return Response.json({ error: "Não foi possível preparar o link de download." }, { status: 500 });
  }
}
