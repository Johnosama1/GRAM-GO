import { pgTable, serial, bigint, integer, text, numeric, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const comboItems = [
  { id: 1, name: "Gram Crystal", image: "/combo/combo_1.png", description: "High-resonance energy crystal" },
  { id: 2, name: "Cyber Core", image: "/combo/combo_2.png", description: "Quantum processing cube" },
  { id: 3, name: "GO Token", image: "/combo/combo_3.png", description: "Pure catalytic gold token" },
  { id: 4, name: "Mining Standard", image: "/combo/combo_4.png", description: "Guild emblem of endurance" },
  { id: 5, name: "Plasma Pickaxe", image: "/combo/combo_5.png", description: "Ultra-dense mining implement" },
] as const;

export const dailyCombosTable = pgTable("daily_combos", {
  id: serial("id").primaryKey(),
  comboDate: text("combo_date").notNull().unique(), // YYYY-MM-DD
  item1: integer("item_1").notNull(),
  item2: integer("item_2").notNull(),
  item3: integer("item_3").notNull(),
  rewardAmount: numeric("reward_amount", { precision: 18, scale: 6 }).notNull().default("5.000000"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userComboAttemptsTable = pgTable("user_combo_attempts", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  comboDate: text("combo_date").notNull(), // YYYY-MM-DD
  selectedItems: jsonb("selected_items").$type<number[]>().notNull(),
  isSuccess: boolean("is_success").notNull().default(false),
  rewardClaimed: boolean("reward_claimed").notNull().default(false),
  rewardAmount: numeric("reward_amount", { precision: 18, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const dailyCheckinsTable = pgTable("daily_checkins", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  day: integer("day").notNull(), // 1 to 10
  rewardAmount: numeric("reward_amount", { precision: 18, scale: 6 }).notNull(),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
  claimDate: text("claim_date").notNull(), // YYYY-MM-DD
});

export const insertDailyComboSchema = createInsertSchema(dailyCombosTable).omit({ id: true, createdAt: true });
export type InsertDailyCombo = z.infer<typeof insertDailyComboSchema>;
export type DailyCombo = typeof dailyCombosTable.$inferSelect;

export const insertUserComboAttemptSchema = createInsertSchema(userComboAttemptsTable).omit({ id: true, createdAt: true });
export type InsertUserComboAttempt = z.infer<typeof insertUserComboAttemptSchema>;
export type UserComboAttempt = typeof userComboAttemptsTable.$inferSelect;

export const insertDailyCheckinSchema = createInsertSchema(dailyCheckinsTable).omit({ id: true, claimedAt: true });
export type InsertDailyCheckin = z.infer<typeof insertDailyCheckinSchema>;
export type DailyCheckin = typeof dailyCheckinsTable.$inferSelect;
