import { desc } from "drizzle-orm";
import { db } from "@/db";
import { raffleDraws, type DrawPerson, type DrawSettings } from "@/db/schema";
import { normalizeInstagramPostUrl } from "@/lib/instagram";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const parsed = typeof value === "number" ? Math.floor(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function parsePeople(value: unknown, maxLength: number): DrawPerson[] | null {
  if (!Array.isArray(value) || value.length > maxLength) return null;
  const result: DrawPerson[] = [];

  for (const person of value) {
    if (!isRecord(person) || typeof person.username !== "string" || typeof person.comment !== "string") {
      return null;
    }
    const username = person.username.trim().replace(/^@/, "").slice(0, 64);
    const entryNumber = Number(person.entryNumber);
    if (!username || !Number.isInteger(entryNumber) || entryNumber < 1) return null;
    result.push({ username, comment: person.comment.trim().slice(0, 2200), entryNumber });
  }

  return result;
}

export async function GET() {
  try {
    const draws = await db
      .select({
        id: raffleDraws.id,
        sourceUrl: raffleDraws.sourceUrl,
        participantCount: raffleDraws.participantCount,
        winners: raffleDraws.winners,
        createdAt: raffleDraws.createdAt,
      })
      .from(raffleDraws)
      .orderBy(desc(raffleDraws.createdAt))
      .limit(6);

    return Response.json({ draws });
  } catch {
    return Response.json({ error: "Não foi possível carregar o histórico agora." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Os dados do sorteio estão incompletos." }, { status: 400 });
  }

  if (!isRecord(body)) {
    return Response.json({ error: "Os dados do sorteio estão incompletos." }, { status: 400 });
  }

  const sourceUrl = typeof body.sourceUrl === "string" ? normalizeInstagramPostUrl(body.sourceUrl) : null;
  const participantCount = Number(body.participantCount);
  const winners = parsePeople(body.winners, 10);
  const alternates = parsePeople(body.alternates, 20);

  if (
    !sourceUrl ||
    !Number.isInteger(participantCount) ||
    participantCount < 1 ||
    participantCount > 100_000 ||
    !winners?.length ||
    alternates === null ||
    [...winners, ...alternates].some((person) => person.entryNumber > participantCount)
  ) {
    return Response.json({ error: "Os dados do resultado não passaram pela validação." }, { status: 400 });
  }

  const rawSettings = isRecord(body.settings) ? body.settings : {};
  const settings: DrawSettings = {
    winnerCount: boundedInteger(rawSettings.winnerCount, 1, 10, winners.length),
    alternateCount: boundedInteger(rawSettings.alternateCount, 0, 20, alternates.length),
    durationSeconds: boundedInteger(rawSettings.durationSeconds, 6, 20, 8),
    removeDuplicates: rawSettings.removeDuplicates === true,
    prizeEnabled: rawSettings.prizeEnabled === true,
    minMentions: boundedInteger(rawSettings.minMentions, 0, 20, 0),
    requiredHashtag: typeof rawSettings.requiredHashtag === "string" ? rawSettings.requiredHashtag.slice(0, 80) : "",
    requiredMention: typeof rawSettings.requiredMention === "string" ? rawSettings.requiredMention.slice(0, 80) : "",
  };

  try {
    const [saved] = await db
      .insert(raffleDraws)
      .values({
        sourceUrl,
        participantCount,
        winningNumber: winners[0].entryNumber,
        settings,
        winners,
        alternates,
      })
      .returning({ id: raffleDraws.id, createdAt: raffleDraws.createdAt });

    return Response.json({ draw: saved }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível salvar o sorteio no histórico." }, { status: 500 });
  }
}
