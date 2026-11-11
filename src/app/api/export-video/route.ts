import { conversionAvailable, convertWebmToMp4, MAX_VIDEO_BYTES } from "@/lib/raffle-video-export";
import { saveVideoDownload } from "@/lib/video-downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

async function readLimited(request: Request): Promise<Buffer> {
  if (!request.body) throw new Error("empty");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_VIDEO_BYTES) {
      await reader.cancel();
      throw new Error("too-large");
    }
    chunks.push(value);
  }
  if (!total) throw new Error("empty");
  return Buffer.concat(chunks);
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("video/webm")) {
    return Response.json({ error: "Envie um vídeo WebM válido." }, { status: 400 });
  }
  const size = Number(request.headers.get("content-length") || 0);
  if (size > MAX_VIDEO_BYTES) return Response.json({ error: "O vídeo ultrapassa o limite de 40 MB." }, { status: 413 });
  if (!conversionAvailable()) return Response.json({ error: "Há outras conversões em andamento. Tente novamente em instantes." }, { status: 429 });

  try {
    const data = await readLimited(request);
    const video = await convertWebmToMp4(data, request.signal);
    if (request.headers.get("x-download-url") === "1") {
      return Response.json({ downloadUrl: saveVideoDownload(video, "video/mp4", "mp4") });
    }
    return new Response(new Uint8Array(video), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="sorteio-super-connect.mp4"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "too-large";
    return Response.json(
      { error: tooLarge ? "O vídeo ultrapassa o limite de 40 MB." : "Não foi possível converter o vídeo em MP4." },
      { status: tooLarge ? 413 : 500 },
    );
  }
}
