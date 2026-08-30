import { pgTable, serial, bigint, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: bigint("referrer_id", { mode: "number" }).notNull(),
  referredId: bigint("referred_id", { mode: "number" }).notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  removedAt: timestamp("removed_at"),
  warnedAt: timestamp("warned_at"),
  warnMsgId: integer("warn_msg_id"),
});

export const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  requiredReferrals: integer("required_referrals").notNull(),
  rewardAmount: numeric("reward_amount", { precision: 18, scale: 6 }).notNull(),
  rewardCurrency: text("reward_currency").notNull().default("GO"), // GO or Gram
  isRepeatable: boolean("is_repeatable").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userMilestonesTable = pgTable("user_milestones", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  milestoneId: integer("milestone_id").notNull(),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
});

export const insertReferralSchema = createInsertSchema(referralsTable).omit({ id: true, createdAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;

export const insertMilestoneSchema = createInsertSchema(milestonesTable).omit({ id: true, createdAt: true });
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type Milestone = typeof milestonesTable.$inferSelect;

export const insertUserMilestoneSchema = createInsertSchema(userMilestonesTable).omit({ id: true, claimedAt: true });
export type InsertUserMilestone = z.infer<typeof insertUserMilestoneSchema>;
export type UserMilestone = typeof userMilestonesTable.$inferSelect;

