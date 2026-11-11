import { normalizeInstagramPostUrl } from "@/lib/instagram";
import { profileImageProxy } from "@/lib/profile-image";

export const dynamic = "force-dynamic";
// Each request now only starts a run or checks its status, so individual
// serverless invocations stay short even when the Actor takes minutes.
export const maxDuration = 60;

const ACTOR_ID = "instagram-data-api~instagram-comments-scraper";
const APIFY_API = "https://api.apify.com/v2";
const MAX_COMMENTS = 5000;
// Highest current per-comment event price published for this Actor is
// US$ 0.000504. We cap with headroom so a low cap cannot stop the run early;
// the cap is a safety limit, not the expected charge.
const PER_COMMENT_CAP_USD = 0.0006;
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

function chargeCapUsd(maxComments: number): number {
  return Math.max(0.02, Number((maxComments * PER_COMMENT_CAP_USD + RUN_BUFFER_USD).toFixed(4)));
}

function actorInput(url: string, maxComments: number, includeReplies: boolean) {
  // Use the Actor's native, documented schema. The optional Apify-style
  // field aliases and the summary row are not needed by this app and only
  // add extra shapes for the parser to trip over.
  return {
    urls: [url],
    maxCommentsPerPost: maxComments,
    includeReplies,
    officialFieldNames: false,
    addSummaryRow: false,
    includeRaw: false,
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
      commentUrl: stringField(row, ["commentUrl"]),
    });
  });

  return { participants, postCaption, sourceError, ignoredErrors };
}

function describeSourceError(error: SourceError | null): string {
  const code = (error?.code || "").toLowerCase();
  const detail = error?.message ? ` Detalhe do coletor: ${error.message}` : "";
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
  const maxTotalChargeUsd = chargeCapUsd(maxComments);
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
      actor: "instagram-data-api/instagram-comments-scraper",
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

    const datasetPath = `/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?format=json&clean=true&desc=false&limit=${maxComments}`;
    const datasetResult = await apifyJson(token, datasetPath, { timeoutMs: 30_000 });
    if (!datasetResult.response.ok) {
      return httpError(datasetResult.response.status, apifyErrorMessage(datasetResult.payload));
    }

    const { participants, postCaption, sourceError, ignoredErrors } = parseRows(datasetResult.payload);

    if (!participants.length) {
      const message = describeSourceError(sourceError);
      console.warn("Apify comments run returned no usable comments", {
        runId: run.id || runId,
        datasetId: run.defaultDatasetId,
        sourceError,
      });
      return Response.json(
        {
          error: message,
          sourceError: sourceError ?? undefined,
          runId: run.id || runId,
          datasetId: run.defaultDatasetId,
        },
        { status: 502 },
      );
    }

    const replyCount = participants.filter((person) => person.isReply).length;
    const message = `${participants.length.toLocaleString("pt-BR")} comentário(s) coletado(s) pela Apify${replyCount ? `, incluindo ${replyCount.toLocaleString("pt-BR")} resposta(s)` : ""}.${participants.length >= maxComments ? " O limite escolhido foi atingido; aumente-o para buscar mais." : ""}${ignoredErrors ? ` ${ignoredErrors} linha(s) sem resultado foram ignoradas.` : ""}`;

    return Response.json({
      mode: "apify",
      provider: "apify",
      runId: run.id || runId,
      datasetId: run.defaultDatasetId,
      status: run.status,
      participants,
      postCaption,
      truncated: participants.length >= maxComments,
      message,
    });
  } catch {
    return Response.json(
      { error: "Não foi possível consultar o andamento da coleta na Apify. Tente novamente." },
      { status: 502 },
    );
  }
}
