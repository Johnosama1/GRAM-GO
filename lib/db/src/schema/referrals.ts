import { pgTable, serial, bigint, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: bigint("referrer_id", { mode: "number" }).notNull(),
  referredId: bigint("referred_id", { mode: "number" }).notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "successful" | "active" | "removed"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  successfulAt: timestamp("successful_at"),
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

export const referralCommissionsTable = pgTable("referral_commissions", {
  id: serial("id").primaryKey(),
  depositId: integer("deposit_id").notNull(),
  txHash: text("tx_hash"),
  depositingUserId: bigint("depositing_user_id", { mode: "number" }).notNull(),
  referrerId: bigint("referrer_id", { mode: "number" }).notNull(),
  level: integer("level").notNull(), // 1, 2, 3, 4, 5
  depositAmountGram: numeric("deposit_amount_gram", { precision: 18, scale: 6 }).notNull(),
  depositAmountGo: numeric("deposit_amount_go", { precision: 18, scale: 6 }).notNull(),
  percentage: numeric("percentage", { precision: 10, scale: 2 }).notNull(),
  commissionAmountGo: numeric("commission_amount_go", { precision: 18, scale: 6 }).notNull(),
  currency: text("currency").notNull().default("GO"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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

export const insertReferralCommissionSchema = createInsertSchema(referralCommissionsTable).omit({ id: true, createdAt: true });
export type InsertReferralCommission = z.infer<typeof insertReferralCommissionSchema>;
export type ReferralCommission = typeof referralCommissionsTable.$inferSelect;
