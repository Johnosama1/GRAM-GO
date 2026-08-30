import { pgTable, serial, bigint, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deviceFingerprintsTable = pgTable("device_fingerprints", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  fingerprint: text("fingerprint").notNull(),
  canvasFp: text("canvas_fp"),
  audioFp: text("audio_fp"),
  localId: text("local_id"),
  screenResolution: text("screen_resolution"),
  timeZone: text("time_zone"),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
});

export const bansTable = pgTable("bans", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  reason: text("reason").notNull().default("duplicate_account"),
  matchedUserId: bigint("matched_user_id", { mode: "number" }),
  matchedSignals: jsonb("matched_signals").$type<string[]>().default([]),
  bannedAt: timestamp("banned_at").notNull().defaultNow(),
  bannedBy: text("banned_by").notNull().default("system"),
  isActive: boolean("is_active").notNull().default(true),
});

export const securityEventsTable = pgTable("security_events", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  eventType: text("event_type").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDeviceFingerprintSchema = createInsertSchema(deviceFingerprintsTable).omit({ id: true, createdAt: true, lastSeenAt: true });
export type InsertDeviceFingerprint = z.infer<typeof insertDeviceFingerprintSchema>;
export type DeviceFingerprint = typeof deviceFingerprintsTable.$inferSelect;

export const insertBanSchema = createInsertSchema(bansTable).omit({ id: true, bannedAt: true });
export type InsertBan = z.infer<typeof insertBanSchema>;
export type Ban = typeof bansTable.$inferSelect;

export const insertSecurityEventSchema = createInsertSchema(securityEventsTable).omit({ id: true, createdAt: true });
export type InsertSecurityEvent = z.infer<typeof insertSecurityEventSchema>;
export type SecurityEvent = typeof securityEventsTable.$inferSelect;
