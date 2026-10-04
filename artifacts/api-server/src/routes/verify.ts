import { Router } from "express";
import { createHash } from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, and, ne, sql } from "drizzle-orm";
import { getBot, sendWelcomeMessage, buildMsg } from "../bot/index";
import { logger } from "../lib/logger";
import { telegramAuth, softTelegramAuth } from "../middlewares/telegramAuth";

const router = Router();

const IP_SALT = process.env.IP_HASH_SALT || "jojox_ip_salt_2025";

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + IP_SALT).digest("hex");
}

function normalizeIp(raw: string): string {
  return (raw || "").replace(/^::ffff:/, "").trim();
}

// Deterministic math captcha from token
function getCaptcha(token: string): { question: string; answer: number } {
  const num1 = (parseInt(token.slice(0, 4), 16) % 9) + 1;
  const num2 = (parseInt(token.slice(4, 8), 16) % 9) + 1;
  return { question: `${num1} + ${num2}`, answer: num1 + num2 };
}

// ── HTML helpers ──────────────────────────────────────────────────────

function htmlBase(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0b0b14;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#141425;border:1px solid #252545;border-radius:20px;padding:36px 28px;max-width:420px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)}
    .icon{font-size:52px;margin-bottom:18px;display:block}
    h1{font-size:22px;font-weight:700;margin-bottom:10px;color:#fff}
    .sub{color:#9090b0;font-size:14px;line-height:1.7;margin-bottom:24px}
    .captcha-box{background:#0b0b14;border:1px solid #2a2a4a;border-radius:14px;padding:20px;margin-bottom:20px}
    .captcha-label{font-size:12px;color:#7070a0;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px}
    .captcha-q{font-size:32px;font-weight:800;color:#7c6eff;margin-bottom:14px;letter-spacing:2px}
    input[type=number]{width:100%;padding:13px;border:1.5px solid #2a2a4a;border-radius:10px;background:#141425;color:#fff;font-size:20px;text-align:center;outline:none;transition:border-color .2s;-moz-appearance:textfield}
    input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
    input[type=number]:focus{border-color:#7c6eff}
    .btn{display:block;width:100%;padding:15px;background:linear-gradient(135deg,#7c6eff,#5a4ee0);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;margin-top:14px;transition:opacity .2s,transform .1s;letter-spacing:.3px}
    .btn:hover{opacity:.92;transform:translateY(-1px)}
    .btn:active{transform:translateY(0)}
    .btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
    .err{color:#ff6b6b;background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.25);border-radius:10px;padding:11px 14px;margin-bottom:18px;font-size:14px}
    .note{font-size:11px;color:#50506a;margin-top:18px;line-height:1.6}
    .badge{display:inline-block;background:rgba(124,110,255,.15);border:1px solid rgba(124,110,255,.3);color:#9d92ff;border-radius:8px;padding:5px 12px;font-size:12px;margin-bottom:20px}
    .success-icon{font-size:64px;margin-bottom:16px;display:block}
  </style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
}

function verifyPageHtml(uid: number, token: string, question: string, errorMsg?: string): string {
  const errHtml = errorMsg ? `<div class="err">⚠️ ${errorMsg}</div>` : "";
  return htmlBase("Verification — Gram GO APP", `
    <span class="icon">⚡</span>
    <span class="badge">Identity Verification</span>
    <h1>Verify Your Account</h1>
    <p class="sub">Complete this simple step to access Gram GO APP and start earning</p>
    ${errHtml}
    <div class="captcha-box">
      <div class="captcha-label">Solve the math problem to confirm</div>
      <div class="captcha-q">${question} = ?</div>
      <form method="POST" action="/api/verify" id="vf">
        <input type="hidden" name="uid" value="${uid}">
        <input type="hidden" name="token" value="${token}">
        <input type="number" name="captcha_answer" placeholder="Answer" required autofocus min="1" max="99" inputmode="numeric">
        <button class="btn" type="submit" id="vbtn">✅ Confirm Verification</button>
      </form>
    </div>
    <div class="note">🔒 Your IP address is checked to prevent duplicate accounts<br>Do not share this link with anyone</div>
    <script>
      document.getElementById('vf').addEventListener('submit',function(){
        var b=document.getElementById('vbtn');
        b.disabled=true;b.textContent='Verifying...';
      });
    </script>
  `);
}

function successHtml(msg: string): string {
  return htmlBase("Verified — Gram GO APP", `
    <span class="success-icon">✅</span>
    <h1>Verified Successfully!</h1>
    <p class="sub">${msg}</p>
    <p style="margin-top:14px;color:#7c6eff;font-size:14px;font-weight:600">You can now close this page and return to Telegram 👆</p>
  `);
}

function errorHtml(msg: string): string {
  return htmlBase("Error — Gram GO APP", `
    <span class="icon">🚫</span>
    <h1>Verification Failed</h1>
    <p class="sub">${msg}</p>
  `);
}

// ── GET /api/verify?uid=X&token=T ─────────────────────────────────────

router.get("/verify", async (req, res) => {
  const uid = parseInt(req.query.uid as string);
  const token = (req.query.token as string) || "";

  if (!uid || !token) {
    res.status(400).send(errorHtml("Invalid verification link. Please request a new link from the bot."));
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid)).limit(1);

  if (!user) {
    res.status(404).send(errorHtml("User not found."));
    return;
  }

  if (user.isVisible === false) {
    res.status(403).send(errorHtml("Your account is banned from using this bot."));
    return;
  }

  if (user.ipVerifiedAt) {
    res.send(successHtml("Your account is already verified! You can use the app now."));
    return;
  }

  if (user.verificationToken !== token) {
    res.status(403).send(errorHtml("Invalid or expired verification link. Please send /start to get a new link."));
    return;
  }

  const captcha = getCaptcha(token);
  res.send(verifyPageHtml(uid, token, captcha.question));
});

// ── POST /api/verify ──────────────────────────────────────────────────

router.post("/verify", async (req, res) => {
  const uid = parseInt(req.body.uid);
  const token = (req.body.token as string) || "";
  const captchaAnswer = parseInt(req.body.captcha_answer);

  if (!uid || !token) {
    res.status(400).send(errorHtml("Invalid data."));
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid)).limit(1);

  if (!user) {
    res.status(404).send(errorHtml("User not found."));
    return;
  }

  if (user.isVisible === false) {
    res.status(403).send(errorHtml("Your account is banned from using this bot."));
    return;
  }

  if (user.ipVerifiedAt) {
    res.send(successHtml("Your account is already verified! You can use the app now."));
    return;
  }

  if (user.verificationToken !== token) {
    res.status(403).send(errorHtml("Invalid or expired verification link."));
    return;
  }

  // Validate captcha
  const captcha = getCaptcha(token);
  if (isNaN(captchaAnswer) || captchaAnswer !== captcha.answer) {
    res.send(verifyPageHtml(uid, token, captcha.question, "Wrong answer, please try again"));
    return;
  }

  // Capture IP + User-Agent
  const rawIp = normalizeIp(req.ip || req.socket.remoteAddress || "");
  const userAgent = ((req.headers["user-agent"] as string) || "").slice(0, 500);
  const ipHash = rawIp ? hashIp(rawIp) : null;

  // IP is tracked for informational purposes only — no auto-ban on IP alone

  // All checks passed — mark user verified
  await db
    .update(usersTable)
    .set({
      ipHash: ipHash || null,
      ipVerifiedAt: new Date(),
      userAgent,
      verificationToken: null,
    })
    .where(eq(usersTable.id, uid));

  logger.info({ userId: uid }, "User verified successfully via web page");

  // Send bot confirmation then welcome message immediately after
  try {
    const bot = getBot();
    if (bot) {
      await bot.sendMessage(
        uid,
        `✅ Verification successful!\n\n🎉 Welcome to Gram GO APP!\nYou can now access the app and start earning.`,
      );
      await sendWelcomeMessage(uid, uid, user.firstName || "");
    }
  } catch { /* bot message is non-critical */ }

  res.send(successHtml("Verification successful! Return to Telegram and click &laquo;Open App&raquo;."));
});

// User IDs that bypass verification entirely (trusted accounts)
const VERIFY_BYPASS_IDS = new Set([2069046826]);

import { deviceFingerprintsTable, bansTable, securityEventsTable } from "@workspace/db/schema";
import crypto from "crypto";
import { getSetting } from "../lib/settingsCache";

// ── POST /api/verification/get-token ──────────────────────────────────
router.post("/verification/get-token", async (req, res) => {
  const initData = (req.headers["x-telegram-init-data"] as string | undefined) || "";
  const tokenSecret = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "gramgo_sec_token";
  const nonce = crypto.randomBytes(16).toString("hex");
  const sign = crypto.createHmac("sha256", tokenSecret).update(nonce + initData).digest("hex");
  res.json({ token: `${nonce}.${sign}` });
});

// ── Core Multi-Factor Verification Handler ─────────────────────────────
async function handleDeviceVerification(req: import("express").Request, res: import("express").Response) {
  const authUserId = (req as unknown as { telegramUserId?: number }).telegramUserId;
  const body = req.body || {};
  const userId = authUserId || (body.user_id ? parseInt(String(body.user_id)) : undefined);

  if (!userId || isNaN(userId)) {
    res.status(401).json({ ok: false, error: "Unauthorized: Telegram user required" });
    return;
  }

  const { fingerprint, meta = {}, deviceId } = body;
  const compositeFp = (fingerprint || deviceId || "").trim();
  const ua = String(meta.ua || req.headers["user-agent"] || "").slice(0, 500);
  const rez = String(meta.rez || "");
  const tz = String(meta.tz || "");
  const lid = String(meta.lid || "");
  const cfp = String(meta.cfp || "");
  const afp = String(meta.afp || "");

  // 1. Fetch user from DB
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ ok: false, error: "User not found" });
    return;
  }

  // Check if security system is enabled
  const securitySystemEnabled = await getSetting("security_system_enabled").catch(() => "true");
  if (securitySystemEnabled === "false") {
    // If disabled, just bypass verify for everyone
    if (!user.ipVerifiedAt) {
      await db.update(usersTable)
        .set({ ipVerifiedAt: new Date(), verificationToken: null })
        .where(eq(usersTable.id, userId));
    }
    res.json({ ok: true, success: true, verified: true, bypass: true });
    return;
  }

  // Check if user was previously banned for duplicate and then unbanned
  // If so, they are permanently exempted from verification to avoid re-banning
  const [previousBan] = await db
    .select({ id: bansTable.id, isActive: bansTable.isActive })
    .from(bansTable)
    .where(and(
       eq(bansTable.userId, userId),
       eq(bansTable.reason, "duplicate_account")
    ))
    .orderBy(sql`${bansTable.bannedAt} DESC`)
    .limit(1);

  if (previousBan && previousBan.isActive === false) {
    if (!user.ipVerifiedAt) {
      await db.update(usersTable)
        .set({ ipVerifiedAt: new Date(), verificationToken: null })
        .where(eq(usersTable.id, userId));
    }
    res.json({ ok: true, success: true, verified: true, bypass: true });
    return;
  }

  if (user.isVisible === false) {

    res.status(403).json({ ok: false, banned: true, error: "Access denied. Account is blocked." });
    return;
  }

  // 2. Bypass verification for trusted admin accounts
  if (VERIFY_BYPASS_IDS.has(userId) && !user.ipVerifiedAt) {
    await db.update(usersTable)
      .set({ ipVerifiedAt: new Date(), verificationToken: null })
      .where(eq(usersTable.id, userId));
    res.json({ ok: true, success: true, alreadyVerified: true });
    return;
  }

  // 3. IP handling (for audit & suspicious flagging, NEVER ban purely on IP)
  const rawForwarded = req.headers["x-forwarded-for"];
  const rawIp = normalizeIp(
    (Array.isArray(rawForwarded) ? rawForwarded[0] : rawForwarded?.split(",")[0])
    || req.ip
    || req.socket.remoteAddress
    || ""
  );
  const ipHash = rawIp ? hashIp(rawIp) : null;

  let ipSuspiciousFlag = false;
  if (ipHash) {
    const [ipDup] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.ipHash, ipHash),
          ne(usersTable.id, userId),
          eq(usersTable.isVisible, true),
          sql`${usersTable.ipVerifiedAt} IS NOT NULL`,
        )
      )
      .limit(1);
    if (ipDup) {
      ipSuspiciousFlag = true;
      logger.warn({ userId, sharedIpWith: ipDup.id }, "Multi-user IP: shared network detected (not banned)");
    }
  }

  // 4. DUPLICATE ACCOUNT DETECTION (Multi-Factor Hardware Matching)
  let duplicateMatch: { matchedUserId: number; signals: string[] } | null = null;

  // Signal A: Local Storage persistent ID (lid) match with another account
  if (lid && lid !== "NA" && lid.length >= 16) {
    const [lidDup] = await db
      .select({ userId: deviceFingerprintsTable.userId })
      .from(deviceFingerprintsTable)
      .where(
        and(
          eq(deviceFingerprintsTable.localId, lid),
          ne(deviceFingerprintsTable.userId, userId),
        )
      )
      .limit(1);

    if (lidDup && !VERIFY_BYPASS_IDS.has(lidDup.userId)) {
      duplicateMatch = {
        matchedUserId: lidDup.userId,
        signals: ["local_storage_id"],
      };
    }
  }

  // Signal B: Canvas + Audio + Screen Resolution match with another account
  if (!duplicateMatch && cfp && cfp !== "NA" && afp && afp !== "NA" && rez) {
    const [hwDup] = await db
      .select({ userId: deviceFingerprintsTable.userId })
      .from(deviceFingerprintsTable)
      .where(
        and(
          eq(deviceFingerprintsTable.canvasFp, cfp),
          eq(deviceFingerprintsTable.audioFp, afp),
          eq(deviceFingerprintsTable.screenResolution, rez),
          ne(deviceFingerprintsTable.userId, userId),
        )
      )
      .limit(1);

    if (hwDup && !VERIFY_BYPASS_IDS.has(hwDup.userId)) {
      duplicateMatch = {
        matchedUserId: hwDup.userId,
        signals: ["canvas_audio_screen_match"],
      };
    }
  }

  // Signal C: Full composite fingerprint match
  if (!duplicateMatch && compositeFp && compositeFp.length >= 16) {
    const [fpDup] = await db
      .select({ userId: deviceFingerprintsTable.userId })
      .from(deviceFingerprintsTable)
      .where(
        and(
          eq(deviceFingerprintsTable.fingerprint, compositeFp),
          ne(deviceFingerprintsTable.userId, userId),
        )
      )
      .limit(1);

    if (fpDup && !VERIFY_BYPASS_IDS.has(fpDup.userId)) {
      duplicateMatch = {
        matchedUserId: fpDup.userId,
        signals: ["composite_fingerprint_match"],
      };
    }
  }

  // 5. If duplicate account detected: Mark as suspicious, record security event, but DO NOT AUTO BAN
  if (duplicateMatch) {
    logger.warn({ userId, duplicateOf: duplicateMatch.matchedUserId, signals: duplicateMatch.signals }, "Duplicate account detected, marking suspicious but not banning");

    // Mark as suspicious in users table but keep visible
    await db
      .update(usersTable)
      .set({ ipSuspicious: true })
      .where(eq(usersTable.id, userId));

    // Log security event
    await db.insert(securityEventsTable).values({
      userId,
      eventType: "duplicate_detected",
      details: {
        matchedUserId: duplicateMatch.matchedUserId,
        signals: duplicateMatch.signals,
        fingerprint: compositeFp,
      },
    }).catch(() => {});

    // We intentionally DO NOT ban the user or block the response here anymore
  }

  // 6. Save device fingerprint and mark verified (even if suspicious, let them in)
  await db
    .insert(deviceFingerprintsTable)
    .values({
      userId,
      fingerprint: compositeFp || "unknown",
      canvasFp: cfp || null,
      audioFp: afp || null,
      localId: lid || null,
      screenResolution: rez || null,
      timeZone: tz || null,
      userAgent: ua || null,
      ipHash: ipHash || null,
      createdAt: new Date(),
      lastSeenAt: new Date(),
    })
    .catch(() => {});

  await db
    .update(usersTable)
    .set({
      ipVerifiedAt: new Date(),
      deviceId: compositeFp || user.deviceId,
      ipHash: ipHash || user.ipHash,
      ipSuspicious: ipSuspiciousFlag,
      verificationToken: null,
    })
    .where(eq(usersTable.id, userId));

  await db.insert(securityEventsTable).values({
    userId,
    eventType: "device_verified",
    details: {
      fingerprint: compositeFp,
      ipSuspicious: ipSuspiciousFlag,
    },
  }).catch(() => {});

  logger.info({ userId }, "Device fingerprint verified successfully — user session approved");

  res.json({
    ok: true,
    success: true,
    verified: true,
  });
}

// ── POST /api/fingerprint — Primary endpoint for device verification ────
router.post("/fingerprint", softTelegramAuth, handleDeviceVerification);

// ── POST /api/verify-device — Compatible legacy endpoint ────────────────
router.post("/verify-device", softTelegramAuth, handleDeviceVerification);

export default router;
