import { pgTable, serial, bigint, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type AdminPermission =
  | "canViewStats"
  | "canBroadcast"
  | "canManageUsers"
  | "canManageWithdrawals"
  | "canManageDeposits"
  | "canManageTasks"
  | "canManageChannels"
  | "canManageCombo"
  | "canManageCheckin"
  | "canManageSettings"
  | "canManageWallet"
  | "canManageApiSettings"
  | "canBanUsers"
  | "canManageAdmins"
  | "canUnban"
  | "canWarn"
  | "canReceiveWithdrawals"
  | "canEditWheel"
  | "canManageMiners"
  | "canManageTournaments"
  | "canManagePromoCodes"
  | "canManageAds"
  | "canViewAuditLogs";

export const adminsTable = pgTable("admins", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  username: text("username"),
  role: text("role").notNull().default("admin"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
  permissions: jsonb("permissions").$type<AdminPermission[]>().notNull().default([]),
});

export const botSettingsTable = pgTable("bot_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const fsmStatesTable = pgTable("fsm_states", {
  userId: bigint("user_id", { mode: "number" }).primaryKey(),
  state: text("state").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const minersTable = pgTable("miners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("⛏️"),
  costGo: text("cost_go").notNull().default("100"),
  dailyYieldGram: text("daily_yield_gram").notNull().default("1.0"),
  durationDays: text("duration_days").notNull().default("30"),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const promoCodesTable = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  rewardType: text("reward_type").notNull().default("GRAM"), // GRAM, GO, TON
  rewardAmount: text("reward_amount").notNull().default("10"),
  maxUses: text("max_uses").notNull().default("100"),
  currentUses: text("current_uses").notNull().default("0"),
  expiresAt: timestamp("expires_at"),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userPromoCodesTable = pgTable("user_promo_codes", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  promoCodeId: serial("promo_code_id").notNull(),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
});

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  adminId: bigint("admin_id", { mode: "number" }).notNull(),
  action: text("action").notNull(),
  targetUserId: bigint("target_user_id", { mode: "number" }),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminSchema = createInsertSchema(adminsTable).omit({ addedAt: true });
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Admin = typeof adminsTable.$inferSelect;
export type BotSetting = typeof botSettingsTable.$inferSelect;
export type FsmState = typeof fsmStatesTable.$inferSelect;
export type Miner = typeof minersTable.$inferSelect;
export type PromoCode = typeof promoCodesTable.$inferSelect;

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;


