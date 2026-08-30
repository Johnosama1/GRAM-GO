import { pgTable, serial, numeric, text, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const withdrawalsTable = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
  currency: text("currency").notNull().default("TON"),
  walletAddress: text("wallet_address").notNull(),
  fee: numeric("fee", { precision: 18, scale: 6 }).default("0.05"), // Estimated TON network fee
  status: text("status").notNull().default("pending"),
  txHash: text("tx_hash"),
  errorMsg: text("error_msg"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const depositsTable = pgTable("deposits", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
  currency: text("currency").notNull().default("TON"),
  walletAddress: text("wallet_address"),
  txHash: text("tx_hash"),
  status: text("status").notNull().default("pending"), // pending, confirmed, failed, cancelled, expired
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
});

export const insertWithdrawalSchema = createInsertSchema(withdrawalsTable).omit({ id: true, createdAt: true, processedAt: true });
export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;
export type Withdrawal = typeof withdrawalsTable.$inferSelect;

export const insertDepositSchema = createInsertSchema(depositsTable).omit({ id: true, createdAt: true });
export type InsertDeposit = z.infer<typeof insertDepositSchema>;
export type Deposit = typeof depositsTable.$inferSelect;

