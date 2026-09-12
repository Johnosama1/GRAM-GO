import crypto from "crypto";
import { db } from "@workspace/db";
import {
  adminsTable,
  auditLogsTable,
  adminLoginAttemptsTable,
  botSettingsTable,
  AdminPermission,
} from "@workspace/db/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { logger } from "./logger";

// ── 1. OWNER & ADMIN IDENTITY ────────────────────────────────────────────────
export const OWNER_TELEGRAM_ID = 6145230334;

export function getOwnerIds(): Set<number> {
  return new Set<number>([OWNER_TELEGRAM_ID]);
}

export async function getAuthorizedAdmins(): Promise<{
  allAdminIds: Set<number>;
  ownerIds: Set<number>;
  subAdmins: Map<number, { username?: string | null; permissions: AdminPermission[] }>;
}> {
  const ownerIds = new Set<number>([OWNER_TELEGRAM_ID]);
  const allAdminIds = new Set<number>([OWNER_TELEGRAM_ID]);
  const subAdmins = new Map<number, { username?: string | null; permissions: AdminPermission[] }>();

  return { allAdminIds, ownerIds, subAdmins };
}

export interface AdminAuthResult {
  isAdmin: boolean;
  isOwner: boolean;
  userId: number;
  username?: string | null;
  permissions: AdminPermission[];
}

const ALL_OWNER_PERMISSIONS: AdminPermission[] = [
  "canViewStats",
  "canBroadcast",
  "canManageUsers",
  "canManageWithdrawals",
  "canManageDeposits",
  "canManageTasks",
  "canManageChannels",
  "canManageCombo",
  "canManageCheckin",
  "canManageSettings",
  "canManageWallet",
  "canManageApiSettings",
  "canBanUsers",
  "canManageAdmins",
  "canUnban",
  "canWarn",
  "canReceiveWithdrawals",
  "canEditWheel",
  "canManageMiners",
  "canManageTournaments",
  "canManagePromoCodes",
  "canManageAds",
  "canViewAuditLogs",
];

export async function getAdminAuth(userId: number): Promise<AdminAuthResult> {
  if (Number(userId) === OWNER_TELEGRAM_ID) {
    return {
      isAdmin: true,
      isOwner: true,
      userId: OWNER_TELEGRAM_ID,
      permissions: ALL_OWNER_PERMISSIONS,
    };
  }

  return { isAdmin: false, isOwner: false, userId, permissions: [] };
}

export async function isUserAdmin(userId: number): Promise<boolean> {
  return Number(userId) === OWNER_TELEGRAM_ID;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getAdminSecretKey(): Buffer {
  const secret = process.env.ADMIN_TOKEN_SECRET || process.env.SESSION_SECRET || process.env.BOT_TOKEN || "admin_gate_default_secret";
  return crypto.createHmac("sha256", "AdminSessionGate").update(secret).digest();
}

export async function isLockedOut(userId: number, ipAddress?: string): Promise<{ locked: boolean; remainingSeconds: number }> {
  try {
    const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS);
    const recentAttempts = await db
      .select()
      .from(adminLoginAttemptsTable)
      .where(
        and(
          userId > 0 ? eq(adminLoginAttemptsTable.userId, userId) : eq(adminLoginAttemptsTable.ipAddress, ipAddress || ""),
          gte(adminLoginAttemptsTable.attemptedAt, windowStart),
          eq(adminLoginAttemptsTable.success, false)
        )
      )
      .orderBy(desc(adminLoginAttemptsTable.attemptedAt));

    if (recentAttempts.length >= MAX_FAILED_ATTEMPTS) {
      const oldestInWindow = recentAttempts[recentAttempts.length - 1];
      const elapsed = Date.now() - oldestInWindow.attemptedAt.getTime();
      const remainingMs = Math.max(0, LOCKOUT_WINDOW_MS - elapsed);
      return { locked: true, remainingSeconds: Math.ceil(remainingMs / 1000) };
    }
  } catch (err) {
    logger.error({ err }, "Error checking admin lockout");
  }

  return { locked: false, remainingSeconds: 0 };
}

export async function recordLoginAttempt(userId: number, ipAddress: string | undefined, success: boolean): Promise<void> {
  try {
    await db.insert(adminLoginAttemptsTable).values({
      userId: userId > 0 ? userId : null,
      ipAddress: ipAddress || null,
      success,
    });
  } catch (err) {
    logger.error({ err }, "Error recording login attempt");
  }
}

export function verifyAdminPasswordConstantTime(providedPassword: string): boolean {
  const configuredPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_PIN || "admin123";
  
  const providedBuf = Buffer.from(providedPassword, "utf8");
  const configBuf = Buffer.from(configuredPassword, "utf8");

  if (providedBuf.length !== configBuf.length) {
    // Constant time dummy comparison to prevent length timing leaks
    crypto.timingSafeEqual(providedBuf, providedBuf);
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, configBuf);
}

export function issueAdminToken(userId: number): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  const payload = `admin:${userId}:${expiresAt}`;
  const hmac = crypto.createHmac("sha256", getAdminSecretKey()).update(payload).digest("hex");
  const raw = `${payload}:${hmac}`;
  const token = Buffer.from(raw).toString("base64url");

  logger.info({ userId, expiresAt: new Date(expiresAt).toISOString() }, "Admin unlock token issued");
  return { token, expiresAt };
}

export function validateAdminToken(token: string): { valid: boolean; userId?: number; reason?: string } {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 4 || parts[0] !== "admin") {
      return { valid: false, reason: "malformed" };
    }

    const [, userIdStr, expiryStr, hmac] = parts;
    const userId = parseInt(userIdStr);
    const expiry = parseInt(expiryStr);

    if (isNaN(userId) || isNaN(expiry)) return { valid: false, reason: "invalid_parts" };

    if (Date.now() > expiry) {
      return { valid: false, reason: "expired" };
    }

    const payload = `admin:${userIdStr}:${expiryStr}`;
    const expected = crypto.createHmac("sha256", getAdminSecretKey()).update(payload).digest("hex");

    const hmacBuf = Buffer.from(hmac, "hex");
    const expectedBuf = Buffer.from(expected, "hex");

    if (hmacBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(hmacBuf, expectedBuf)) {
      return { valid: false, reason: "invalid_signature" };
    }

    return { valid: true, userId };
  } catch {
    return { valid: false, reason: "parse_error" };
  }
}

// ── 3. CENTRAL AUDIT LOGGING ──────────────────────────────────────────────────

export async function logAdminAudit(
  adminId: number,
  action: string,
  details: Record<string, unknown>,
  targetUserId?: number,
  ipAddress?: string
): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      adminId,
      action,
      targetUserId: targetUserId || null,
      details,
      ipAddress: ipAddress || null,
    });
    logger.info({ adminId, action, targetUserId }, "Admin audit logged");
  } catch (err) {
    logger.error({ err, adminId, action }, "Failed to write admin audit log");
  }
}
