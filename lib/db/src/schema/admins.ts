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
  | "canEditWheel";

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

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  adminId: bigint("admin_id", { mode: "number" }).notNull(),
  action: text("action").notNull(),
  targetUserId: bigint("target_user_id", { mode: "number" }),
  details: jsonb("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminSchema = createInsertSchema(adminsTable).omit({ addedAt: true });
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Admin = typeof adminsTable.$inferSelect;
export type BotSetting = typeof botSettingsTable.$inferSelect;

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;

