import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { validateToken } from "../lib/sessionToken";
import { logger } from "../lib/logger";

export interface SessionRequest extends Request {
  sessionUserId?: number;
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

// ── requireSession middleware ─────────────────────────────────────────
// Validates x-session-token or x-telegram-init-data header. Blocks with 401 if missing/invalid.
// Attaches req.sessionUserId for downstream handlers.
export function requireSession(
  req: SessionRequest,
  res: Response,
  next: NextFunction
): void {
  const token = req.headers["x-session-token"] as string | undefined;

  if (token) {
    const result = validateToken(token);
    if (result.valid) {
      logger.debug({ userId: result.userId }, "session validated via token");
      req.sessionUserId = result.userId;
      next();
      return;
    }
  }

  // Fallback to cryptographically verified Telegram initData
  const initData = req.headers["x-telegram-init-data"] as string | undefined;
  if (initData) {
    const initResult = parseTelegramInitData(initData);
    if (initResult.valid && initResult.userId) {
      logger.debug({ userId: initResult.userId }, "session validated via initData fallback");
      req.sessionUserId = initResult.userId;
      next();
      return;
    }
  }

  // In development without initData, allow through
  if (process.env.NODE_ENV !== "production") {
    const rawId =
      req.body?.userId ?? req.body?.id ?? req.params?.id ?? req.query?.userId ?? req.headers["x-user-id"];
    if (rawId) {
      req.sessionUserId = parseInt(String(rawId));
      next();
      return;
    }
  }

  if (token) {
    res.status(401).json({ error: "session_expired", message: "Session expired" });
    return;
  }
  res.status(401).json({ error: "session_required", message: "Session required: please open app from Telegram" });
}
