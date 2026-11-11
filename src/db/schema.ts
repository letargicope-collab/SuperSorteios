import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type DrawPerson = {
  username: string;
  comment: string;
  entryNumber: number;
};

export type DrawSettings = {
  winnerCount: number;
  alternateCount: number;
  durationSeconds: number;
  removeDuplicates: boolean;
  prizeEnabled: boolean;
  minMentions: number;
  requiredHashtag: string;
  requiredMention: string;
};

export const raffleDraws = pgTable("raffle_draws", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceUrl: text("source_url").notNull(),
  participantCount: integer("participant_count").notNull(),
  winningNumber: integer("winning_number").notNull(),
  settings: jsonb("settings").$type<DrawSettings>().notNull(),
  winners: jsonb("winners").$type<DrawPerson[]>().notNull(),
  alternates: jsonb("alternates").$type<DrawPerson[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
