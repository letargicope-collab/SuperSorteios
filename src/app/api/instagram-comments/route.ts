import { normalizeInstagramPostUrl } from "@/lib/instagram";
import { profileImageProxy } from "@/lib/profile-image";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACTOR_PATH = "instagram-data-api~instagram-comments-scraper";
const APIFY_ENDPOINT = `https://api.apify.com/v2/acts/${ACTOR_PATH}/run-sync-get-dataset-items`;
const MAX_COMMENTS = 5000;
const RUN_TIMEOUT_SECONDS = 240;
const RETURN_WITHIN_SECONDS = 210;

type ApifyCommentRow = {
  id?: string;
  postShortCode?: string;
  postCaption?: string;
  commentUrl?: string;
  parentId?: string | null;
  isReply?: boolean;
  text?: string;
  createdAt?: string;
  likes?: number | null;
  repliesCount?: number | null;
  ownerUsername?: string;
  ownerFullName?: string | null;
  ownerVerified?: boolean;
  ownerProfilePicUrl?: string | null;
  profilePicUrl?: string | null;
  owner?: { profilePicUrl?: string | null; profile_pic_url?: string | null } | null;
  error?: string;
};

type RequestBody = {
  url?: unknown;
  maxComments?: unknown;
  includeReplies?: unknown;
};

function manualResult(url: string, message: string) {
  return Response.json({
    mode: "manual",
    url,
    participants: [],
    message,
  });
}

function safeInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_COMMENTS, Math.max(1, Math.floor(parsed)));
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
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

  const maxComments = safeInteger(body.maxComments, 500);
  const includeReplies = body.includeReplies === true;
  const token = process.env.APIFY_API_TOKEN?.trim() || process.env.APIFY_TOKEN?.trim();

  if (!token) {
    return manualResult(
      normalizedUrl,
      "Link reconhecido. A coleta via Apify ainda não está configurada neste ambiente. Adicione o token da Apify no servidor ou continue com a importação manual.",
    );
  }

  // Conservative cap using the highest listed comment price (Free plan).
  // The actual charge depends on the Apify plan and the number of returned rows.
  const maxTotalChargeUsd = Math.max(0.01, Number((maxComments * 0.00039 + 0.0005).toFixed(4)));
  const endpoint = new URL(APIFY_ENDPOINT);
  endpoint.searchParams.set("timeout", String(RUN_TIMEOUT_SECONDS));
  endpoint.searchParams.set("maxTotalChargeUsd", String(maxTotalChargeUsd));
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("clean", "true");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(285_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        urls: [normalizedUrl],
        maxCommentsPerPost: maxComments,
        includeReplies,
        officialFieldNames: true,
        addSummaryRow: true,
        includeRaw: false,
        returnWithinSecs: RETURN_WITHIN_SECONDS,
      }),
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const message =
        response.status === 401 || response.status === 403
          ? "A Apify recusou o token. Revise a credencial configurada no servidor."
          : response.status === 402
            ? "A Apify não iniciou a coleta por limite de cobrança ou saldo da conta."
            : response.status === 408
              ? "A coleta demorou mais que o limite. Reduza o máximo de comentários e tente novamente."
              : "A Apify não conseguiu concluir a coleta. Tente novamente ou use a importação manual.";
      return Response.json({ error: message }, { status: response.status === 408 ? 504 : 502 });
    }

    if (!Array.isArray(payload)) {
      return Response.json(
        { error: "A Apify retornou um formato inesperado. Nenhum comentário foi alterado." },
        { status: 502 },
      );
    }

    const rows = payload as ApifyCommentRow[];
    const seenIds = new Set<string>();
    const participants: Array<{
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
    }> = [];
    let postCaption = "";
    let sourceErrors = 0;

    rows.forEach((row, index) => {
      if (row.error) {
        sourceErrors += 1;
        return;
      }
      if (!postCaption && row.postCaption) postCaption = row.postCaption.slice(0, 2200);
      const username = row.ownerUsername?.trim().replace(/^@/, "");
      if (!username || typeof row.text !== "string") return;
      const id = row.id?.trim() || `${row.postShortCode || "comment"}-${index}`;
      if (seenIds.has(id)) return;
      seenIds.add(id);
      participants.push({
        id,
        username: username.slice(0, 64),
        comment: row.text.trim().slice(0, 2200),
        timestamp: row.createdAt,
        likes: typeof row.likes === "number" ? row.likes : undefined,
        repliesCount: typeof row.repliesCount === "number" ? row.repliesCount : undefined,
        ownerFullName: row.ownerFullName?.slice(0, 120) || undefined,
        ownerVerified: row.ownerVerified === true,
        profileImageUrl: [row.ownerProfilePicUrl, row.profilePicUrl, row.owner?.profilePicUrl, row.owner?.profile_pic_url]
          .map(profileImageProxy).find(Boolean),
        isReply: row.isReply === true,
        commentUrl: row.commentUrl,
      });
    });

    const truncated = participants.length >= maxComments;
    const replyCount = participants.filter((person) => person.isReply).length;
    const message = participants.length
      ? `${participants.length.toLocaleString("pt-BR")} comentário(s) coletado(s) pela Apify${includeReplies ? `, incluindo ${replyCount.toLocaleString("pt-BR")} resposta(s)` : " principais"}.${truncated ? " O limite escolhido foi atingido; aumente-o para buscar mais." : ""}${sourceErrors ? ` ${sourceErrors} item(ns) indisponível(is) foram ignorados.` : ""}`
      : sourceErrors
        ? "A publicação está indisponível, foi excluída ou não pôde ser acessada pelo coletor. Você ainda pode importar os comentários manualmente."
        : "A coleta terminou sem comentários elegíveis. Confira se a publicação é pública ou importe os comentários manualmente.";

    return Response.json({
      mode: "apify",
      url: normalizedUrl,
      participants,
      postCaption,
      includeReplies,
      truncated,
      message,
    });
  } catch {
    return Response.json(
      { error: "A conexão com a Apify expirou ou foi interrompida. Reduza o limite e tente novamente; a importação manual continua disponível." },
      { status: 504 },
    );
  }
}
