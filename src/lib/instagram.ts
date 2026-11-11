const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);

export function normalizeInstagramPostUrl(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }

  if (!INSTAGRAM_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  if (parsed.username || parsed.password || (parsed.port && parsed.port !== "443")) return null;

  const match = parsed.pathname.match(/^\/(p|reels?|tv)\/([a-z\d_-]+)\/?$/i);
  if (!match) return null;

  const type = match[1].toLowerCase() === "reels" ? "reel" : match[1].toLowerCase();
  return `https://www.instagram.com/${type}/${match[2]}/`;
}

export function instagramPostKey(value: string): string | null {
  const normalized = normalizeInstagramPostUrl(value);
  if (!normalized) return null;
  const match = normalized.match(/\/(p|reel|tv)\/([a-z\d_-]+)\/$/i);
  return match ? `${match[1].toLowerCase()}/${match[2].toLowerCase()}` : null;
}
