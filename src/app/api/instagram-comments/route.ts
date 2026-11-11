import { normalizeInstagramPostUrl } from "@/lib/instagram";
import { profileImageProxy } from "@/lib/profile-image";

export const dynamic = "force-dynamic";
// Each request now only starts a run or checks its status, so individual
// serverless invocations stay short even when the Actor takes minutes.
export const maxDuration = 60;

const ACTOR_ID = "chronometrica~instagram-comments-scraper";
const ACTOR_NAME = "chronometrica/instagram-comments-scraper";
const APIFY_API = "https://api.apify.com/v2";
const MAX_COMMENTS = 5000;
const MAX_REPLIES_PER_COMMENT = 10;
// Chronometrica pricing is per saved comment/reply row, with no start fee.
// The highest published price is US$ 0.0020 per row (Free tier). We cap with
// headroom so a low cap cannot stop the run early; this is a safety limit,
// not the expected charge.
const PER_ROW_CAP_USD = 0.0022;
const RUN_BUFFER_USD = 0.01;

type ParticipantDto = {
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

type SourceError = { code?: string; message?: string };

type ApifyRun = {
  id?: string;
  status?: string;
  statusMessage?: string;
  defaultDatasetId?: string;
  defaultKeyValueStoreId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getToken(): string | null {
  return process.env.APIFY_API_TOKEN?.trim() || process.env.APIFY_TOKEN?.trim() || null;
}

function manualResult(url: string, message: string) {
  return Response.json({ mode: "manual", url, participants: [], message });
}

function safeInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_COMMENTS, Math.max(1, Math.floor(parsed)));
}

function chargeCapUsd(maxComments: number, includeReplies: boolean): number {
  // maxCommentsPerPost limits top-level comments. Replies are separate paid
  // rows (up to MAX_REPLIES_PER_COMMENT under each saved parent), so the
  // charge cap must consider that documented worst case.
  const maxRows = maxComments * (includeReplies ? 1 + MAX_REPLIES_PER_COMMENT : 1);
  return Math.max(0.05, Number((maxRows * PER_ROW_CAP_USD + RUN_BUFFER_USD).toFixed(4)));
}

function actorInput(url: string, maxComments: number, includeReplies: boolean) {
  // Chronometrica's native, documented schema.
  return {
    postUrls: [url],
    maxCommentsPerPost: maxComments,
    includeReplies,
    maxRepliesPerComment: MAX_REPLIES_PER_COMMENT,
    commentSortMode: "default",
    collectAllAvailable: false,
  };
}

async function apifyJson(
  token: string,
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<{ response: Response; payload: unknown }> {
  const { timeoutMs = 30_000, ...requestInit } = init ?? {};
  const response = await fetch(`${APIFY_API}${path}`, {
    ...requestInit,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(requestInit.body ? { "Content-Type": "application/json" } : {}),
      ...requestInit.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  return { response, payload };
}

function apifyErrorMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const error = payload.error;
  if (isRecord(error) && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim().slice(0, 300);
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim().slice(0, 300);
  }
  return undefined;
}

function httpError(status: number, detail?: string): Response {
  const message =
    status === 401 || status === 403
      ? "A Apify recusou o token configurado na Vercel. Confira se a variável APIFY_API_TOKEN (ou APIFY_TOKEN) está no ambiente Production e se o site foi publicado novamente depois de salvá-la."
      : status === 402
        ? "A Apify não iniciou a coleta por saldo/limite da conta. Verifique os créditos e o plano da conta dona do token."
        : status === 404
          ? "A Apify não encontrou esta execução. Inicie uma nova coleta."
          : `A Apify não conseguiu atender a coleta agora${detail ? `: ${detail}` : ""}.`;
  return Response.json({ error: message }, { status: status === 408 ? 504 : 502 });
}

function stringField(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numberField(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
    }
  }
  return undefined;
}

function booleanField(row: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    if (typeof row[key] === "boolean") return row[key] as boolean;
  }
  return undefined;
}

function isSummaryRow(row: Record<string, unknown>): boolean {
  const type = stringField(row, ["recordType", "record_type", "type", "rowType"]);
  return row.summary === true || (typeof type === "string" && type.toUpperCase() === "SUMMARY");
}

function rowSourceError(row: Record<string, unknown>): SourceError | null {
  const rawError = row.error;
  const code =
    typeof rawError === "string" && rawError.trim()
      ? rawError.trim().slice(0, 80)
      : rawError === true
        ? "error"
        : undefined;
  const message = stringField(row, ["message", "errorMessage", "errorDescription", "why"]);
  if (!code && !message) return null;
  return { code, message: message?.slice(0, 500) };
}

function parseRows(payload: unknown): {
  participants: ParticipantDto[];
  postCaption: string;
  sourceError: SourceError | null;
  ignoredErrors: number;
} {
  const rows = Array.isArray(payload) ? payload.filter(isRecord) : [];
  const participants: ParticipantDto[] = [];
  const seenIds = new Set<string>();
  let postCaption = "";
  let sourceError: SourceError | null = null;
  let ignoredErrors = 0;

  rows.forEach((row, index) => {
    if (isSummaryRow(row)) return;

    const error = rowSourceError(row);
    if (error) {
      if (!sourceError) sourceError = error;
      ignoredErrors += 1;
      return;
    }

    if (!postCaption) {
      const caption = stringField(row, ["postCaption", "caption"]);
      if (caption) postCaption = caption.slice(0, 2200);
    }

    const owner = isRecord(row.owner) ? row.owner : {};
    const username = (
      stringField(row, ["ownerUsername", "username", "authorUsername", "userName"]) ||
      stringField(owner, ["username", "userName"]) ||
      ""
    ).replace(/^@/, "");
    if (!username) return;

    const text = stringField(row, ["text", "commentText", "comment"]);
    const id = stringField(row, ["id", "commentId"]) || `apify-${index + 1}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const parentId = stringField(row, ["parentId", "parentCommentId"]);
    const postShortCode = stringField(row, ["postShortCode", "postShortcode"]);
    const directCommentUrl =
      stringField(row, ["commentUrl"]) ||
      (postShortCode ? `https://www.instagram.com/p/${postShortCode}/c/${id}/` : undefined);
    const profileImageUrl = [
      stringField(row, ["ownerProfilePicUrl", "profilePicUrl", "profileImageUrl"]),
      stringField(owner, ["profilePicUrl", "profile_pic_url", "profileImageUrl"]),
    ]
      .map(profileImageProxy)
      .find(Boolean);

    participants.push({
      id,
      username: username.slice(0, 64),
      // GIF/sticker comments can arrive without text; they are still entries.
      comment: (text || "Comentário com mídia/GIF").slice(0, 2200),
      timestamp: stringField(row, ["createdAt", "timestamp", "time"]),
      likes: numberField(row, ["likes", "likesCount", "likeCount"]),
      repliesCount: numberField(row, ["repliesCount", "replyCount"]),
      ownerFullName:
        stringField(row, ["ownerFullName", "fullName"]) || stringField(owner, ["fullName", "full_name"]),
      ownerVerified:
        booleanField(row, ["ownerVerified", "ownerIsVerified", "verified", "isVerified"]) ??
        booleanField(owner, ["isVerified", "is_verified", "verified"]),
      profileImageUrl,
      isReply: booleanField(row, ["isReply", "is_reply"]) ?? Boolean(parentId),
      commentUrl: directCommentUrl,
    });
  });

  return { participants, postCaption, sourceError, ignoredErrors };
}

function describeSourceError(error: SourceError | null): string {
  const code = (error?.code || "").toLowerCase();
  const detail = error?.message ? ` Detalhe do coletor: ${error.message}` : "";
  if (code.includes("unavailable_or_no_public_data")) {
    return `O Chronometrica não recebeu um feed público de comentários para esta publicação nesta leitura. Isso pode acontecer mesmo em post público quando o Instagram mostra a página, mas entrega a lista vazia para visitantes deslogados; o sistema tenta uma segunda leitura automaticamente.${detail}`;
  }
  if (code === "failed" || code.includes("temporary") || code.includes("provider")) {
    return `O Chronometrica encontrou um erro temporário ao ler esta publicação e não salvou comentários. O sistema tenta uma segunda leitura automaticamente.${detail}`;
  }
  if (code.includes("charge") || code.includes("limit") || code.includes("items")) {
    return `A coleta parou por limite antes de salvar comentários (código: ${error?.code}). Aumente o teto da coleta ou reduza o máximo de comentários.${detail}`;
  }
  if (code.includes("no_items") || code.includes("no_comments") || code.includes("no_results")) {
    return `O coletor encontrou a publicação, mas não retornou comentários públicos nesta leitura. Se há comentários visíveis no Instagram, isso costuma ser bloqueio temporário da leitura anônima; o sistema tenta uma segunda leitura automaticamente.${detail}`;
  }
  if (code.includes("private")) {
    return `O coletor tratou esta publicação como privada/restrita para leitura anônima (código: ${error?.code}). Ele só lê posts e Reels públicos.${detail}`;
  }
  if (code.includes("not_found")) {
    return `O coletor não conseguiu enxergar esta publicação como pública (código: ${error?.code}). Para leitura anônima, Instagram pode agrupar post excluído, conta privada, restrição de idade/região ou bloqueio temporário no mesmo resultado.${detail}`;
  }
  if (code.includes("comment") && (code.includes("off") || code.includes("disabled"))) {
    return `Os comentários desta publicação parecem estar desativados ou ocultos (código: ${error?.code}).${detail}`;
  }
  if (code.includes("invalid")) {
    return `O coletor não reconheceu este link como uma publicação/Reel válido (código: ${error?.code}). Confira se o link abre a publicação, e não um perfil, story ou página de login.${detail}`;
  }
  return `O coletor terminou sem retornar comentários utilizáveis${error?.code ? ` (código: ${error.code})` : ""}.${detail}`;
}

function summarySourceError(payload: unknown): SourceError | null {
  let text = "";
  if (typeof payload === "string") {
    text = payload;
  } else if (payload !== undefined && payload !== null) {
    try {
      text = JSON.stringify(payload);
    } catch {
      text = "";
    }
  }
  const normalized = text.toLowerCase();
  if (normalized.includes("unavailable_or_no_public_data")) {
    return {
      code: "unavailable_or_no_public_data",
      message: "O Instagram não expôs um feed público de comentários para esta publicação nesta leitura.",
    };
  }
  if (normalized.includes("source_exhausted")) {
    return {
      code: "no_items",
      message: "O feed público terminou sem salvar comentários nesta leitura.",
    };
  }
  if (normalized.includes('"failed"') || normalized.includes(" failed")) {
    return {
      code: "failed",
      message: "Erro temporário ao ler esta publicação no Instagram.",
    };
  }
  return null;
}

async function fetchOutputSourceError(
  token: string,
  keyValueStoreId: string | undefined,
): Promise<SourceError | null> {
  if (!keyValueStoreId) return null;
  try {
    const { response, payload } = await apifyJson(
      token,
      `/key-value-stores/${encodeURIComponent(keyValueStoreId)}/records/OUTPUT`,
      { timeoutMs: 15_000 },
    );
    if (!response.ok) return null;
    return summarySourceError(payload);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: { url?: unknown; maxComments?: unknown; includeReplies?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Envie um link válido para continuar." }, { status: 400 });
  }

  const normalizedUrl = typeof body.url === "string" ? normalizeInstagramPostUrl(body.url) : null;
  if (!normalizedUrl) {
    return Response.json(
      { error: "Use um link de publicação ou Reel público do Instagram." },
      { status: 400 },
    );
  }

  const token = getToken();
  if (!token) {
    return manualResult(
      normalizedUrl,
      "Link reconhecido. A coleta via Apify ainda não está configurada neste ambiente. Adicione APIFY_API_TOKEN nas variáveis do servidor (na Vercel: Production) e publique novamente, ou continue com a importação manual.",
    );
  }

  const maxComments = safeInteger(body.maxComments, 500);
  const includeReplies = body.includeReplies === true;
  const maxTotalChargeUsd = chargeCapUsd(maxComments, includeReplies);
  const startPath = `/acts/${ACTOR_ID}/runs?timeout=600&maxTotalChargeUsd=${encodeURIComponent(String(maxTotalChargeUsd))}`;

  try {
    const { response, payload } = await apifyJson(token, startPath, {
      method: "POST",
      body: JSON.stringify(actorInput(normalizedUrl, maxComments, includeReplies)),
      timeoutMs: 30_000,
    });
    if (!response.ok) return httpError(response.status, apifyErrorMessage(payload));

    const run = isRecord(payload) && isRecord(payload.data) ? (payload.data as ApifyRun) : null;
    if (!run?.id) {
      return Response.json(
        { error: "A Apify não retornou o identificador da coleta. Tente novamente." },
        { status: 502 },
      );
    }

    return Response.json(
      {
        mode: "apify_pending",
        provider: "apify",
        url: normalizedUrl,
        runId: run.id,
        datasetId: run.defaultDatasetId,
        status: run.status || "READY",
        maxTotalChargeUsd,
        message: "Coleta iniciada na Apify. Aguardando os comentários…",
      },
      { status: 202 },
    );
  } catch {
    return Response.json(
      { error: "Não foi possível iniciar a coleta na Apify agora. Tente novamente em alguns segundos." },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const runId = params.get("runId")?.trim() || "";
  const token = getToken();

  // Lightweight, secret-free diagnostics: lets support confirm whether the
  // deployment can see any Apify credential at all.
  if (!runId) {
    return Response.json({
      provider: "apify",
      actor: ACTOR_NAME,
      tokenConfigured: Boolean(token),
      tokenVariable: process.env.APIFY_API_TOKEN?.trim()
        ? "APIFY_API_TOKEN"
        : process.env.APIFY_TOKEN?.trim()
          ? "APIFY_TOKEN"
          : null,
    });
  }

  if (!token) {
    return Response.json(
      { error: "A coleta via Apify não está configurada neste ambiente (token ausente no servidor)." },
      { status: 503 },
    );
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(runId)) {
    return Response.json({ error: "Identificador de coleta inválido." }, { status: 400 });
  }

  const maxComments = safeInteger(params.get("maxComments"), MAX_COMMENTS);
  const includeReplies = params.get("includeReplies") === "true";
  const datasetLimit = Math.min(
    100_000,
    maxComments * (includeReplies ? 1 + MAX_REPLIES_PER_COMMENT : 1),
  );

  try {
    const runResult = await apifyJson(token, `/actor-runs/${encodeURIComponent(runId)}`, {
      timeoutMs: 20_000,
    });
    if (!runResult.response.ok) {
      return httpError(runResult.response.status, apifyErrorMessage(runResult.payload));
    }
    const run =
      isRecord(runResult.payload) && isRecord(runResult.payload.data)
        ? (runResult.payload.data as ApifyRun)
        : null;
    if (!run?.status) {
      return Response.json({ error: "A Apify retornou um status inválido para a coleta." }, { status: 502 });
    }

    if (run.status === "READY" || run.status === "RUNNING") {
      return Response.json({
        mode: "apify_pending",
        provider: "apify",
        runId: run.id || runId,
        datasetId: run.defaultDatasetId,
        status: run.status,
        message: "A Apify ainda está coletando os comentários…",
      });
    }

    if (run.status !== "SUCCEEDED") {
      const detail = run.statusMessage ? ` ${run.statusMessage.slice(0, 300)}` : "";
      return Response.json(
        { error: `A coleta terminou com status ${run.status}.${detail}` },
        { status: 502 },
      );
    }

    if (!run.defaultDatasetId) {
      return Response.json(
        { error: "A coleta terminou sem um conjunto de resultados. Inicie uma nova coleta." },
        { status: 502 },
      );
    }

    const datasetPath = `/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?format=json&clean=true&desc=false&limit=${datasetLimit}`;
    const datasetResult = await apifyJson(token, datasetPath, { timeoutMs: 30_000 });
    if (!datasetResult.response.ok) {
      return httpError(datasetResult.response.status, apifyErrorMessage(datasetResult.payload));
    }

    const { participants, postCaption, sourceError, ignoredErrors } = parseRows(datasetResult.payload);

    if (!participants.length) {
      const effectiveSourceError =
        sourceError ?? (await fetchOutputSourceError(token, run.defaultKeyValueStoreId));
      const message = describeSourceError(effectiveSourceError);
      console.warn("Apify comments run returned no usable comments", {
        actor: ACTOR_NAME,
        runId: run.id || runId,
        datasetId: run.defaultDatasetId,
        sourceError: effectiveSourceError,
      });
      return Response.json(
        {
          error: message,
          sourceError: effectiveSourceError ?? undefined,
          runId: run.id || runId,
          datasetId: run.defaultDatasetId,
        },
        { status: 502 },
      );
    }

    const replyCount = participants.filter((person) => person.isReply).length;
    const topLevelCount = participants.length - replyCount;
    const message = `${participants.length.toLocaleString("pt-BR")} comentário(s) coletado(s) pela Apify${replyCount ? `, incluindo ${replyCount.toLocaleString("pt-BR")} resposta(s)` : ""}.${topLevelCount >= maxComments ? " O limite de comentários principais foi atingido; aumente-o para buscar mais." : ""}${ignoredErrors ? ` ${ignoredErrors} linha(s) sem resultado foram ignoradas.` : ""}`;

    return Response.json({
      mode: "apify",
      provider: "apify",
      runId: run.id || runId,
      datasetId: run.defaultDatasetId,
      status: run.status,
      participants,
      postCaption,
      truncated: topLevelCount >= maxComments,
      message,
    });
  } catch {
    return Response.json(
      { error: "Não foi possível consultar o andamento da coleta na Apify. Tente novamente." },
      { status: 502 },
    );
  }
}
