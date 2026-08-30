import { pgTable, serial, text, boolean, timestamp, integer, bigint, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  icon: text("icon").default("⭐"),
  channelPhotoUrl: text("channel_photo_url"),
  rewardAmount: numeric("reward_amount", { precision: 18, scale: 6 }).notNull().default("5"),
  rewardCurrency: text("reward_currency").notNull().default("GO"), // GO or Gram
  maxClaims: integer("max_claims"),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userTasksTable = pgTable("user_tasks", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  taskId: integer("task_id").notNull(),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
});

export const contestsTable = pgTable("contests", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  rewardType: text("reward_type").notNull().default("GO"), // GO or Gram
  totalReward: numeric("total_reward", { precision: 18, scale: 6 }).notNull().default("100"),
  winnerCount: integer("winner_count").notNull().default(3),
  startDate: timestamp("start_date").notNull().defaultNow(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isFinished: boolean("is_finished").notNull().default(false),
  winners: jsonb("winners").$type<{ rank: number; userId: number; prize: string }[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
export type UserTask = typeof userTasksTable.$inferSelect;

export const insertContestSchema = createInsertSchema(contestsTable).omit({ id: true, createdAt: true });
export type InsertContest = z.infer<typeof insertContestSchema>;
export type Contest = typeof contestsTable.$inferSelect;

