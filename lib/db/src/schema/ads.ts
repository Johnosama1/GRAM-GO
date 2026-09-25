import { pgTable, serial, text, numeric, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adRewardEventsTable = pgTable("ad_reward_events", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  provider: text("provider").notNull().default("adsgram"),
  rewardAmount: numeric("reward_amount", { precision: 18, scale: 6 }).notNull(),
  adDateUtc: text("ad_date_utc").notNull(), // String format YYYY-MM-DD
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdRewardEventSchema = createInsertSchema(adRewardEventsTable).omit({ id: true, createdAt: true });
export type InsertAdRewardEvent = z.infer<typeof insertAdRewardEventSchema>;
export type AdRewardEvent = typeof adRewardEventsTable.$inferSelect;
