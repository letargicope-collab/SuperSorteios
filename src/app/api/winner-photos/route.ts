import { profileImageProxy } from "@/lib/profile-image";

export const dynamic = "force-dynamic";
export const maxDuration = 75;

const PROFILE_ACTOR = "https://api.apify.com/v2/acts/instagram-data-api~instagram-profile-scraper/run-sync-get-dataset-items";
const VALID_USERNAME = /^[a-zA-Z0-9._]{1,30}$/;

type ProfileRow = {
  username?: unknown;
  input?: unknown;
  profilePicUrlHD?: unknown;
  profilePicUrlHd?: unknown;
  profilePicUrl?: unknown;
  profilePictureUrl?: unknown;
  profilePic?: unknown;
  profile_picture_url?: unknown;
  profile_pic_url?: unknown;
  error?: unknown;
};

export async function POST(request: Request) {
  let body: { usernames?: unknown; confirmCost?: unknown };
  try {
    body = (await request.json()) as { usernames?: unknown; confirmCost?: unknown };
  } catch {
    return Response.json({ error: "Solicitação inválida." }, { status: 400 });
  }

  if (!body || body.confirmCost !== true || !Array.isArray(body.usernames)) {
    return Response.json({ error: "A busca de fotos precisa estar ativada nas configurações." }, { status: 400 });
  }

  const usernames = [...new Set(
    body.usernames
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().replace(/^@/, "").toLowerCase())
      .filter((value) => VALID_USERNAME.test(value)),
  )].slice(0, 10);

  if (!usernames.length) return Response.json({ photos: {} });

  const token = process.env.APIFY_API_TOKEN?.trim() || process.env.APIFY_TOKEN?.trim();
  if (!token) return Response.json({ photos: {}, available: false });

  const endpoint = new URL(PROFILE_ACTOR);
  endpoint.searchParams.set("timeout", "55");
  endpoint.searchParams.set("maxTotalChargeUsd", "0.02");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("clean", "true");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(68_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        usernames,
        includeAbout: false,
        includeRelated: false,
        officialFieldNames: true,
        includeRaw: false,
        returnWithinSecs: 45,
      }),
    });
    if (!response.ok) return Response.json({ photos: {}, available: false });
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) return Response.json({ photos: {}, available: false });

    const photos: Record<string, string> = {};
    for (const candidate of rows as ProfileRow[]) {
      if (candidate.error) continue;
      const username = typeof candidate.username === "string"
        ? candidate.username.trim().replace(/^@/, "").toLowerCase()
        : typeof candidate.input === "string"
          ? candidate.input.trim().replace(/^@/, "").toLowerCase()
          : "";
      if (!usernames.includes(username)) continue;
      const photo = [
        candidate.profilePicUrlHD,
        candidate.profilePicUrlHd,
        candidate.profilePicUrl,
        candidate.profilePictureUrl,
        candidate.profilePic,
        candidate.profile_picture_url,
        candidate.profile_pic_url,
      ].map(profileImageProxy).find(Boolean);
      if (photo) photos[username] = photo;
    }
    return Response.json({ photos, available: true });
  } catch {
    return Response.json({ photos: {}, available: false });
  }
}
