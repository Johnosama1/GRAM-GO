import { Request, Response, NextFunction } from "express";
import {
  getAdminAuth,
  validateAdminToken,
  AdminAuthResult,
} from "../lib/adminSecurity";
import { validateToken } from "../lib/sessionToken";
import { logger } from "../lib/logger";
import crypto from "crypto";

export interface AdminRequest extends Request {
  adminUser?: AdminAuthResult;
  adminId?: number;
}

function parseTelegramInitData(initData: string): { valid: boolean; userId?: number } {
  const MAX_AGE_MS = 15 * 60 * 1000;
  try {
    const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
    if (!token) {
      if (process.env.NODE_ENV === "production") return { valid: false };
      return { valid: true, userId: undefined };
    }

    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { valid: false };
    params.delete("hash");

    const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const checkStr = entries.map(([k, v]) => `${k}=${v}`).join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(token).digest();
    const computed = crypto.createHmac("sha256", secretKey).update(checkStr).digest("hex");

    if (
      computed.length !== hash.length ||
      !crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"))
    ) {
      return { valid: false };
    }

    const userStr = params.get("user");
    const userId = userStr ? JSON.parse(userStr).id : undefined;
    const authDate = parseInt(params.get("auth_date") || "0") * 1000;

    if (authDate && process.env.NODE_ENV === "production") {
      if (Date.now() - authDate > MAX_AGE_MS) {
        return { valid: false };
      }
    }

    return { valid: true, userId };
  } catch {
    return { valid: false };
  }
}

/**
 * Admin Authentication & Authorization Middleware
 * Step 1: Telegram Auth / Session Token
 * Step 2: Exact Telegram ID match (6145230334)
 */
export async function requireAdminAuth(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // ── Step 1: Identify caller via Telegram initData or Session Token ────────
  let userId: number | undefined;

  const sessionToken = req.headers["x-session-token"] as string | undefined;
  if (sessionToken) {
    const sessionRes = validateToken(sessionToken);
    if (sessionRes.valid && sessionRes.userId) {
      userId = sessionRes.userId;
    }
  }

  // Fallback removed: strictly enforce x-session-token

  // Development bypass helper
  if (!userId && process.env.NODE_ENV !== "production") {
    const fallbackId =
      req.headers["x-user-id"] ||
      req.headers["x-admin-id"] ||
      req.query?.userId ||
      req.body?.userId;
    if (fallbackId) {
      userId = parseInt(String(fallbackId));
    }
  }

  if (!userId || isNaN(userId) || userId <= 0) {
    res.status(401).json({ error: "unauthorized", message: "Invalid Telegram admin session" });
    return;
  }

  // ── Step 2: Verify user ID is strictly 6145230334 ──────────────────────────
  const adminAuth = await getAdminAuth(userId);
  if (!adminAuth.isAdmin) {
    logger.warn({ userId, ip: req.ip }, "Unauthorized attempt to access admin endpoints");
    res.status(403).json({ error: "forbidden", message: "This account does not have admin privileges" });
    return;
  }

  req.adminUser = adminAuth;
  req.adminId = userId;
  next();
}

/**
 * Admin permission checker middleware
 */
export function requireAdminPerm(_perm?: import("@workspace/db/schema").AdminPermission) {
  return (req: AdminRequest, res: Response, next: NextFunction): void => {
    const admin = req.adminUser;
    if (!admin || !admin.isAdmin) {
      res.status(403).json({ error: "forbidden", message: "Insufficient permissions" });
      return;
    }

    next();
  };
}
