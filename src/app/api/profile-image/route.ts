import { instagramImageUrl } from "@/lib/profile-image";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export async function GET(request: Request) {
  const source = instagramImageUrl(new URL(request.url).searchParams.get("url"));
  if (!source) return new Response(null, { status: 404 });

  try {
    const response = await fetch(source, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        Referer: "https://www.instagram.com/",
      },
    });
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (!response.ok || !contentType || !IMAGE_TYPES.has(contentType) || contentLength > MAX_IMAGE_BYTES || !response.body) {
      return new Response(null, { status: 404 });
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }

    return new Response(Buffer.concat(chunks), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
