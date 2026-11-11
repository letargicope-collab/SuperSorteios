/** Accept only the Instagram/Facebook image CDNs; never proxy arbitrary URLs. */
export function instagramImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096) return undefined;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = ["cdninstagram.com", "fbcdn.net"].some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
    if (
      !allowed ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function profileImageProxy(value: unknown): string | undefined {
  const url = instagramImageUrl(value);
  return url ? `/api/profile-image?url=${encodeURIComponent(url)}` : undefined;
}
