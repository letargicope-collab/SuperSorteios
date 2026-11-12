import { randomUUID } from "node:crypto";
import { MAX_VIDEO_BYTES } from "@/lib/raffle-video-export";

type DownloadRecord = { data: Buffer; mimeType: string; extension: "mp4" | "webm"; expiresAt: number };
type DownloadStore = { videos: Map<string, DownloadRecord> };

const globalStore = globalThis as typeof globalThis & { __superVideoDownloads?: DownloadStore };
const store = globalStore.__superVideoDownloads ?? { videos: new Map<string, DownloadRecord>() };
globalStore.__superVideoDownloads = store;
const TTL = 15 * 60 * 1000;

export function saveVideoDownload(data: Buffer, mimeType: string, extension: "mp4" | "webm"): string {
  const now = Date.now();
  for (const [id, item] of store.videos) if (item.expiresAt <= now) store.videos.delete(id);
  if (data.length > MAX_VIDEO_BYTES) throw new Error("too-large");
  const id = randomUUID().replace(/-/g, "");
  store.videos.set(id, { data, mimeType, extension, expiresAt: now + TTL });
  return `/api/export-video/${id}`;
}

export function deleteVideoDownload(id: string): boolean {
  if (!/^[a-f0-9]{32}$/.test(id)) return false;
  return store.videos.delete(id);
}

export function getVideoDownload(id: string): DownloadRecord | undefined {
  if (!/^[a-f0-9]{32}$/.test(id)) return undefined;
  const item = store.videos.get(id);
  if (!item) return undefined;
  if (item.expiresAt <= Date.now()) {
    store.videos.delete(id);
    return undefined;
  }
  return item;
}
