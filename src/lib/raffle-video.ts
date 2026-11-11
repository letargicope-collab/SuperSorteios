"use client";

export type VideoEntry = {
  username: string;
  comment: string;
  entryNumber: number;
};

type VideoOptions = {
  winner: VideoEntry;
  entries: VideoEntry[];
  photoUrl?: string;
  durationSeconds: number;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
};

type VideoResult = { blob: Blob; extension: "mp4" | "webm" };

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const STEPS = 48;
const GREEN = "#d9ff00";

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(null);
    const image = new Image();
    let done = false;
    const timeout = window.setTimeout(() => finish(null), 7000);
    const finish = (value: HTMLImageElement | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => finish(null);
    signal?.addEventListener("abort", onAbort, { once: true });
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = url;
  });
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, minSize: number, weight = 800) {
  let current = size;
  do {
    ctx.font = `${weight} ${current}px Inter, system-ui, -apple-system, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    current -= 2;
  } while (current > minSize);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    while (ctx.measureText(current).width > width && current.length > 1) {
      let segment = "";
      for (const char of current) {
        if (ctx.measureText(segment + char).width > width && segment) break;
        segment += char;
      }
      lines.push(segment);
      current = current.slice(segment.length);
      if (lines.length >= maxLines) break;
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length >= maxLines && words.length && lines.join(" ").length < text.trim().replace(/\s+/g, " ").length) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines.slice(0, maxLines);
}

function drawBackground(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null) {
  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, "#07c733");
  background.addColorStop(0.5, "#059e2b");
  background.addColorStop(1, "#07822f");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(100, 50, 0, 100, 50, 900);
  glow.addColorStop(0, "rgba(222, 255, 0, 0.28)");
  glow.addColorStop(1, "rgba(222, 255, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = "rgba(239, 255, 231, 0.06)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= HEIGHT; y += 90) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(229, 255, 133, 0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(915, 650, 390, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(915, 650, 344, 0, Math.PI * 2);
  ctx.stroke();

  if (logo) {
    ctx.drawImage(logo, 319, 106, 442, 126);
  } else {
    ctx.fillStyle = "#071e0c";
    ctx.font = "900 43px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SUPER CONNECT", WIDTH / 2, 188);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#ecff8b";
  ctx.font = "800 22px system-ui, sans-serif";
  ctx.letterSpacing = "5px";
  ctx.fillText("SORTEIO SUPER CONNECT", WIDTH / 2, 312);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.font = "600 23px system-ui, sans-serif";
  ctx.fillText("@superconnectbr", WIDTH / 2, 1774);
  ctx.fillStyle = "rgba(255, 255, 255, 0.68)";
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillText("BOA SORTE A TODOS", WIDTH / 2, 1810);
  ctx.letterSpacing = "0px";
}

function drawSpin(ctx: CanvasRenderingContext2D, entries: VideoEntry[], winner: VideoEntry, progress: number) {
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 60px Inter, system-ui, sans-serif";
  ctx.fillText("Chegou a hora de descobrir", WIDTH / 2, 470);
  ctx.fillStyle = GREEN;
  ctx.font = "800 60px Inter, system-ui, sans-serif";
  ctx.fillText("o nosso ganhador.", WIDTH / 2, 555);
  ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
  ctx.font = "500 27px system-ui, sans-serif";
  ctx.fillText("Cada comentário, uma chance.", WIDTH / 2, 616);

  const winnerIndex = Math.max(0, entries.findIndex((entry) => entry.entryNumber === winner.entryNumber));
  const start = (winnerIndex - (STEPS - 1) % entries.length + entries.length) % entries.length;
  const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, progress)), 2.4);
  const step = Math.min(STEPS - 1, Math.floor(eased * STEPS));
  const centerIndex = (start + step) % entries.length;

  roundedRect(ctx, 92, 700, 896, 600, 52);
  ctx.fillStyle = "rgba(0, 74, 27, 0.58)";
  ctx.fill();
  ctx.strokeStyle = "rgba(236,255,172,0.42)";
  ctx.lineWidth = 2;
  ctx.stroke();

  for (let offset = -2; offset <= 2; offset += 1) {
    const index = (centerIndex + offset + entries.length * 3) % entries.length;
    const entry = entries[index];
    const y = 778 + (offset + 2) * 95;
    if (offset === 0) {
      roundedRect(ctx, 132, y - 16, 816, 94, 22);
      ctx.fillStyle = GREEN;
      ctx.fill();
      ctx.fillStyle = "#092410";
      fitFont(ctx, `@${entry.username}`, 710, 48, 27, 850);
    } else {
      ctx.fillStyle = Math.abs(offset) === 1 ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.46)";
      fitFont(ctx, `@${entry.username}`, 700, Math.abs(offset) === 1 ? 37 : 29, 23, 600);
    }
    ctx.fillText(`@${entry.username}`, WIDTH / 2, y + 42);
  }
}

function drawResult(
  ctx: CanvasRenderingContext2D,
  winner: VideoEntry,
  photo: HTMLImageElement | null,
  progress: number,
) {
  const alpha = Math.min(1, Math.max(0, progress * 3));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.fillStyle = GREEN;
  ctx.font = "800 24px system-ui, sans-serif";
  ctx.letterSpacing = "5px";
  ctx.fillText("RESULTADO DO SORTEIO", WIDTH / 2, 460);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = GREEN;
  ctx.font = "850 68px Inter, system-ui, sans-serif";
  ctx.fillText("Temos um ganhador!", WIDTH / 2, 593);

  roundedRect(ctx, 75, 720, 930, 710, 54);
  ctx.fillStyle = "rgba(0, 74, 27, 0.66)";
  ctx.fill();
  ctx.strokeStyle = "rgba(235,255,169,0.52)";
  ctx.lineWidth = 2;
  ctx.stroke();

  let usernameY = 900;
  if (photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(WIDTH / 2, 846, 72, 0, Math.PI * 2);
    ctx.clip();
    const side = Math.min(photo.naturalWidth, photo.naturalHeight);
    ctx.drawImage(photo, (photo.naturalWidth - side) / 2, (photo.naturalHeight - side) / 2, side, side, WIDTH / 2 - 72, 774, 144, 144);
    ctx.restore();
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(WIDTH / 2, 846, 77, 0, Math.PI * 2);
    ctx.stroke();
    usernameY = 1000;
  }

  const username = `@${winner.username}`;
  ctx.fillStyle = "#ffffff";
  fitFont(ctx, username, 790, 70, 35, 850);
  ctx.fillText(username, WIDTH / 2, usernameY);

  ctx.fillStyle = GREEN;
  ctx.fillRect(WIDTH / 2 - 33, usernameY + 45, 66, 5);
  ctx.fillStyle = "#edff9d";
  ctx.font = "800 20px system-ui, sans-serif";
  ctx.letterSpacing = "3px";
  ctx.fillText("COMENTÁRIO SORTEADO", WIDTH / 2, usernameY + 112);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "#ffffff";
  ctx.font = "500 31px Inter, system-ui, sans-serif";
  const comment = winner.comment.trim() || "Comentário selecionado no sorteio.";
  const lines = wrapLines(ctx, comment, 730, photo ? 4 : 5);
  lines.forEach((line, index) => ctx.fillText(line, WIDTH / 2, usernameY + 165 + index * 47));

  ctx.fillStyle = "rgba(219, 255, 0, 0.86)";
  ctx.font = "750 20px system-ui, sans-serif";
  ctx.fillText(`ENTRADA #${String(winner.entryNumber).padStart(2, "0")}`, WIDTH / 2, 1370);
  ctx.restore();
}

export async function generateRaffleVideo({ winner, entries, photoUrl, durationSeconds, onProgress, signal }: VideoOptions): Promise<VideoResult> {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("Este navegador não oferece gravação de vídeo. Tente usar Chrome, Edge ou Safari atualizado.");
  }
  if (signal?.aborted) throw new DOMException("Operação cancelada", "AbortError");

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx || typeof canvas.captureStream !== "function") {
    throw new Error("Este navegador não suporta a gravação do vídeo vertical.");
  }

  const [logo, photo] = await Promise.all([
    loadImage("/images/super-connect.png", signal),
    photoUrl ? loadImage(photoUrl, signal) : Promise.resolve(null),
  ]);
  if (signal?.aborted) throw new DOMException("Operação cancelada", "AbortError");

  const candidates = entries.length ? entries : [winner];
  const stream = canvas.captureStream(FPS);
  const formats = ["video/mp4;codecs=avc1.42E01F", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  let recorder: MediaRecorder | undefined;
  for (const mimeType of formats) {
    if (!MediaRecorder.isTypeSupported(mimeType)) continue;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 7_000_000 });
      break;
    } catch {
      // Try the next browser-supported codec.
    }
  }
  if (!recorder) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("Nenhum formato de vídeo é suportado por este navegador.");
  }

  const activeRecorder = recorder;
  const spinMs = Math.max(6000, Math.min(20_000, durationSeconds * 1000));
  const totalMs = spinMs + 3200;
  const chunks: Blob[] = [];
  let frame = 0;
  let aborted = false;
  const onAbort = () => {
    aborted = true;
    cancelAnimationFrame(frame);
    if (activeRecorder.state !== "inactive") activeRecorder.stop();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const recording = new Promise<VideoResult>((resolve, reject) => {
      activeRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size) chunks.push(event.data);
      };
      activeRecorder.onerror = () => reject(new Error("Não foi possível gravar o vídeo neste dispositivo."));
      activeRecorder.onstop = () => {
        if (aborted || signal?.aborted) {
          reject(new DOMException("Operação cancelada", "AbortError"));
          return;
        }
        const mimeType = activeRecorder.mimeType || "video/webm";
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) {
          reject(new Error("O navegador não conseguiu finalizar o vídeo."));
          return;
        }
        resolve({ blob, extension: mimeType.toLowerCase().includes("mp4") ? "mp4" : "webm" });
      };
    });

    drawBackground(ctx, logo);
    drawSpin(ctx, candidates, winner, 0);
    activeRecorder.start(1000);
    const startedAt = performance.now();
    const render = (time: number) => {
      if (aborted || activeRecorder.state === "inactive") return;
      const elapsed = Math.max(0, time - startedAt);
      drawBackground(ctx, logo);
      if (elapsed < spinMs) drawSpin(ctx, candidates, winner, elapsed / spinMs);
      else drawResult(ctx, winner, photo, (elapsed - spinMs) / 900);
      onProgress?.(Math.min(99, Math.floor((elapsed / totalMs) * 100)));
      if (elapsed >= totalMs) {
        activeRecorder.stop();
      } else {
        frame = requestAnimationFrame(render);
      }
    };
    frame = requestAnimationFrame(render);
    const result = await recording;
    onProgress?.(100);
    return result;
  } finally {
    cancelAnimationFrame(frame);
    signal?.removeEventListener("abort", onAbort);
    if (activeRecorder.state !== "inactive") activeRecorder.stop();
    stream.getTracks().forEach((track) => track.stop());
  }
}
