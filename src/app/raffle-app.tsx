"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { normalizeInstagramPostUrl } from "@/lib/instagram";
import { generateRaffleVideo } from "@/lib/raffle-video";

type Stage = "start" | "setup" | "roulette" | "result";
type SourceMode = "demo" | "manual" | "apify";
type Participant = {
  id: string;
  username: string;
  comment: string;
  timestamp?: string;
  likes?: number;
  repliesCount?: number;
  ownerFullName?: string;
  ownerVerified?: boolean;
  profileImageUrl?: string;
  isReply?: boolean;
  commentUrl?: string;
};
type DrawPerson = {
  username: string;
  comment: string;
  entryNumber: number;
};
type DrawSettings = {
  winnerCount: number;
  alternateCount: number;
  durationSeconds: number;
  removeDuplicates: boolean;
  prizeEnabled: boolean;
  minMentions: number;
  requiredHashtag: string;
  requiredMention: string;
};
type DrawOutcome = {
  winners: DrawPerson[];
  alternates: DrawPerson[];
};
type HistoryDraw = {
  id: string;
  sourceUrl: string;
  participantCount: number;
  winners: DrawPerson[];
  createdAt: string;
};
type ApiCommentsResponse = {
  mode?: string;
  url?: string;
  participants?: Array<{
    id?: string;
    username?: string;
    comment?: string;
    timestamp?: string;
    likes?: number;
    repliesCount?: number;
    ownerFullName?: string;
    ownerVerified?: boolean;
    profileImageUrl?: string;
    isReply?: boolean;
    commentUrl?: string;
  }>;
  postCaption?: string;
  truncated?: boolean;
  message?: string;
  error?: string;
  runId?: string;
  datasetId?: string;
  status?: string;
  maxTotalChargeUsd?: number;
  sourceError?: { code?: string; message?: string };
};
type IconName =
  | "instagram"
  | "link"
  | "arrowRight"
  | "arrowLeft"
  | "spark"
  | "users"
  | "shield"
  | "play"
  | "clock"
  | "history"
  | "sliders"
  | "gift"
  | "plus"
  | "minus"
  | "search"
  | "refresh"
  | "check"
  | "info"
  | "upload"
  | "hash"
  | "at"
  | "trophy"
  | "heart"
  | "heartFilled"
  | "message"
  | "send"
  | "bookmark"
  | "verified"
  | "more"
  | "copy"
  | "download"
  | "external"
  | "checkCircle"
  | "target"
  | "zap";

type ParsedImport = { participants: Participant[]; ignored: number };

const ICON_PATHS: Record<IconName, ReactNode> = {
  instagram: (
    <>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.8" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  link: <><path d="M10 13.8a4.5 4.5 0 0 0 6.36 0l3-3a4.5 4.5 0 0 0-6.36-6.36l-1.72 1.72" /><path d="M14 10.2a4.5 4.5 0 0 0-6.36 0l-3 3A4.5 4.5 0 0 0 11 19.56l1.72-1.72" /></>,
  arrowRight: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  arrowLeft: <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
  spark: <><path d="m12 2 1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  play: <><path d="m8 5 12 7-12 7V5Z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  history: <><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
  sliders: <><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M20 21v-5" /><path d="M20 12V3" /><path d="M2 14h4" /><path d="M10 8h4" /><path d="M18 16h4" /></>,
  gift: <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18M12 8H7.5a2.5 2.5 0 1 1 2.45-3.02L12 8Zm0 0h4.5a2.5 2.5 0 1 0-2.45-3.02L12 8Z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <path d="M5 12h14" />,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M4.9 9a7.5 7.5 0 0 1 12.7-2L20 12M4 17v-5h5" /><path d="M19.1 15a7.5 7.5 0 0 1-12.7 2L4 12" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>,
  hash: <><path d="M4 9h16M3 15h16M10 3 8 21M16 3l-2 18" /></>,
  at: <><circle cx="12" cy="12" r="9" /><path d="M16 12v2a2 2 0 0 0 4 0v-2a8 8 0 1 0-3 6.25" /><circle cx="12" cy="12" r="3" /></>,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4" /></>,
  heart: <path d="M20.8 8.8c0 4.1-8.8 10.2-8.8 10.2S3.2 12.9 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z" />,
  heartFilled: <path d="M20.8 8.8c0 4.1-8.8 10.2-8.8 10.2S3.2 12.9 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z" fill="currentColor" stroke="none" />,
  message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>,
  bookmark: <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z" />,
  verified: <><path d="m9 12 2 2 4-4" /><path d="M12 2.5 14.3 4l2.8-.2.9 2.7 2.2 1.7-.9 2.7.9 2.7-2.2 1.7-.9 2.7-2.8-.2-2.3 1.5-2.3-1.5-2.8.2-.9-2.7-2.2-1.7.9-2.7-.9-2.7 2.2-1.7.9-2.7 2.8.2 2.3-1.5Z" /></>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
  external: <><path d="M14 3h7v7M10 14 21 3" /><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  zap: <path d="m13 2-3 8h7l-6 12 2-9H6l7-11Z" fill="currentColor" stroke="none" />,
};

const DEMO_PARTICIPANTS: Participant[] = [
  { id: "demo-01", username: "marina.alves", comment: "Quero muito participar! 🍀 @bianca #Sorteio" },
  { id: "demo-02", username: "gui.monteiro", comment: "Que campanha incrível, boa sorte pra mim! 💚" },
  { id: "demo-03", username: "bia.ramos", comment: "Eu e a @carol estamos dentro! ✨ #Sorteio" },
  { id: "demo-04", username: "lucas.mendes", comment: "Esse prêmio já tem dono 👀" },
  { id: "demo-05", username: "nina.souza", comment: "Participando com muita esperança! 💫 @amanda" },
  { id: "demo-06", username: "rafa.costa", comment: "Conexão boa é ganhar esse sorteio 😂💚" },
  { id: "demo-07", username: "joaopedro", comment: "Quero! Marquei minha dupla: @duda.silva" },
  { id: "demo-08", username: "duda.silva", comment: "Já pensou? Seria perfeito! 🌟 #Sorteio" },
  { id: "demo-09", username: "ana.clara", comment: "Tô participando! 🍀🍀" },
  { id: "demo-10", username: "pedro.augusto", comment: "Boa sorte para todo mundo! 💚" },
  { id: "demo-11", username: "marina.alves", comment: "Vim comentar de novo, vai que dá! 🙌" },
  { id: "demo-12", username: "thais.nogueira", comment: "Amei! Quero muito ganhar esse prêmio 😍" },
  { id: "demo-13", username: "leo.martins", comment: "Participando e marcando @vivi_oliveira" },
  { id: "demo-14", username: "vivi_oliveira", comment: "Que a sorte esteja comigo! #Sorteio 🍀" },
  { id: "demo-15", username: "carol.farias", comment: "Já compartilhei com todo mundo! 💚" },
  { id: "demo-16", username: "enzo.lima", comment: "Bora que dessa vez eu ganho 😅" },
  { id: "demo-17", username: "aline.rocha", comment: "Sonhando com esse prêmio! ✨ @bia.ramos" },
  { id: "demo-18", username: "lucas.mendes", comment: "Reforçando a torcida por aqui 💪 #Sorteio" },
];

const AVATAR_PALETTES = [
  ["#d4f58a", "#72d98d"],
  ["#bce4ff", "#80b9ed"],
  ["#ffd895", "#efa66d"],
  ["#f5c3df", "#e68bbc"],
  ["#dbceff", "#ac9ce8"],
  ["#a6f0cf", "#69c9aa"],
  ["#ffc9a7", "#ed927c"],
  ["#d2e3a2", "#99c46f"],
];

function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

function avatarStyle(name: string): CSSProperties {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const colors = AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
  return { background: `linear-gradient(145deg, ${colors[0]}, ${colors[1]})` };
}

function initials(name: string): string {
  const parts = name.replace(/^@/, "").split(/[._-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]);
  return (letters.join("") || name.slice(0, 2)).toUpperCase();
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLocaleLowerCase("pt-BR");
}

function serializeParticipants(participants: Participant[]): string {
  return participants.map((person) => `@${person.username} | ${person.comment}`).join("\n");
}

function mapApiParticipants(
  people: NonNullable<ApiCommentsResponse["participants"]>,
  fallbackPrefix: string,
): Participant[] {
  return people.flatMap((person, index) => person.username ? [{
    id: person.id || `${fallbackPrefix}-${index + 1}`,
    username: person.username.replace(/^@/, ""),
    comment: person.comment?.trim() || "",
    timestamp: person.timestamp,
    likes: person.likes,
    repliesCount: person.repliesCount,
    ownerFullName: person.ownerFullName,
    ownerVerified: person.ownerVerified,
    profileImageUrl: person.profileImageUrl,
    isReply: person.isReply,
    commentUrl: person.commentUrl,
  }] : []);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function serverVideoId(downloadUrl: string): string | undefined {
  return downloadUrl.match(/\/api\/export-video\/([a-f0-9]{32})/)?.[1];
}

/** Discard a generated video: revoke the browser blob and delete the server copy. */
function releaseVideoAssets(objectUrl: string, serverDownloadUrl: string): void {
  if (objectUrl) {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // ignore
    }
  }
  const id = serverVideoId(serverDownloadUrl);
  if (id) {
    try {
      void fetch(`/api/export-video/${id}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
    } catch {
      // ignore
    }
  }
}

function collectionCapUsd(maxComments: number, withReplies = false): number {
  // Chronometrica charges per saved comment/reply row (no start fee). The
  // limit applies to top-level comments; replies can add up to 10 rows per
  // parent, so the safety cap considers that documented worst case.
  const maxRows = maxComments * (withReplies ? 11 : 1);
  return Math.max(0.05, maxRows * 0.0022 + 0.01);
}

function alternatePostUrl(url: string): string {
  const match = url.match(/instagram\.com\/(reel|tv)\/([a-z\d_-]+)\//i);
  return match ? `https://www.instagram.com/p/${match[2]}/` : url;
}

function errorFromResponse(data: ApiCommentsResponse, fallback: string): Error & { data?: ApiCommentsResponse } {
  const error = new Error(data.error || fallback) as Error & { data?: ApiCommentsResponse };
  error.data = data;
  return error;
}

function isRetryableCollectionError(error: unknown): boolean {
  const data = (error as { data?: ApiCommentsResponse } | null)?.data;
  const code = (data?.sourceError?.code || "").toLowerCase();
  const message = `${data?.sourceError?.message || ""} ${data?.error || ""}`.toLowerCase();
  if (!data?.sourceError && !data?.error) return false;
  if (code.includes("private") || code.includes("invalid") || code.includes("charge") || code.includes("limit")) {
    return false;
  }
  return (
    code.includes("no_items") ||
    code.includes("no_comments") ||
    code.includes("no_results") ||
    code.includes("unavailable") ||
    code.includes("failed") ||
    code.includes("not_found") ||
    code.includes("partial") ||
    code.includes("block") ||
    code.includes("rate") ||
    code.includes("tempor") ||
    code.includes("provider") ||
    message.includes("bloqueio tempor") ||
    message.includes("temporar")
  );
}

function parseParticipantText(value: string): ParsedImport {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const participants: Participant[] = [];
  let ignored = 0;

  lines.forEach((line, index) => {
    const separated = line.match(/^@?([\w.-]{1,64})(?:\s*\|\s*|\t+|,\s*)(.*)$/);
    const usernameOnly = line.match(/^@?([\w.-]{1,64})$/);
    const match = separated ?? usernameOnly;
    if (!match) {
      ignored += 1;
      return;
    }
    const username = match[1].replace(/^@/, "");
    const comment = separated ? (separated[2]?.trim() || "Comentário importado") : "Comentário importado";
    participants.push({
      id: `import-${index + 1}-${username.toLocaleLowerCase("pt-BR")}`,
      username,
      comment: comment.slice(0, 2200),
    });
  });

  return { participants, ignored };
}

function secureRandomIndex(length: number): number {
  if (length <= 1) return 0;
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const range = 0x1_0000_0000;
    const limit = Math.floor(range / length) * length;
    const random = new Uint32Array(1);
    do {
      window.crypto.getRandomValues(random);
    } while (random[0] >= limit);
    return random[0] % length;
  }
  return Math.floor(Math.random() * length);
}

function chooseDraw(entries: DrawPerson[], winnerCount: number, alternateCount: number): DrawOutcome {
  let pool = [...entries];
  const winners: DrawPerson[] = [];
  const alternates: DrawPerson[] = [];

  const selectPeople = (count: number, destination: DrawPerson[]) => {
    for (let index = 0; index < count && pool.length > 0; index += 1) {
      const selectedIndex = secureRandomIndex(pool.length);
      const [selected] = pool.splice(selectedIndex, 1);
      destination.push(selected);
      const selectedHandle = normalizeHandle(selected.username);
      pool = pool.filter((entry) => normalizeHandle(entry.username) !== selectedHandle);
    }
  };

  selectPeople(winnerCount, winners);
  selectPeople(alternateCount, alternates);
  return { winners, alternates };
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function NumberStepper({
  title,
  description,
  value,
  min,
  max,
  onChange,
}: {
  title: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="counter-row">
      <div className="counter-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="stepper-control" aria-label={`${title}: ${value}`}>
        <button
          type="button"
          className="stepper-btn"
          aria-label={`Diminuir ${title.toLocaleLowerCase("pt-BR")}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Icon name="minus" size={14} />
        </button>
        <span className="stepper-value" aria-live="polite">{value}</span>
        <button
          type="button"
          className="stepper-btn"
          aria-label={`Aumentar ${title.toLocaleLowerCase("pt-BR")}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <Icon name="plus" size={14} />
        </button>
      </div>
    </div>
  );
}

function Toggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span className="toggle-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <span className="switch">
        <input
          type="checkbox"
          role="switch"
          aria-label={title}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
      </span>
    </label>
  );
}

function SuperConnectLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`super-logo ${compact ? "super-logo--compact" : ""}`}>
      {/* Official artwork supplied by Super Connect. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="super-logo-image"
        src="/images/super-connect.png"
        alt="Super Connect"
        width={600}
        height={315}
      />
    </span>
  );
}

function Brand({ onHome }: { onHome: () => void }) {
  return (
    <a
      className="brand"
      href="/"
      aria-label="Super Connect Sorteios — início"
      onClick={(event) => {
        event.preventDefault();
        onHome();
      }}
    >
      <SuperConnectLogo />
      <span className="brand-divider" />
      <span className="brand-caption">Central de<br />sorteios</span>
    </a>
  );
}

function WinnerPhoto({ src, username }: { src: string; username: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="winner-real-photo" src={src} alt={`Foto de perfil de @${username}`} onError={() => setFailed(true)} />
  );
}

export default function RaffleApp() {
  const [stage, setStage] = useState<Stage>("start");
  const [sourceMode, setSourceMode] = useState<SourceMode>("manual");
  const [urlInput, setUrlInput] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceMessage, setSourceMessage] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [maxComments, setMaxComments] = useState(500);
  const [includeReplies, setIncludeReplies] = useState(false);
  const [postCaption, setPostCaption] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [formError, setFormError] = useState("");
  const [importError, setImportError] = useState("");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [activeTab, setActiveTab] = useState<"eligible" | "all">("eligible");
  const [searchTerm, setSearchTerm] = useState("");
  const [winnerCount, setWinnerCount] = useState(1);
  const [alternateCount, setAlternateCount] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(8);
  const [findWinnerPhotos, setFindWinnerPhotos] = useState(true);
  const [winnerPhotos, setWinnerPhotos] = useState<Record<string, string>>({});
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [videoWinnerIndex, setVideoWinnerIndex] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [serverDownloadUrl, setServerDownloadUrl] = useState("");
  const [isPreparingDownload, setIsPreparingDownload] = useState(false);
  const [videoExtension, setVideoExtension] = useState<"mp4" | "webm">("mp4");
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isConvertingVideo, setIsConvertingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError] = useState("");
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [prizeEnabled, setPrizeEnabled] = useState(false);
  const [prizesText, setPrizesText] = useState("");
  const [minMentions, setMinMentions] = useState(0);
  const [requiredHashtag, setRequiredHashtag] = useState("");
  const [requiredMention, setRequiredMention] = useState("");
  const [excludedUsers, setExcludedUsers] = useState("");
  const [toast, setToast] = useState("");
  const [history, setHistory] = useState<HistoryDraw[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rollIndex, setRollIndex] = useState(0);
  const [currentRollName, setCurrentRollName] = useState("");
  const [drawOutcome, setDrawOutcome] = useState<DrawOutcome | null>(null);
  // The drawn winner is immutable in drawOutcome (also what gets saved to the
  // history). These two states are the presentation layer: whoever currently
  // holds the winner slot, and the pool of substitutes available to swap in.
  const [displayWinners, setDisplayWinners] = useState<DrawPerson[]>([]);
  const [swapAlternates, setSwapAlternates] = useState<DrawPerson[]>([]);
  const [drawId, setDrawId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoAbort = useRef<AbortController | null>(null);
  const photoAbort = useRef<AbortController | null>(null);

  const eligibleEntries = useMemo(() => {
    const excluded = new Set(
      excludedUsers
        .split(/[\s,;]+/)
        .map(normalizeHandle)
        .filter(Boolean),
    );
    const hashtag = requiredHashtag.trim().replace(/^#+/, "").toLocaleLowerCase("pt-BR");
    const mention = normalizeHandle(requiredMention);
    const seenUsers = new Set<string>();
    const matches = participants.filter((person) => {
      const user = normalizeHandle(person.username);
      const comment = person.comment.toLocaleLowerCase("pt-BR");
      if (excluded.has(user)) return false;
      if (minMentions > 0 && (person.comment.match(/@[\w.]+/g)?.length ?? 0) < minMentions) return false;
      if (hashtag && !comment.includes(`#${hashtag}`)) return false;
      if (mention && !comment.includes(`@${mention}`)) return false;
      if (removeDuplicates) {
        if (seenUsers.has(user)) return false;
        seenUsers.add(user);
      }
      return true;
    });
    return matches.map((person, index) => ({ ...person, entryNumber: index + 1 }));
  }, [participants, removeDuplicates, minMentions, requiredHashtag, requiredMention, excludedUsers]);

  const eligibleById = useMemo(
    () => new Map(eligibleEntries.map((person) => [person.id, person])),
    [eligibleEntries],
  );
  const uniqueEligibleCount = useMemo(
    () => new Set(eligibleEntries.map((person) => normalizeHandle(person.username))).size,
    [eligibleEntries],
  );
  const maxWinners = Math.max(1, Math.min(10, uniqueEligibleCount));
  const maxAlternates = Math.min(20, Math.max(0, uniqueEligibleCount - winnerCount));
  const prizeList = useMemo(
    () => prizesText.split(/\r?\n/).map((prize) => prize.trim()).filter(Boolean),
    [prizesText],
  );

  useEffect(() => {
    const cappedWinnerCount = Math.max(1, Math.min(10, uniqueEligibleCount));
    if (winnerCount > cappedWinnerCount) setWinnerCount(cappedWinnerCount);
    const cappedAlternateCount = Math.min(20, Math.max(0, uniqueEligibleCount - Math.min(winnerCount, cappedWinnerCount)));
    if (alternateCount > cappedAlternateCount) setAlternateCount(cappedAlternateCount);
  }, [uniqueEligibleCount, winnerCount, alternateCount]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/draws", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { draws?: HistoryDraw[] };
      })
      .then((data) => {
        if (!cancelled && Array.isArray(data?.draws)) setHistory(data.draws);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (animationTimer.current) clearTimeout(animationTimer.current);
    videoAbort.current?.abort();
    photoAbort.current?.abort();
  }, []);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [stage]);

  // Generated videos are disposable. When the tab is closed or reloaded we
  // revoke the local blob and delete the temporary server copy.
  useEffect(() => {
    const release = () => {
      if (videoUrl) {
        try {
          URL.revokeObjectURL(videoUrl);
        } catch {
          // ignore
        }
      }
      const id = serverVideoId(serverDownloadUrl);
      if (id) {
        try {
          void fetch(`/api/export-video/${id}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("pagehide", release);
    window.addEventListener("beforeunload", release);
    return () => {
      window.removeEventListener("pagehide", release);
      window.removeEventListener("beforeunload", release);
    };
  }, [videoUrl, serverDownloadUrl]);

  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3600);
  }

  function clearResultMedia() {
    videoAbort.current?.abort();
    videoAbort.current = null;
    photoAbort.current?.abort();
    photoAbort.current = null;
    // Every generated video is thrown away together with its server copy.
    releaseVideoAssets(videoUrl, serverDownloadUrl);
    setIsGeneratingVideo(false);
    setIsConvertingVideo(false);
    setIsPreparingDownload(false);
    setIsLoadingPhotos(false);
    setVideoUrl("");
    setVideoBlob(null);
    setServerDownloadUrl("");
    setVideoError("");
    setVideoProgress(0);
    setVideoWinnerIndex(0);
  }

  function resetWinnerSlots() {
    setDisplayWinners([]);
    setSwapAlternates([]);
    setWinnerPhotos({});
  }

  function goHome() {
    if (animationTimer.current) clearTimeout(animationTimer.current);
    clearResultMedia();
    resetWinnerSlots();
    setIsSpinning(false);
    setStage("start");
    setFormError("");
  }

  function loadDemo() {
    clearResultMedia();
    resetWinnerSlots();
    const demoUrl = "https://www.instagram.com/p/C9zQx5JvRkA/";
    setUrlInput(demoUrl);
    setSourceUrl(demoUrl);
    setSourceMode("demo");
    setPostCaption("");
    setParticipants(DEMO_PARTICIPANTS.map((person) => ({ ...person })));
    setSourceMessage("Demonstração com comentários fictícios. Use-a para testar filtros, suplentes e a roleta sem conectar uma conta.");
    setImportText(serializeParticipants(DEMO_PARTICIPANTS));
    setShowImport(false);
    setImportError("");
    setSearchTerm("");
    setActiveTab("eligible");
    setWinnerCount(1);
    setAlternateCount(0);
    setDurationSeconds(8);
    setFindWinnerPhotos(true);
    setRemoveDuplicates(true);
    setPrizeEnabled(false);
    setPrizesText("");
    setMinMentions(0);
    setRequiredHashtag("");
    setRequiredMention("");
    setExcludedUsers("");
    setDrawOutcome(null);
    setDrawId("");
    setStage("setup");
    notify("Modo demonstração carregado — os perfis e comentários são fictícios.");
  }

  async function fetchCommentsOnce(
    url: string,
    commentsLimit: number,
    withReplies: boolean,
  ): Promise<ApiCommentsResponse> {
    const startResponse = await fetch("/api/instagram-comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, maxComments: commentsLimit, includeReplies: withReplies }),
    });
    const started = (await startResponse.json()) as ApiCommentsResponse;
    if (!startResponse.ok) {
      throw errorFromResponse(started, "Não foi possível iniciar a coleta.");
    }
    if (started.mode !== "apify_pending") return started;
    if (!started.runId) throw new Error("A Apify não retornou o identificador da coleta.");

    const deadline = Date.now() + 15 * 60 * 1000;
    let pollCount = 0;
    let transientFailures = 0;
    while (Date.now() < deadline) {
      await wait(pollCount < 6 ? 3000 : 5000);
      pollCount += 1;
      try {
        const pollResponse = await fetch(
          `/api/instagram-comments?runId=${encodeURIComponent(started.runId)}&maxComments=${commentsLimit}&includeReplies=${withReplies}`,
          { cache: "no-store" },
        );
        const data = (await pollResponse.json()) as ApiCommentsResponse;
        if (!pollResponse.ok) {
          // A finished run with a source error is final; a bare 5xx while
          // polling may be a transient serverless/network hiccup.
          if (data.sourceError || transientFailures >= 3) {
            throw errorFromResponse(data, "Não foi possível acompanhar a coleta na Apify.");
          }
          transientFailures += 1;
          continue;
        }
        transientFailures = 0;
        if (data.mode !== "apify_pending") return data;
      } catch (error) {
        if ((error as { data?: ApiCommentsResponse })?.data?.sourceError) throw error;
        transientFailures += 1;
        if (transientFailures > 3) throw error;
      }
    }

    throw new Error(
      "A coleta está demorando mais que o esperado. Ela pode continuar na Apify; tente atualizar em alguns minutos ou reduza o máximo de comentários.",
    );
  }

  async function collectComments(url: string): Promise<ApiCommentsResponse> {
    try {
      return await fetchCommentsOnce(url, maxComments, includeReplies);
    } catch (error) {
      if (!isRetryableCollectionError(error)) throw error;
      notify("A primeira leitura não retornou comentários. Tentando uma segunda leitura…");
      const retryUrl = alternatePostUrl(url);
      return fetchCommentsOnce(retryUrl, maxComments, true);
    }
  }

  async function analyzePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const normalized = normalizeInstagramPostUrl(urlInput);
    if (!normalized) {
      setFormError("Cole um link válido de publicação, Reel ou vídeo do Instagram.");
      return;
    }

    setIsLoading(true);
    try {
      const data = await collectComments(normalized);
      const received = mapApiParticipants(data.participants ?? [], "api");
      setUrlInput(data.url || normalized);
      setSourceUrl(data.url || normalized);
      setSourceMode(data.mode === "apify" ? "apify" : "manual");
      setPostCaption(data.postCaption || "");
      setParticipants(received);
      setSourceMessage(data.message || "Link reconhecido. Importe os comentários para continuar.");
      setImportText(serializeParticipants(received));
      setImportError("");
      setShowImport(received.length === 0);
      setSearchTerm("");
      setActiveTab("eligible");
      setDrawOutcome(null);
      setDrawId("");
      setStage("setup");
      if (received.length > 0) notify(`${received.length.toLocaleString("pt-BR")} comentários carregados.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não conseguimos consultar o serviço agora. Tente novamente ou carregue a demonstração.";
      setSourceUrl(normalized);
      setSourceMode("manual");
      setParticipants([]);
      setPostCaption("");
      setImportText("");
      setShowImport(true);
      setSourceMessage(`${message} Você pode continuar pela importação manual.`);
      setStage("setup");
    } finally {
      setIsLoading(false);
    }
  }

  function importParticipants() {
    const parsed = parseParticipantText(importText);
    if (parsed.participants.length === 0) {
      setImportError("Não encontramos usuários. Use uma linha por comentário: @usuario | texto do comentário.");
      return;
    }
    setParticipants(parsed.participants);
    setPostCaption("");
    setSourceMode("manual");
    setSourceMessage(
      `${parsed.participants.length.toLocaleString("pt-BR")} comentários importados manualmente.${parsed.ignored ? ` ${parsed.ignored} linha(s) foram ignoradas por não estarem no formato esperado.` : ""}`,
    );
    setImportError("");
    setShowImport(false);
    setActiveTab("eligible");
    setSearchTerm("");
    notify(`${parsed.participants.length.toLocaleString("pt-BR")} participações importadas.`);
  }

  async function refreshComments() {
    if (sourceMode === "demo") {
      notify("A lista de demonstração já está atualizada.");
      return;
    }
    if (!sourceUrl) return;
    const estimatedCap = collectionCapUsd(maxComments, includeReplies);
    const confirmed = window.confirm(
      `Esta atualização executará o Actor da Apify novamente. O teto de segurança desta execução é US$ ${estimatedCap.toFixed(3).replace(".", ",")}, e a cobrança real depende do seu plano e das linhas retornadas. Deseja continuar?`,
    );
    if (!confirmed) return;
    setIsRefreshing(true);
    try {
      const data = await collectComments(sourceUrl);
      if (data.mode === "apify") {
        const refreshed = mapApiParticipants(data.participants ?? [], "refresh");
        setParticipants(refreshed);
        setImportText(serializeParticipants(refreshed));
        setSourceMode("apify");
        setPostCaption(data.postCaption || "");
        setSourceMessage(data.message || "Comentários atualizados pelo Actor da Apify.");
        notify(`${refreshed.length.toLocaleString("pt-BR")} comentários atualizados.`);
      } else {
        setSourceMessage(data.message || "A coleta automática não está configurada neste ambiente.");
        notify("Configure a Apify ou importe uma lista atualizada.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível atualizar agora.";
      setSourceMessage(message);
      notify(message);
    } finally {
      setIsRefreshing(false);
    }
  }

  function confirmParticipants() {
    if (eligibleEntries.length === 0) {
      notify("Nenhum participante atende aos filtros escolhidos.");
      return;
    }
    if (uniqueEligibleCount < winnerCount + alternateCount) {
      notify("A quantidade de vencedores e suplentes ultrapassa o total de perfis elegíveis.");
      return;
    }
    clearResultMedia();
    resetWinnerSlots();
    setDrawOutcome(null);
    setDrawId("");
    setSaveError("");
    setRollIndex(secureRandomIndex(eligibleEntries.length));
    setCurrentRollName("");
    setStage("roulette");
  }

  async function saveOutcome(outcome: DrawOutcome, entryCount: number) {
    setIsSaving(true);
    setSaveError("");
    const settings: DrawSettings = {
      winnerCount,
      alternateCount,
      durationSeconds,
      removeDuplicates,
      prizeEnabled,
      minMentions,
      requiredHashtag: requiredHashtag.trim(),
      requiredMention: requiredMention.trim(),
    };
    try {
      const response = await fetch("/api/draws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl,
          participantCount: entryCount,
          winners: outcome.winners,
          alternates: outcome.alternates,
          settings,
        }),
      });
      const data = (await response.json()) as { draw?: { id: string; createdAt: string }; error?: string };
      if (!response.ok || !data.draw) throw new Error(data.error || "Falha ao registrar o resultado.");
      setDrawId(data.draw.id);
      const record: HistoryDraw = {
        id: data.draw.id,
        sourceUrl,
        participantCount: entryCount,
        winners: outcome.winners,
        createdAt: data.draw.createdAt,
      };
      setHistory((current) => [record, ...current.filter((item) => item.id !== record.id)].slice(0, 6));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "O resultado não pôde ser salvo no histórico.");
    } finally {
      setIsSaving(false);
    }
  }

  function loadWinnerPhotos(outcome: DrawOutcome) {
    photoAbort.current?.abort();
    const knownPhotos: Record<string, string> = {};
    for (const winner of outcome.winners) {
      const entry = eligibleEntries.find((person) => person.entryNumber === winner.entryNumber);
      if (entry?.profileImageUrl) knownPhotos[normalizeHandle(winner.username)] = entry.profileImageUrl;
    }
    setWinnerPhotos(knownPhotos);
    const missing = outcome.winners
      .map((winner) => normalizeHandle(winner.username))
      .filter((username) => !knownPhotos[username]);
    fetchPhotosFor(missing);
  }

  function fetchPhotosFor(usernames: string[]) {
    const unique = [...new Set(usernames.map(normalizeHandle).filter(Boolean))];
    if (!findWinnerPhotos || sourceMode === "demo" || !unique.length) {
      setIsLoadingPhotos(false);
      return;
    }

    photoAbort.current?.abort();
    const controller = new AbortController();
    photoAbort.current = controller;
    setIsLoadingPhotos(true);
    void fetch("/api/winner-photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: unique, confirmCost: true }),
      signal: controller.signal,
    })
      .then(async (response) => response.ok ? (await response.json()) as { photos?: Record<string, string> } : null)
      .then((data) => {
        if (controller.signal.aborted || !data?.photos) return;
        const valid = Object.fromEntries(
          Object.entries(data.photos).filter(([username, url]) => unique.includes(username) && typeof url === "string" && url.startsWith("/api/profile-image?url=")),
        );
        setWinnerPhotos((current) => ({ ...current, ...valid }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (photoAbort.current === controller) {
          photoAbort.current = null;
          setIsLoadingPhotos(false);
        }
      });
  }

  /**
   * Swap a substitute into the principal winner slot. The displaced winner
   * goes back to the substitutes list, so the swap can be undone by clicking
   * it again. Any video already generated is discarded first.
   */
  function promoteAlternate(person: DrawPerson) {
    if (!drawOutcome || !displayWinners.length) return;
    const poolIndex = swapAlternates.findIndex(
      (entry) => entry.entryNumber === person.entryNumber && entry.username === person.username,
    );
    if (poolIndex < 0) return;
    const displaced = displayWinners[0];
    if (displaced.entryNumber === person.entryNumber) return;

    const nextWinners = [...displayWinners];
    nextWinners[0] = person;
    const nextPool = [...swapAlternates];
    nextPool[poolIndex] = displaced;

    // Drop the animation/video made for the previous holder of the slot.
    clearResultMedia();
    setDisplayWinners(nextWinners);
    setSwapAlternates(nextPool);
    setVideoWinnerIndex(0);

    const handle = normalizeHandle(person.username);
    const knownPhoto =
      winnerPhotos[handle] ||
      eligibleEntries.find((entry) => entry.entryNumber === person.entryNumber)?.profileImageUrl;
    if (knownPhoto) {
      setWinnerPhotos((current) => ({ ...current, [handle]: knownPhoto }));
    } else {
      fetchPhotosFor([person.username]);
    }

    notify(`@${person.username} assumiu o lugar de @${displaced.username}. O vídeo anterior foi descartado; gere um novo quando quiser.`);
  }

  function startDraw() {
    if (isSpinning || eligibleEntries.length === 0) return;
    const entries: DrawPerson[] = eligibleEntries.map((person) => ({
      username: person.username,
      comment: person.comment,
      entryNumber: person.entryNumber,
    }));
    if (uniqueEligibleCount < winnerCount + alternateCount) {
      notify("Ajuste a quantidade de vencedores ou suplentes antes de sortear.");
      setStage("setup");
      return;
    }

    const outcome = chooseDraw(entries, winnerCount, alternateCount);
    setDrawOutcome(outcome);
    setDisplayWinners(outcome.winners);
    setSwapAlternates(outcome.alternates);
    setDrawId("");
    setSaveError("");
    setIsSpinning(true);
    setCurrentRollName("");
    loadWinnerPhotos(outcome);

    const totalSteps = 48;
    const holdMs = 850;
    const weights = Array.from({ length: totalSteps }, (_, step) => 1 + 3 * Math.pow(step / (totalSteps - 1), 2.5));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const rollingMs = Math.max(1000, durationSeconds * 1000 - holdMs);
    const winningIndex = Math.max(0, outcome.winners[0].entryNumber - 1);
    let animationIndex = (winningIndex - ((totalSteps - 1) % entries.length) + entries.length) % entries.length;

    const tick = (step: number) => {
      const nextIndex = animationIndex;
      animationIndex = (animationIndex + 1) % entries.length;
      setRollIndex(nextIndex);
      setCurrentRollName(entries[nextIndex].username);
      const delay = Math.max(30, Math.round((rollingMs * weights[step]) / totalWeight));

      if (step === totalSteps - 1) {
        animationTimer.current = setTimeout(() => {
          setIsSpinning(false);
          setStage("result");
          void saveOutcome(outcome, entries.length);
        }, delay + holdMs);
      } else {
        animationTimer.current = setTimeout(() => tick(step + 1), delay);
      }
    };
    tick(0);
  }

  function startAnotherDraw() {
    clearResultMedia();
    resetWinnerSlots();
    setDrawOutcome(null);
    setDrawId("");
    setSaveError("");
    setCurrentRollName("");
    setRollIndex(secureRandomIndex(Math.max(1, eligibleEntries.length)));
    setStage("roulette");
  }

  async function makeWinnerVideo() {
    if (!drawOutcome || isGeneratingVideo) return;
    const winner = displayWinners[videoWinnerIndex] ?? displayWinners[0];
    if (!winner) return;
    // Any previously generated file is discarded before a new render.
    releaseVideoAssets(videoUrl, serverDownloadUrl);
    const controller = new AbortController();
    videoAbort.current = controller;
    setVideoUrl("");
    setVideoBlob(null);
    setServerDownloadUrl("");
    setVideoError("");
    setVideoProgress(0);
    setIsGeneratingVideo(true);

    try {
      const video = await generateRaffleVideo({
        winner,
        entries: eligibleEntries.map((person) => ({
          username: person.username,
          comment: person.comment,
          entryNumber: person.entryNumber,
        })),
        photoUrl: winnerPhotos[normalizeHandle(winner.username)],
        durationSeconds,
        signal: controller.signal,
        onProgress: setVideoProgress,
      });
      if (controller.signal.aborted) return;
      let finalBlob = video.blob;
      let finalExtension = video.extension;
      if (video.extension === "webm") {
        setIsConvertingVideo(true);
        try {
          const response = await fetch("/api/export-video", {
            method: "POST",
            headers: { "Content-Type": "video/webm" },
            body: video.blob,
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("conversion-failed");
          const converted = await response.blob();
          if (!converted.size) throw new Error("empty-video");
          finalBlob = converted;
          finalExtension = "mp4";
        } catch {
          if (controller.signal.aborted) return;
          setVideoError("Não foi possível converter em MP4 agora. Você ainda pode baixar o vídeo em WebM.");
        } finally {
          if (videoAbort.current === controller) setIsConvertingVideo(false);
        }
      }
      if (controller.signal.aborted) return;
      setVideoExtension(finalExtension);
      setVideoBlob(finalBlob);
      setVideoUrl(URL.createObjectURL(finalBlob));
      notify(`Vídeo vertical ${finalExtension.toUpperCase()} pronto para baixar.`);
    } catch (error) {
      if (!controller.signal.aborted) {
        setVideoError(error instanceof Error ? error.message : "Não foi possível gerar o vídeo neste navegador.");
      }
    } finally {
      if (videoAbort.current === controller) {
        videoAbort.current = null;
        setIsGeneratingVideo(false);
      }
    }
  }

  async function downloadWinnerVideo() {
    if (!drawOutcome || !videoUrl || !videoBlob || isPreparingDownload) return;
    const name = `sorteio-super-connect-${(displayWinners[videoWinnerIndex] ?? displayWinners[0])?.username || "ganhador"}.${videoExtension}`;
    try {
      const anchor = document.createElement("a");
      anchor.href = videoUrl;
      anchor.download = name;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      // The HTTP fallback below remains available.
    }
    if (serverDownloadUrl) {
      notify("Download iniciado. Se necessário, use o link alternativo abaixo.");
      return;
    }

    setIsPreparingDownload(true);
    try {
      const response = await fetch("/api/video-download", {
        method: "POST",
        headers: { "Content-Type": videoBlob.type || `video/${videoExtension}` },
        body: videoBlob,
      });
      const data = (await response.json()) as { downloadUrl?: string; error?: string };
      if (!response.ok || !data.downloadUrl) throw new Error(data.error || "download-failed");
      setServerDownloadUrl(data.downloadUrl);
      notify("Download iniciado. Um link alternativo foi criado abaixo.");
    } catch {
      setVideoError("Se o download não começou, use “Abrir vídeo” e salve pelo menu do navegador.");
    } finally {
      setIsPreparingDownload(false);
    }
  }

  async function copyResult() {
    if (!drawOutcome) return;
    const lines = displayWinners.map((winner, index) => {
      const prize = prizeEnabled ? prizeList[index] : "";
      const substituted =
        index === 0 && drawOutcome.winners[0]?.entryNumber !== winner.entryNumber
          ? " (suplente assumiu o lugar do sorteado principal)"
          : "";
      return `${index + 1}º vencedor: @${winner.username}${prize ? ` — ${prize}` : ""} (entrada #${winner.entryNumber})${substituted}`;
    });
    const text = `🎉 Resultado do sorteio\n${lines.join("\n")}\nParticipações elegíveis: ${eligibleEntries.length}\nPublicação: ${sourceUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      notify("Resumo do sorteio copiado para a área de transferência.");
    } catch {
      notify("Não foi possível acessar a área de transferência neste navegador.");
    }
  }

  function downloadCsv() {
    if (!drawOutcome) return;
    const rows = [
      ["posição", "perfil", "número da entrada", "comentário", "prêmio"],
      ...displayWinners.map((winner, index) => [
        String(index + 1),
        `@${winner.username}`,
        String(winner.entryNumber),
        winner.comment,
        prizeEnabled ? (prizeList[index] || "") : "",
      ]),
      ...swapAlternates.map((person, index) => [
        `suplente ${index + 1}`,
        `@${person.username}`,
        String(person.entryNumber),
        person.comment,
        "",
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(";")).join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "resultado-sorteio-super-connect.csv";
    anchor.click();
    URL.revokeObjectURL(href);
    notify("Arquivo CSV do resultado baixado.");
  }

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("pt-BR");
    if (activeTab === "eligible") {
      return eligibleEntries.filter((person) => !term || `${person.username} ${person.comment}`.toLocaleLowerCase("pt-BR").includes(term));
    }
    return participants
      .map((person, index) => ({ ...person, entryNumber: eligibleById.get(person.id)?.entryNumber, originalIndex: index }))
      .filter((person) => !term || `${person.username} ${person.comment}`.toLocaleLowerCase("pt-BR").includes(term));
  }, [activeTab, eligibleEntries, eligibleById, participants, searchTerm]);

  const appClass = stage === "roulette" || stage === "result" ? "app-shell app-shell--bright" : "app-shell";

  return (
    <div className={appClass}>
      {stage === "result" && <Confetti />}
      <div className="page-container">
        <header className="topbar">
          <Brand onHome={goHome} />
          <div className="topbar-right">
            {stage === "start" && <a className="topbar-link" href="#como-funciona">Como funciona</a>}
            {(stage === "roulette" || stage === "result") && <button type="button" className="topbar-link back-button" onClick={() => {
              if (animationTimer.current) clearTimeout(animationTimer.current);
              clearResultMedia();
              setIsSpinning(false);
              setStage("setup");
            }} disabled={isSpinning}>Voltar às regras</button>}
            <span className="topbar-pill"><span className="live-dot" /> Sorteio transparente</span>
          </div>
        </header>
      </div>

      {stage === "start" && (
        <main className="page-main">
          <div className="page-container">
            <section className="hero-simple">
              <p className="eyebrow"><span className="eyebrow-dot" /> Super Connect · Central de sorteios</p>
              <h1>Sorteio de comentários <span>do Instagram</span></h1>
              <p>Informe o link da publicação para coletar os comentários, configurar as regras e realizar o sorteio.</p>
            </section>

            <section className="main-grid" aria-label="Começar um sorteio">
              <div className="surface-card link-card">
                <p className="section-kicker"><span className="section-kicker-number">01</span> Comece por aqui</p>
                <h2 className="card-title">Qual publicação vai sortear?</h2>
                <p className="card-description">Cole o link do post ou Reel. Vamos reconhecer o endereço e preparar a lista de participantes.</p>
                <form className="link-form" onSubmit={analyzePost}>
                  <label className="field-label" htmlFor="instagram-link">Link da publicação do Instagram</label>
                  <div className="link-input-row">
                    <div className="link-input-wrap">
                      <span className="input-icon"><Icon name="instagram" size={20} /></span>
                      <input
                        id="instagram-link"
                        className="link-input"
                        type="text"
                        inputMode="url"
                        autoComplete="url"
                        placeholder="instagram.com/p/…"
                        value={urlInput}
                        onChange={(event) => {
                          setUrlInput(event.target.value);
                          if (formError) setFormError("");
                        }}
                        aria-describedby="link-help link-error"
                      />
                    </div>
                    <button className="primary-button" type="submit" disabled={isLoading}>
                      {isLoading ? <>Coletando <LoadingDots /></> : <>Coletar comentários <Icon name="arrowRight" size={16} /></>}
                    </button>
                  </div>
                  <div className="collection-options">
                    <label className="collection-limit" htmlFor="max-comments"><span>Máximo de comentários principais</span><input id="max-comments" type="number" min={20} max={5000} step={10} value={maxComments} onChange={(event) => setMaxComments(Math.min(5000, Math.max(20, Number(event.target.value) || 20)))} /></label>
                    <label className="collection-replies"><input type="checkbox" checked={includeReplies} onChange={(event) => setIncludeReplies(event.target.checked)} /><span><strong>Incluir respostas</strong><small>Mesma tarifa por linha</small></span></label>
                  </div>
                  <p className="cost-note"><Icon name="info" size={13} /><span>Execução pelo Actor <strong>Chronometrica</strong> na Apify. Cobrança por comentário/resposta salvo, sem taxa de início. Teto de segurança desta coleta: <strong>US$ {collectionCapUsd(maxComments, includeReplies).toFixed(3).replace(".", ",")}</strong> (com margem sobre a tarifa por linha; com respostas, o limite é de comentários principais e as respostas são linhas separadas); o valor real depende do seu plano.</span></p>
                  {formError && <p className="error-text" id="link-error" role="alert">{formError}</p>}
                  <div className="form-actions">
                    <button className="demo-button" type="button" onClick={loadDemo}><Icon name="play" size={14} /> Testar com uma demonstração</button>
                    <span className="form-help" id="link-help"><Icon name="shield" size={13} /> Publicações e Reels públicos, sem login no Instagram.</span>
                  </div>
                </form>
                <p className="source-note"><Icon name="info" size={13} /> Comentários ocultos ou filtrados pelo Instagram não são retornados. A importação manual continua disponível.</p>
              </div>

              <aside className="side-stack">
                <section className="surface-card steps-card" id="como-funciona">
                  <div className="card-heading-row">
                    <h2 className="card-heading-small">Do link ao ganhador</h2>
                    <span className="card-heading-side">3 passos</span>
                  </div>
                  <ol className="steps-list">
                    <li className="step-item"><span className="step-index">01</span><span className="step-copy"><strong>Adicione a publicação</strong><span>Use o link do Instagram ou a demonstração.</span></span></li>
                    <li className="step-item"><span className="step-index">02</span><span className="step-copy"><strong>Defina as regras</strong><span>Revise os comentários e aplique filtros.</span></span></li>
                    <li className="step-item"><span className="step-index">03</span><span className="step-copy"><strong>Gire e anuncie</strong><span>Veja os vencedores e salve o resultado.</span></span></li>
                  </ol>
                </section>
                <section className="surface-card history-card">
                  <div className="history-heading">
                    <span className="history-title-wrap"><span className="history-icon"><Icon name="history" size={15} /></span><h2 className="card-heading-small">Últimos sorteios</h2></span>
                    <span className="card-heading-side">Histórico local</span>
                  </div>
                  {history.length ? (
                    <div className="history-list">
                      {history.slice(0, 3).map((draw) => {
                        const firstWinner = draw.winners?.[0];
                        return (
                          <div className="history-row" key={draw.id}>
                            <span className="history-avatar" style={avatarStyle(firstWinner?.username || "Sorteio")}>{initials(firstWinner?.username || "SL")}</span>
                            <span className="history-row-copy"><strong>{firstWinner ? `@${firstWinner.username}` : "Sorteio concluído"}</strong><span>{formatDate(draw.createdAt)} · {draw.participantCount} participantes</span></span>
                            <span className="history-count">#{draw.id.slice(0, 4).toUpperCase()}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="history-empty">Seus resultados salvos aparecerão aqui depois do primeiro sorteio.</p>
                  )}
                </section>
              </aside>
            </section>

            <footer className="home-footer">
              <span className="home-footer-note"><Icon name="shield" size={13} /> A lista completa fica nesta sessão; o histórico salva apenas o resultado.</span>
              <span className="home-footer-note">Super Connect <span aria-hidden="true">·</span> AL · SE · PE</span>
            </footer>
          </div>
        </main>
      )}

      {stage === "setup" && (
        <main className="page-container workbench">
          <div className="workbench-head">
            <button type="button" className="back-button" onClick={goHome}><Icon name="arrowLeft" size={16} /> Alterar publicação</button>
            <div className="progress-wrap" aria-label="Etapa 2 de 3">
              <div className="progress-step progress-step--done"><span><Icon name="check" size={12} /></span> Publicação</div>
              <span className="progress-line" />
              <div className="progress-step progress-step--active"><span>02</span> Participantes</div>
              <span className="progress-line" />
              <div className="progress-step"><span>03</span> Sorteio</div>
            </div>
          </div>
          <div className="workbench-intro">
            <div>
              <h1>Confira sua lista e suas regras.</h1>
              <p>Veja quem está elegível, ajuste os critérios e escolha quantas pessoas serão sorteadas.</p>
            </div>
            <a className="source-tag" href={sourceUrl || "#"} target="_blank" rel="noreferrer"><Icon name="instagram" size={13} /> {sourceUrl.replace(/^https:\/\//, "") || "Publicação do Instagram"} <Icon name="external" size={12} /></a>
          </div>

          <div className="setup-grid">
            <aside className="settings-panel">
              <div className="panel-heading">
                <div><h2 className="panel-title">Regras do sorteio</h2><p className="panel-subtitle">Ajuste antes de iniciar a roleta.</p></div>
                <span className="panel-heading-icon"><Icon name="sliders" size={17} /></span>
              </div>

              <div className="setting-section" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
                <div className="setting-heading"><strong>Quantos nomes saem?</strong><span>Por perfil</span></div>
                <NumberStepper title="Vencedores" description="Pessoas premiadas" value={winnerCount} min={1} max={maxWinners} onChange={(value) => {
                  setWinnerCount(value);
                  setAlternateCount((current) => Math.min(current, Math.max(0, uniqueEligibleCount - value)));
                }} />
                <NumberStepper title="Suplentes" description="Reserva caso alguém não cumpra as regras" value={alternateCount} min={0} max={maxAlternates} onChange={setAlternateCount} />
              </div>

              <div className="setting-section">
                <div className="setting-heading"><strong>Participação</strong><span>Regras básicas</span></div>
                <div className="toggle-list">
                  <Toggle title="Remover comentários repetidos" description="Cada perfil participa uma única vez." checked={removeDuplicates} onChange={setRemoveDuplicates} />
                  <Toggle title="Definir prêmios" description="Associe um prêmio a cada vencedor." checked={prizeEnabled} onChange={setPrizeEnabled} />
                  <Toggle title="Buscar foto dos ganhadores" description={sourceMode === "demo" ? "Na demonstração, não há busca de fotos." : "Consulta de perfil pela Apify: até US$ 0,02 por sorteio. Sem foto disponível, nenhuma imagem será exibida."} checked={findWinnerPhotos} onChange={setFindWinnerPhotos} />
                </div>
                {prizeEnabled && (
                  <div className="prize-fields">
                    <label className="field-label" htmlFor="prizes-list">Prêmios · um por linha</label>
                    <textarea id="prizes-list" className="text-area" value={prizesText} onChange={(event) => setPrizesText(event.target.value)} placeholder={"1º lugar — Kit especial\n2º lugar — Vale-presente"} />
                  </div>
                )}
              </div>

              <div className="setting-section">
                <div className="setting-heading"><strong>Filtros avançados</strong><span>Aplicados na lista</span></div>
                <div className="filter-grid">
                  <div className="filter-field"><label htmlFor="min-mentions">Mínimo de marcações</label><input id="min-mentions" className="small-input" type="number" min={0} max={20} value={minMentions} onChange={(event) => setMinMentions(Math.min(20, Math.max(0, Number(event.target.value) || 0)))} /></div>
                  <div className="filter-field"><label htmlFor="required-hashtag">Exigir hashtag</label><input id="required-hashtag" className="small-input" type="text" value={requiredHashtag} onChange={(event) => setRequiredHashtag(event.target.value)} placeholder="#sorteio" /></div>
                  <div className="filter-field"><label htmlFor="required-mention">Exigir @menção</label><input id="required-mention" className="small-input" type="text" value={requiredMention} onChange={(event) => setRequiredMention(event.target.value)} placeholder="@perfil" /></div>
                  <div className="filter-field"><label htmlFor="excluded-users">Perfis excluídos</label><input id="excluded-users" className="small-input" type="text" value={excludedUsers} onChange={(event) => setExcludedUsers(event.target.value)} placeholder="perfil1, perfil2" /></div>
                </div>
              </div>

              <div className="setting-section">
                <div className="setting-heading"><strong>Suspense da roleta</strong><span>Tempo de animação</span></div>
                <NumberStepper title="Duração" description="Segundos até revelar o resultado" value={durationSeconds} min={6} max={20} onChange={setDurationSeconds} />
              </div>

              <div className="settings-bottom">
                <button className="primary-button settings-cta" type="button" onClick={confirmParticipants} disabled={!eligibleEntries.length || uniqueEligibleCount < winnerCount + alternateCount}>
                  Confirmar e ir para a roleta <Icon name="arrowRight" size={16} />
                </button>
                <p className="settings-hint">{eligibleEntries.length ? `${eligibleEntries.length} entrada(s) elegível(is) · ${uniqueEligibleCount} perfil(is) único(s)` : "Ajuste os filtros ou importe comentários para continuar."}</p>
              </div>
            </aside>

            <section className="participant-panel" aria-labelledby="participants-title">
              <div className="participants-head">
                <div className="participants-title-row">
                  <div className="participants-title">
                    <span className="participants-title-icon"><Icon name="users" size={17} /></span>
                    <span><h2 id="participants-title">Pessoas na disputa</h2><p>{participants.length.toLocaleString("pt-BR")} comentário(s) recebidos</p></span>
                  </div>
                  <span className="participant-count" aria-label={`${eligibleEntries.length} participantes elegíveis`}>{eligibleEntries.length}<small>elegíveis</small></span>
                </div>
                <div className="participant-toolbar">
                  <div className="tabs" role="tablist" aria-label="Filtrar participantes">
                    <button type="button" className={`tab-button ${activeTab === "eligible" ? "tab-button--active" : ""}`} role="tab" aria-selected={activeTab === "eligible"} onClick={() => setActiveTab("eligible")}>Elegíveis · {eligibleEntries.length}</button>
                    <button type="button" className={`tab-button ${activeTab === "all" ? "tab-button--active" : ""}`} role="tab" aria-selected={activeTab === "all"} onClick={() => setActiveTab("all")}>Todos · {participants.length}</button>
                  </div>
                  <div className="search-box"><Icon name="search" size={14} /><input aria-label="Buscar participante" type="search" placeholder="Buscar perfil ou comentário" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></div>
                  <button type="button" className="icon-button" aria-label="Atualizar comentários" title="Atualizar comentários" onClick={refreshComments} disabled={isRefreshing}>
                    <Icon name="refresh" size={15} />
                  </button>
                </div>
              </div>

              {sourceMessage && <div className="status-banner" role="status"><Icon name={sourceMode === "apify" ? "checkCircle" : "info"} size={15} /><span>{sourceMessage}</span></div>}

              {showImport && (
                <div className="import-area">
                  <div className="import-head"><span><strong>Importar comentários</strong><span>Uma participação por linha, com o usuário e o texto.</span></span><Icon name="upload" size={16} /></div>
                  <label className="field-label" htmlFor="manual-comments">Comentários da publicação</label>
                  <textarea id="manual-comments" className="text-area" value={importText} onChange={(event) => {
                    setImportText(event.target.value);
                    if (importError) setImportError("");
                  }} placeholder={"@ana | Estou participando! @amiga #sorteio\n@pedro | Quero muito ganhar 🍀\n@bia | Boa sorte a todos"} aria-describedby="import-format import-error" />
                  <div className="import-controls">
                    <span className="import-note" id="import-format">Formatos aceitos: <strong>@usuario | comentário</strong>, @usuario, ou @usuario, comentário.</span>
                    <button type="button" className="primary-button import-button" onClick={importParticipants}><Icon name="check" size={14} /> Carregar lista</button>
                  </div>
                  {importError && <p className="error-text" id="import-error" role="alert">{importError}</p>}
                </div>
              )}

              <div className="list-toolbar">
                <p>Mostrando <strong>{filteredRows.length.toLocaleString("pt-BR")}</strong> {activeTab === "eligible" ? "entrada(s) elegível(is)" : "comentário(s)"}{searchTerm ? " para esta busca" : ""}</p>
                <button type="button" className="import-toggle" onClick={() => {
                  setShowImport((current) => !current);
                  setImportError("");
                  if (!showImport && participants.length > 0) setImportText(serializeParticipants(participants));
                }}>{showImport ? "Fechar importação" : participants.length ? "Editar lista" : "Importar comentários"}</button>
              </div>

              {filteredRows.length > 0 ? (
                <div className="participant-list" role="list" aria-label="Comentários participantes">
                  {filteredRows.map((person, index) => {
                    const eligible = activeTab === "eligible" || typeof person.entryNumber === "number";
                    const entryNumber = activeTab === "eligible" ? person.entryNumber : person.entryNumber;
                    return (
                      <div className={`participant-row ${eligible ? "" : "participant-row--filtered"}`} role="listitem" key={person.id}>
                        <span className="participant-copy">
                          <span className="participant-copy-head"><strong className="participant-user">@{person.username}</strong><span className="participant-entry">{typeof entryNumber === "number" ? `#${String(entryNumber).padStart(2, "0")}` : ""}</span></span>
                          <span className="participant-comment">{person.comment || "Comentário importado"}</span>
                          {(person.isReply || typeof person.likes === "number" || typeof person.repliesCount === "number" || person.timestamp) && <span className="participant-meta">
                            {person.isReply && <span className="reply-label">Resposta</span>}
                            {typeof person.likes === "number" && <span><Icon name="heart" size={9} /> {person.likes.toLocaleString("pt-BR")}</span>}
                            {typeof person.repliesCount === "number" && <span><Icon name="message" size={9} /> {person.repliesCount.toLocaleString("pt-BR")}</span>}
                            {person.timestamp && <span>{formatDate(person.timestamp)}</span>}
                          </span>}
                        </span>
                        {activeTab === "all" && !eligible && <span className="tiny-pill" aria-label="Filtrado">—</span>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <div><span className="empty-state-icon"><Icon name={participants.length ? "search" : "upload"} size={20} /></span><h3>{participants.length ? "Nenhum participante encontrado" : "Sua lista começa aqui"}</h3><p>{participants.length ? "Tente outro termo de busca ou ajuste os filtros do sorteio." : "A importação manual é uma alternativa segura quando a API do Instagram não está conectada."}</p>{!participants.length && !showImport && <button type="button" className="secondary-button" onClick={() => setShowImport(true)}>Importar comentários</button>}</div>
                </div>
              )}
            </section>
          </div>
        </main>
      )}

      {stage === "roulette" && (
        <main className="arena-container">
          <div className="arena-topline">
            <button type="button" className="back-button" onClick={() => {
              if (animationTimer.current) clearTimeout(animationTimer.current);
              setIsSpinning(false);
              setStage("setup");
            }} disabled={isSpinning}><Icon name="arrowLeft" size={15} /> Editar regras</button>
            <span className="arena-chip"><span className="live-dot" /> {eligibleEntries.length.toLocaleString("pt-BR")} participações</span>
          </div>
          <div className="arena-heading">
            <p className="arena-eyebrow"><span className="eyebrow-dot" /> {isSpinning ? "Sorteio em andamento" : "Tudo pronto para sortear"}</p>
            <h1 className="arena-title">A sorte está <span>em jogo.</span></h1>
            <p className="arena-subtitle">A escolha é aleatória. A roleta passa pelos nomes e desacelera até revelar quem ganhou.</p>
            <div className="arena-meta">
              <span className="arena-chip"><Icon name="users" size={13} /> {uniqueEligibleCount} perfis únicos</span>
              <span className="arena-chip"><Icon name="trophy" size={13} /> {winnerCount} vencedor(es)</span>
              {alternateCount > 0 && <span className="arena-chip"><Icon name="shield" size={13} /> {alternateCount} suplente(s)</span>}
            </div>
          </div>

          <div className="roulette-machine" aria-label={isSpinning ? "Roleta em movimento" : "Prévia da roleta"}>
            <div className="machine-orbit" />
            <span className="machine-side-label machine-side-label--left">Sorteio aleatório</span>
            <span className="machine-side-label machine-side-label--right">{isSpinning ? "Girando" : "Boa sorte"}</span>
            <div className="roulette-list" aria-live="polite" aria-atomic="true">
              {[-3, -2, -1, 0, 1, 2, 3].map((offset) => {
                const candidateIndex = (rollIndex + offset + eligibleEntries.length * 10) % Math.max(1, eligibleEntries.length);
                const candidate = eligibleEntries[candidateIndex];
                const active = offset === 0;
                const distance = Math.abs(offset);
                const className = `roulette-item ${active ? "roulette-item--active" : `roulette-item--outer-${distance}`} ${isSpinning ? "roulette-item--rolling" : ""}`;
                const name = active ? currentRollName : candidate?.username || "participante";
                return (
                  <div className={className} key={`${offset}-${candidate?.id ?? "empty"}`}>
                    <span className="roulette-number">{active ? (isSpinning ? "SORTEANDO" : "SUA VEZ") : `#${String(candidate?.entryNumber || candidateIndex + 1).padStart(2, "0")}`}</span>
                    <span className={`roulette-name ${active && !name ? "roulette-question" : ""}`}>{name ? `@${name}` : "?"}</span>
                    <span className="roulette-live-dot" />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="spin-controls">
            <p className="spin-status" aria-live="polite">{isSpinning ? "Nomes passando… respire fundo." : "Pronto para descobrir quem vai levar?"}</p>
            <button type="button" className="spin-button" onClick={startDraw} disabled={isSpinning || !eligibleEntries.length}>
              {isSpinning ? <><span className="loading-dots"><span /><span /><span /></span> A roleta está girando</> : <><Icon name="refresh" size={18} /> Girar a roleta</>}
            </button>
            <p className="spin-terms"><Icon name="shield" size={13} /> Cada entrada recebe um número. A seleção usa aleatoriedade criptográfica do navegador; a animação só revela o resultado.</p>
          </div>
        </main>
      )}

      {stage === "result" && drawOutcome && (
        <main className="result-container result-redesign">
          <div className="result-topline">
            <button type="button" className="back-button" onClick={() => { clearResultMedia(); setStage("setup"); }}><Icon name="arrowLeft" size={15} /> Ver participantes</button>
            <span className="result-badge"><Icon name="checkCircle" size={14} /> {sourceMode === "demo" ? "Demonstração" : "Sorteio concluído"}</span>
          </div>

          <div className="result-intro">
            <p className="result-kicker"><span className="eyebrow-dot" /> SORTEIO SUPER CONNECT</p>
            <h1>A sorte tem <span>{drawOutcome.winners.length === 1 ? "um ganhador." : "seus ganhadores."}</span></h1>
            <p>O grande momento chegou. Confira {drawOutcome.winners.length === 1 ? "quem foi sorteado" : "quem foram os sorteados"} e compartilhe essa conquista.</p>
          </div>

          <div className="result-layout">
            <section className="result-winners" aria-label="Vencedores do sorteio">
              <div className="result-section-heading"><div><span>O MOMENTO DA SORTE</span><h2>{drawOutcome.winners.length === 1 ? "Pessoa sorteada" : "Pessoas sorteadas"}</h2></div><span className="result-winner-count">{String(drawOutcome.winners.length).padStart(2, "0")}</span></div>
              <div className="result-winner-list">
                {displayWinners.map((winner, index) => {
                  const photo = winnerPhotos[normalizeHandle(winner.username)];
                  const isSubstitute =
                    index === 0 && drawOutcome.winners[0]?.entryNumber !== winner.entryNumber;
                  return (
                    <article className="winner-share-card" key={`${winner.username}-${winner.entryNumber}`}>
                      <div className="winner-share-top"><span><Icon name="spark" size={15} /> SUPER CONNECT</span><span>{sourceMode === "demo" ? "DEMONSTRAÇÃO" : isSubstitute ? "SUPLENTE EM POSSE" : "SORTEIO FINALIZADO"}</span></div>
                      <div className="winner-share-body">
                        <span className="winner-share-label">{displayWinners.length > 1 ? `GANHADOR(A) ${String(index + 1).padStart(2, "0")}` : "GANHADOR(A) DO SORTEIO"}</span>
                        {isSubstitute && <span className="winner-swap-badge"><Icon name="shield" size={12} /> Suplente assumiu o lugar do sorteado principal</span>}
                        {photo && <WinnerPhoto key={photo} src={photo} username={winner.username} />}
                        <h3>@{winner.username}</h3>
                        {prizeEnabled && prizeList[index] && <span className="winner-share-prize"><Icon name="gift" size={13} /> {prizeList[index]}</span>}
                        <div className="winner-share-divider" />
                        <span className="winner-comment-label">COMENTÁRIO SORTEADO</span>
                        <blockquote>{winner.comment || "Comentário selecionado no sorteio."}</blockquote>
                      </div>
                      <div className="winner-share-bottom"><span>@superconnectbr</span><span>ENTRADA #{String(winner.entryNumber).padStart(2, "0")}</span></div>
                    </article>
                  );
                })}
              </div>
              {isLoadingPhotos && <p className="photo-status" role="status"><LoadingDots /> Buscando a foto pública do perfil. Se não estiver disponível, o resultado ficará sem imagem.</p>}
            </section>

            <aside className="reel-panel" aria-labelledby="video-title">
              <div className="reel-panel-heading"><span className="reel-icon"><Icon name="instagram" size={20} /></span><span><strong>PARA COMPARTILHAR</strong><small>Stories & Reels</small></span></div>
              <div className={`reel-preview ${videoUrl ? "reel-preview--video" : ""}`}>
                {videoUrl ? <video src={videoUrl} controls playsInline preload="metadata" aria-label="Prévia do vídeo do sorteio" /> : <div className="reel-preview-art"><span>SUPER CONNECT</span><strong>Chegou a hora de<br /><em>descobrir o nosso ganhador.</em></strong><div>@{displayWinners[videoWinnerIndex]?.username}</div><small>1080 × 1920</small></div>}
              </div>
              <div className="reel-copy">
                <h2 id="video-title">Seu sorteio em vídeo.</h2>
                <p>Crie uma animação vertical com a roleta e o comentário do ganhador, pronta para compartilhar.</p>
                {displayWinners.length > 1 && <label className="video-select-label" htmlFor="video-winner">Ganhador do vídeo<select id="video-winner" value={videoWinnerIndex} disabled={isGeneratingVideo} onChange={(event) => { clearResultMedia(); setVideoWinnerIndex(Number(event.target.value)); }}>
                  {displayWinners.map((winner, index) => <option value={index} key={`${winner.username}-${index}`}>@{winner.username}</option>)}
                </select></label>}
                {isGeneratingVideo ? <div className="video-progress" role="status"><div><span>{isConvertingVideo ? "Convertendo para MP4" : "Preparando seu vídeo"}</span><strong>{isConvertingVideo ? "Aguarde" : `${videoProgress}%`}</strong></div>{isConvertingVideo ? <progress max={100} /> : <progress value={videoProgress} max={100} />}<small>Mantenha esta aba aberta até finalizar.</small></div> : videoUrl ? <div className="video-ready-actions"><button className="primary-button reel-action" type="button" onClick={() => void downloadWinnerVideo()} disabled={isPreparingDownload}><Icon name="download" size={16} /> {isPreparingDownload ? "Preparando download…" : `Baixar vídeo ${videoExtension.toUpperCase()}`}</button>{serverDownloadUrl && <a className="reel-regenerate" href={serverDownloadUrl} download={`sorteio-super-connect.${videoExtension}`}><Icon name="download" size={13} /> Link alternativo de download</a>}<a className="reel-regenerate" href={videoUrl} target="_blank" rel="noreferrer"><Icon name="external" size={13} /> Abrir vídeo para compartilhar</a><button className="reel-regenerate" type="button" onClick={() => void makeWinnerVideo()}><Icon name="refresh" size={13} /> Gerar novamente</button></div> : <button className="primary-button reel-action" type="button" onClick={() => void makeWinnerVideo()}><Icon name="play" size={16} /> Gerar vídeo vertical <Icon name="arrowRight" size={15} /></button>}
                {videoError && <p className="video-error" role="alert">{videoError}</p>}
                {videoUrl && videoExtension === "webm" && <p className="video-note">Este navegador gerou WebM. Para MP4, tente Chrome, Edge ou Safari atualizado.</p>}
                <p className="video-note"><Icon name="info" size={12} /> A animação recria o resultado já sorteado e não tem áudio. Se necessário, o vídeo é convertido em MP4 no servidor e os arquivos temporários são apagados.</p>
              </div>
            </aside>
          </div>

          {swapAlternates.length > 0 && (
            <section className="alternate-panel alternate-panel--interactive">
              <h2>Suplentes sorteados</h2>
              <p>
                Clique em um suplente para ele assumir o lugar do ganhador principal na tela e no vídeo.
                O vídeo já gerado é apagado na troca e pode ser gerado novamente.
              </p>
              <div className="alternate-list">
                {swapAlternates.map((person, index) => {
                  const isOriginalWinner = drawOutcome.winners.some(
                    (winner) => winner.entryNumber === person.entryNumber,
                  );
                  return (
                    <button
                      type="button"
                      className={`alternate-chip alternate-chip--action${isOriginalWinner ? " alternate-chip--original" : ""}`}
                      key={`${person.username}-${person.entryNumber}`}
                      onClick={() => promoteAlternate(person)}
                      aria-label={`Colocar @${person.username} no lugar do ganhador principal`}
                      title="Clique para colocar no lugar do ganhador principal"
                    >
                      <span>{isOriginalWinner ? <Icon name="trophy" size={11} /> : String(index + 1).padStart(2, "0")}</span>
                      @{person.username} · entrada #{String(person.entryNumber).padStart(2, "0")}
                      <em>{isOriginalWinner ? "voltar ao lugar" : "assumir o lugar"}</em>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <details className="result-details"><summary><span><Icon name="shield" size={15} /> Detalhes do sorteio</span><span>＋</span></summary><p>A seleção foi feita aleatoriamente antes da animação, entre as entradas elegíveis.</p><div className="audit-grid"><div className="audit-cell"><span>Entradas elegíveis</span><strong>{eligibleEntries.length.toLocaleString("pt-BR")}</strong></div><div className="audit-cell"><span>Perfis únicos</span><strong>{uniqueEligibleCount.toLocaleString("pt-BR")}</strong></div><div className="audit-cell"><span>Número em exibição</span><strong>#{String(displayWinners[0]?.entryNumber || 0).padStart(2, "0")}</strong></div></div></details>

          <div className="result-actions result-secondary-actions">
            <button type="button" className="action-button" onClick={() => void copyResult()}><Icon name="copy" size={15} /> Copiar resultado</button>
            <button type="button" className="action-button" onClick={downloadCsv}><Icon name="download" size={15} /> Baixar CSV</button>
            <button type="button" className="action-button" onClick={startAnotherDraw}><Icon name="refresh" size={15} /> Nova rodada</button>
          </div>
          <p className={`save-status ${saveError ? "save-status--error" : ""}`} role="status">{isSaving ? "Registrando o resultado no histórico…" : saveError ? `${saveError} O resultado continua disponível nesta sessão.` : drawId ? "Resultado salvo no histórico." : "Resultado calculado; aguardando registro."}</p>
        </main>
      )}

      {toast && <div className="toast" role="status"><Icon name="checkCircle" size={16} /> {toast}</div>}
    </div>
  );
}

function LoadingDots() {
  return <span className="loading-dots" aria-hidden="true"><span /><span /><span /></span>;
}

function Confetti() {
  const colors = ["#d8ff00", "#27e456", "#fff07a", "#75f59b", "#98e600", "#ffffff"];
  return (
    <div className="confetti-layer" aria-hidden="true">
      {Array.from({ length: 48 }, (_, index) => (
        <span
          className="confetti-piece"
          key={index}
          style={{
            "--left": `${(index * 37) % 100}%`,
            "--size": `${4 + (index % 4) * 2}px`,
            "--color": colors[index % colors.length],
            "--duration": `${3.4 + (index % 8) * 0.32}s`,
            "--delay": `${(index % 11) * 0.08}s`,
            "--drift": `${(index % 2 === 0 ? 1 : -1) * (24 + (index % 7) * 13)}px`,
            "--spin": `${160 + (index % 5) * 110}deg`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
