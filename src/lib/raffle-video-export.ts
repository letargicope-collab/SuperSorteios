import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";

export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
let activeConversions = 0;

export function conversionAvailable(): boolean {
  return activeConversions < 2;
}

export async function convertWebmToMp4(data: Buffer, signal: AbortSignal): Promise<Buffer> {
  if (!conversionAvailable()) throw new Error("busy");
  if (!data.length) throw new Error("empty");
  if (data.byteLength > MAX_VIDEO_BYTES) throw new Error("too-large");

  activeConversions += 1;
  let directory = "";
  try {
    directory = await mkdtemp(path.join(tmpdir(), "super-sorteio-"));
    const input = path.join(directory, "entrada.webm");
    const output = path.join(directory, "sorteio.mp4");
    await writeFile(input, data);
    await convertVideo(input, output, signal);
    return await readFile(output);
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    activeConversions -= 1;
  }
}

function convertVideo(input: string, output: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(ffmpeg.path, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", input,
      "-t", "30",
      "-vf", "scale=1080:1920:flags=lanczos,format=yuv420p",
      "-r", "30", "-an",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-threads", "2",
      "-movflags", "+faststart",
      output,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      process.kill("SIGKILL");
    }, 150_000);
    const abort = () => {
      killed = true;
      process.kill("SIGKILL");
    };
    signal.addEventListener("abort", abort, { once: true });
    process.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 2000) stderr += chunk.toString();
    });
    process.once("error", (error) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(error);
    });
    process.once("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (code === 0 && !killed) resolve();
      else reject(new Error(killed ? "timeout" : stderr || "conversion-failed"));
    });
  });
}
