import { Router } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import {
  withdrawalsTable,
  depositsTable,
  usersTable,
  botSettingsTable,
  referralsTable,
  transactionsTable,
} from "@workspace/db/schema";
import { eq, sql, desc, and, or } from "drizzle-orm";
import { sendWithdrawalNotification, getBot } from "../bot";
import { getMissingChannels, getRequiredChannels } from "../bot/subscription";
import { verifyAccessMiddleware } from "../middlewares/verifyAccess";
import { requireSession } from "../middlewares/requireSession";
import { getSetting } from "../lib/settingsCache";
import { logger } from "../lib/logger";
import { verifyTonDepositTransaction } from "../lib/depositVerifier";

const router = Router();

const MAX_WITHDRAWAL = 10000;

// TON address: EQ/UQ/kQ/0Q + 46 base64url chars or 48 alphanumeric/special
const TON_ADDRESS_RE = /^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/;

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Rate limit: Max 5 withdrawal requests per 10 minutes
const withdrawLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات سحب كثيرة، حاول بعد قليل" },
  skip: () => process.env.NODE_ENV !== "production",
});

// Rate limit: Max 15 deposit verification attempts per 10 minutes
const depositLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات إيداع كثيرة، حاول بعد قليل" },
  skip: () => process.env.NODE_ENV !== "production",
});

// ── Real-time security check at withdrawal request time ───────────────────────
async function runWithdrawalSecurityCheck(opts: {
  userId: number;
  userDisplay: string;
  amount: string;
  withdrawalId: number;
  ownerId: number;
}): Promise<boolean> {
  const { userId, userDisplay, amount, withdrawalId, ownerId } = opts;

  let bot: ReturnType<typeof getBot>;
  try {
    bot = getBot();
  } catch {
    return false;
  }

  const channels = await getRequiredChannels().catch(() => []);
  if (channels.length === 0) return false;

  // Check 1: is the requesting user still subscribed?
  const userMissing = await getMissingChannels(bot, userId).catch(() => [] as typeof channels);

  // Check 2: active referrals subscription status
  const activeRefs = await db
    .select({ id: referralsTable.id, referredId: referralsTable.referredId })
    .from(referralsTable)
    .where(and(eq(referralsTable.referrerId, userId), eq(referralsTable.status, "active")));

  let validRefs = 0,
    leftRefs = 0;
  for (const ref of activeRefs) {
    const missing = await getMissingChannels(bot, ref.referredId).catch(() => [""]);
    if (missing.length === 0) validRefs++;
    else leftRefs++;
  }

  const totalRefs = activeRefs.length;
  const validPct = totalRefs > 0 ? Math.round((validRefs / totalRefs) * 100) : 100;

  const isSuspicious = userMissing.length > 0 || leftRefs > 0;
  if (!isSuspicious) return false;

  let userStatusLines: string;
  if (userMissing.length === 0) {
    userStatusLines = `✅ منضم في جميع القنوات (${channels.length}/${channels.length})`;
  } else {
    const joinedCount = channels.length - userMissing.length;
    const leftNames = userMissing.map((c) => esc(c.title || c.username)).join("، ");
    userStatusLines =
      `✅ منضم في ${joinedCount} من ${channels.length} قناة\n` + `❌ خرج من: ${leftNames}`;
  }

  const refStatusLines =
    `✅ منضمين ومحسوبين: ${validRefs}\n` +
    `❌ خرجوا من القنوات: ${leftRefs}\n` +
    `📊 النسبة الصحيحة: ${validPct}%`;

  try {
    await bot.sendMessage(
      ownerId,
      `🚨 <b>تنبيه سحب مشبوه!</b>\n` +
        `المستخدم ${userDisplay} طلب سحب <b>${esc(amount)} TON</b>\n\n` +
        `📢 <b>حالة المستخدم:</b>\n${userStatusLines}\n\n` +
        `👥 <b>حالة إحالاته:</b>\n${refStatusLines}\n\n` +
        `اختر الإجراء:`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ موافقة رغم ذلك", callback_data: `withdraw_approve_${withdrawalId}` },
              { text: "❌ رفض السحب", callback_data: `withdraw_reject_${withdrawalId}` },
              { text: "🚫 حظر المستخدم", callback_data: `withdraw_ban_${withdrawalId}` },
            ],
          ],
        },
      }
    );
  } catch (err) {
    logger.error({ err }, "withdrawalSecurityCheck: failed to send admin alert");
  }

  // Notify the user that their withdrawal is under review
  await bot
    .sendMessage(userId, `⏳ سحبك قيد المراجعة، سيتم الرد خلال قليل.`)
    .catch(() => {});

  return true;
}

// ── WITHDRAWAL ENDPOINT ───────────────────────────────────────────────────────
router.post("/", withdrawLimiter, requireSession, verifyAccessMiddleware, async (req, res) => {
  const { userId, amount, walletAddress } = req.body;

  if (!userId || !amount || !walletAddress) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" });
    return;
  }

  const numUserId = parseInt(String(userId));
  if (isNaN(numUserId) || numUserId <= 0) {
    res.status(400).json({ error: "معرّف مستخدم غير صحيح" });
    return;
  }

  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  if (sessionReq.sessionUserId !== undefined && sessionReq.sessionUserId !== numUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const cleanAddress = String(walletAddress).trim();
  if (!TON_ADDRESS_RE.test(cleanAddress)) {
    res.status(400).json({
      error: "عنوان محفظة TON غير صحيح. يجب أن يبدأ بـ EQ أو UQ ويتكون من 48 حرفاً.",
    });
    return;
  }

  const [rawMin, rawMax, rawDailyLimit] = await Promise.all([
    getSetting("min_withdrawal").catch(() => null),
    getSetting("max_withdrawal").catch(() => null),
    getSetting("daily_withdrawal_limit").catch(() => null),
  ]);

  // Read dynamic settings configured by admin
  const MIN_WITHDRAWAL = Math.max(0.001, parseFloat(rawMin ?? "0.1") || 0.1);
  const MAX_WITHDRAWAL_LIMIT = Math.max(MIN_WITHDRAWAL, parseFloat(rawMax ?? "10000") || 10000);
  const DAILY_LIMIT = rawDailyLimit ? parseFloat(rawDailyLimit) : null;

  const amt = parseFloat(String(amount));
  if (isNaN(amt) || amt < MIN_WITHDRAWAL || amt > MAX_WITHDRAWAL_LIMIT) {
    res.status(400).json({
      error: `المبلغ يجب أن يكون بين ${MIN_WITHDRAWAL} و ${MAX_WITHDRAWAL_LIMIT} TON`,
    });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, numUserId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }
  if (user.isVisible === false) {
    res.status(403).json({ error: "الحساب محظور" });
    return;
  }
  if (user.isWithdrawalBanned === true) {
    res.status(403).json({ error: "تم حظر عمليات السحب لهذا الحساب من قبل الإدارة" });
    return;
  }

  // Subscription check
  if (user.isBlockedForLeaving === true) {
    res.status(403).json({
      error: "لا يمكن السحب — يجب إعادة الانضمام للقنوات المطلوبة أولاً",
    });
    return;
  }

  // Daily limit check
  if (DAILY_LIMIT && DAILY_LIMIT > 0) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const [todaySumRes] = await db
      .select({ total: sql<string>`coalesce(sum(amount), 0)` })
      .from(withdrawalsTable)
      .where(and(eq(withdrawalsTable.userId, numUserId), sql`created_at >= ${today}`));
    const todayTotal = parseFloat(todaySumRes?.total || "0");
    if (todayTotal + amt > DAILY_LIMIT) {
      res.status(400).json({ error: `تجاوزت حد السحب اليومي المسموح به (${DAILY_LIMIT} TON)` });
      return;
    }
  }

  // Insufficient balance check on Gram
  const currentGramBalance = parseFloat(String(user.gramBalance ?? "0"));
  if (currentGramBalance < amt) {
    res.status(400).json({
      error: `رصيد Gram غير كافٍ. رصيدك الحالي: ${currentGramBalance.toFixed(4)} Gram`,
    });
    return;
  }

  // Prevent duplicate spam requests within last 30 seconds with identical amount
  const thirtySecsAgo = new Date(Date.now() - 30_000);
  const recentPending = await db
    .select({ id: withdrawalsTable.id })
    .from(withdrawalsTable)
    .where(
      and(
        eq(withdrawalsTable.userId, numUserId),
        eq(withdrawalsTable.status, "pending"),
        sql`created_at >= ${thirtySecsAgo}`
      )
    )
    .limit(1);

  if (recentPending.length > 0) {
    res.status(400).json({ error: "لديك طلب سحب قيد المعالجة، يرجى الانتظار قليلاً" });
    return;
  }

  // Atomic database transaction: deduct gram_balance, insert withdrawal, insert transaction log
  let wdRecord: typeof withdrawalsTable.$inferSelect;
  let updatedUserRecord: typeof usersTable.$inferSelect | undefined;
  try {
    const result = await db.transaction(async (tx) => {
      // Re-verify balance inside transaction lock
      const [lockedUser] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, numUserId))
        .limit(1);

      if (!lockedUser || parseFloat(String(lockedUser.gramBalance ?? "0")) < amt) {
        throw new Error("رصيد Gram غير كافٍ");
      }

      await tx
        .update(usersTable)
        .set({ gramBalance: sql`GREATEST(gram_balance - ${amt}, 0)` })
        .where(eq(usersTable.id, numUserId));

      const [newWd] = await tx
        .insert(withdrawalsTable)
        .values({
          userId: numUserId,
          amount: String(amt),
          currency: "Gram",
          walletAddress: cleanAddress,
          status: "pending",
        })
        .returning();

      await tx.insert(transactionsTable).values({
        userId: numUserId,
        type: "withdrawal_request",
        amount: String(amt),
        currency: "Gram",
        details: { withdrawalId: newWd.id, walletAddress: cleanAddress },
      });

      const [uRecord] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, numUserId))
        .limit(1);

      return { newWd, uRecord };
    });

    wdRecord = result.newWd;
    updatedUserRecord = result.uRecord;
  } catch (txErr) {
    logger.error({ err: txErr }, "Withdrawal transaction failed");
    res.status(400).json({ error: txErr instanceof Error ? txErr.message : "فشلت عملية السحب" });
    return;
  }

  const userDisplay = user.username
    ? `@${esc(user.username)}`
    : esc(user.firstName || String(numUserId));

  // Fetch owner ID once
  const ownerIdRow = await db
    .select()
    .from(botSettingsTable)
    .where(eq(botSettingsTable.key, "owner_telegram_id"))
    .limit(1);
  const ownerId =
    ownerIdRow.length > 0 && ownerIdRow[0].value ? parseInt(ownerIdRow[0].value) : null;

  // Real-time security check
  let securityAlertSent = false;
  if (ownerId) {
    try {
      securityAlertSent = await runWithdrawalSecurityCheck({
        userId: numUserId,
        userDisplay,
        amount: String(amt),
        withdrawalId: wdRecord.id,
        ownerId,
      });
    } catch (err) {
      logger.warn({ err }, "withdrawals: security check error (non-critical)");
    }
  }

  // Normal admin notification if security check didn't already alert
  if (!securityAlertSent && ownerId) {
    try {
      await sendWithdrawalNotification(
        ownerId,
        {
          firstName: user.firstName || "",
          username: user.username,
          id: numUserId,
          ipHash: user.ipHash,
          ipSuspicious: user.ipSuspicious,
        },
        String(amt),
        cleanAddress,
        wdRecord.id
      );
    } catch {
      /* notification failure is non-critical */
    }
  }

  // Send message to user that request was received
  try {
    const bot = getBot();
    if (bot) {
      await bot.sendMessage(
        numUserId,
        `⏳ <b>طلب سحب قيد المراجعة</b>\n\n` +
          `💰 المبلغ: <b>${amt.toFixed(4)} Gram</b>\n` +
          `📍 المحفظة: <code>${esc(cleanAddress)}</code>\n\n` +
          `تم استلام طلب السحب بنجاح وسيتم معالجته قريباً.`,
        { parse_mode: "HTML" }
      );
    }
  } catch {
    /* ignore */
  }

  res.json({ success: true, withdrawal: wdRecord, user: updatedUserRecord });
});

// ── GET User Withdrawals ──────────────────────────────────────────────────────
router.get("/:userId", requireSession, async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId) || userId <= 0) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  if (sessionReq.sessionUserId !== undefined && sessionReq.sessionUserId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const withdrawals = await db
    .select()
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.userId, userId))
    .orderBy(desc(withdrawalsTable.createdAt));

  res.json(withdrawals);
});

// ── DEPOSIT VERIFICATION & RECORDING ENDPOINT ─────────────────────────────────
router.post(
  "/deposit",
  depositLimiter,
  requireSession,
  verifyAccessMiddleware,
  async (req, res) => {
    const { userId, amount, walletAddress, txHash, boc } = req.body;
    const numUserId = parseInt(String(userId));

    if (isNaN(numUserId) || numUserId <= 0 || !amount) {
      res.status(400).json({ error: "بيانات الإيداع غير مكتملة" });
      return;
    }

    const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
    if (sessionReq.sessionUserId !== undefined && sessionReq.sessionUserId !== numUserId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const amtNum = parseFloat(String(amount));
    if (isNaN(amtNum) || amtNum <= 0) {
      res.status(400).json({ error: "المبلغ يجب أن يكون أكبر من 0" });
      return;
    }

    const cleanTxHash = txHash ? String(txHash).trim() : null;
    const cleanWallet = walletAddress ? String(walletAddress).trim() : null;

    // ── 1. Double-Transaction Protection (Database check) ─────────────────────
    if (cleanTxHash) {
      const existingConfirmed = await db
        .select()
        .from(depositsTable)
        .where(
          and(
            or(
              eq(depositsTable.txHash, cleanTxHash),
              eq(depositsTable.txHash, cleanTxHash.toLowerCase()),
              eq(depositsTable.txHash, cleanTxHash.toUpperCase())
            ),
            eq(depositsTable.status, "confirmed")
          )
        )
        .limit(1);

      if (existingConfirmed.length > 0) {
        res.status(400).json({
          error: "❌ Transaction already processed (تمت معالجة هذه المعاملة مسبقاً)",
        });
        return;
      }
    }

    // ── 2. On-Chain Blockchain Verification ───────────────────────────────────
    const verification = await verifyTonDepositTransaction({
      userId: numUserId,
      amount: amtNum,
      walletAddress: cleanWallet,
      txHash: cleanTxHash,
      boc: boc ? String(boc).trim() : null,
    });

    if (verification.isDuplicate) {
      res.status(400).json({
        error: "❌ Transaction already processed (تمت معالجة هذه المعاملة مسبقاً)",
      });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, numUserId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }

    const bot = getBot();

    // ── 3. Case A: Transaction Confirmed on TON Blockchain ────────────────────
    if (verification.verified) {
      const verifiedAmt = parseFloat(verification.amount || String(amtNum));
      const confirmedTxHash = verification.txHash || cleanTxHash || `tx_${Date.now()}`;
      const senderWallet = verification.senderWallet || cleanWallet || user.savedWalletAddress;

      let confirmedDeposit: typeof depositsTable.$inferSelect;
      let newTonBalance = "0";

      try {
        const txRes = await db.transaction(async (tx) => {
          // Double check inside transaction
          const existing = await tx
            .select()
            .from(depositsTable)
            .where(
              and(
                eq(depositsTable.txHash, confirmedTxHash),
                eq(depositsTable.status, "confirmed")
              )
            )
            .limit(1);

          if (existing.length > 0) {
            throw new Error("Transaction already processed");
          }

          const [dep] = await tx
            .insert(depositsTable)
            .values({
              userId: numUserId,
              amount: String(verifiedAmt),
              currency: "TON",
              walletAddress: senderWallet,
              txHash: confirmedTxHash,
              status: "confirmed",
              confirmedAt: verification.confirmedAt || new Date(),
            })
            .returning();

          const [updatedUser] = await tx
            .update(usersTable)
            .set({
              tonBalance: sql`ton_balance + ${verifiedAmt}`,
              savedWalletAddress: senderWallet || user.savedWalletAddress,
            })
            .where(eq(usersTable.id, numUserId))
            .returning();

          await tx.insert(transactionsTable).values({
            userId: numUserId,
            type: "deposit",
            amount: String(verifiedAmt),
            currency: "TON",
            details: {
              depositId: dep.id,
              txHash: confirmedTxHash,
              walletAddress: senderWallet,
            },
          });

          return { dep, updatedUser };
        });

        confirmedDeposit = txRes.dep;
        newTonBalance = txRes.updatedUser.tonBalance;
      } catch (dbErr) {
        logger.error({ err: dbErr }, "Database transaction failed during deposit confirmation");
        res.status(400).json({
          error: dbErr instanceof Error ? dbErr.message : "فشل تسجيل الإيداع",
        });
        return;
      }

      // ── 4. Telegram Notification to Admin/Owner ─────────────────────────────
      const ownerIdRow = await db
        .select()
        .from(botSettingsTable)
        .where(eq(botSettingsTable.key, "owner_telegram_id"))
        .limit(1);
      const ownerId =
        ownerIdRow.length > 0 && ownerIdRow[0].value ? parseInt(ownerIdRow[0].value) : null;

      const explorerUrl = confirmedTxHash && !confirmedTxHash.startsWith("tx_")
        ? `https://tonviewer.com/transaction/${encodeURIComponent(confirmedTxHash)}`
        : null;

      const userFullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
      const userDisplayName = user.username
        ? `@${esc(user.username)}` + (userFullName ? ` (${esc(userFullName)})` : "")
        : esc(userFullName || `User #${user.id}`);

      const depositReplyMarkup = explorerUrl
        ? {
            inline_keyboard: [
              [
                {
                  text: "View on Blockchain",
                  url: explorerUrl,
                  icon_custom_emoji_id: "5314730683988458852",
                  style: "primary",
                } as any,
              ],
            ],
          }
        : undefined;

      if (bot && ownerId) {
        try {
          const formattedDate = new Date().toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          });

          const adminMsg =
            `<tg-emoji emoji-id="6127223820764844602">✅</tg-emoji><b>Deposit Successful (New Deposit)</b>\n\n` +
            `<tg-emoji emoji-id="5260399854500191689">👤</tg-emoji>${userDisplayName}\n\n` +
            `<tg-emoji emoji-id="5422683699130933153">🪪</tg-emoji><code>${user.id}</code>\n\n` +
            `<tg-emoji emoji-id="5945101187186433635">💎</tg-emoji><b>Amount:</b>\n` +
            `<b>${verifiedAmt.toFixed(4)} TON</b>\n\n` +
            `<tg-emoji emoji-id="5409048419211682843">💵</tg-emoji><b>User New Balance:</b>\n` +
            `<b>${parseFloat(newTonBalance).toFixed(4)} TON</b>\n\n` +
            `<tg-emoji emoji-id="5039557485157942342">👛</tg-emoji><b>Transaction Hash:</b>\n` +
            `<code>${esc(confirmedTxHash)}</code>\n\n` +
            `📅 <b>Date:</b> ${formattedDate}\n` +
            `Status: ✅ <b>VERIFIED REAL TON ON-CHAIN</b>`;

          await bot.sendMessage(ownerId, adminMsg, {
            parse_mode: "HTML",
            reply_markup: depositReplyMarkup,
            disable_web_page_preview: true,
          });
        } catch (botErr) {
          logger.warn({ err: botErr }, "Failed to send deposit notification to admin");
        }
      }

      // ── 5. Telegram Notification to User ────────────────────────────────────
      if (bot) {
        try {
          const userMsg =
            `<tg-emoji emoji-id="6127223820764844602">✅</tg-emoji><b>Deposit Successful</b>\n\n` +
            `<tg-emoji emoji-id="5260399854500191689">👤</tg-emoji>${userDisplayName}\n\n` +
            `<tg-emoji emoji-id="5422683699130933153">🪪</tg-emoji><code>${user.id}</code>\n\n` +
            `<tg-emoji emoji-id="5945101187186433635">💎</tg-emoji><b>Amount:</b>\n` +
            `<b>${verifiedAmt.toFixed(4)} TON</b>\n\n` +
            `<tg-emoji emoji-id="5409048419211682843">💵</tg-emoji><b>New Balance:</b>\n` +
            `<b>${parseFloat(newTonBalance).toFixed(4)} TON</b>\n\n` +
            `<tg-emoji emoji-id="5039557485157942342">👛</tg-emoji><b>Transaction Hash:</b>\n` +
            `<code>${esc(confirmedTxHash)}</code>\n\n` +
            `Your real TON deposit has been verified & confirmed on the TON blockchain.`;

          await bot.sendMessage(numUserId, userMsg, {
            parse_mode: "HTML",
            reply_markup: depositReplyMarkup,
            disable_web_page_preview: true,
          });
        } catch (botErr) {
          logger.warn({ err: botErr }, "Failed to send deposit confirmation to user");
        }
      }

      res.json({
        success: true,
        verified: true,
        deposit: confirmedDeposit,
        newBalance: newTonBalance,
      });
      return;
    }

    // ── 6. Case B: Transaction is Pending on Blockchain ───────────────────────
    if (verification.isPending) {
      const [pendingDep] = await db
        .insert(depositsTable)
        .values({
          userId: numUserId,
          amount: String(amtNum),
          currency: "TON",
          walletAddress: cleanWallet,
          txHash: cleanTxHash || verification.txHash,
          status: "pending",
        })
        .returning();

      if (bot) {
        try {
          await bot.sendMessage(
            numUserId,
            `⏳ <b>Deposit Pending</b>\n\n` +
              `💎 <b>Amount:</b> ${amtNum.toFixed(4)} TON\n\n` +
              `Your transaction was submitted and is waiting for confirmation on the TON network.`,
            { parse_mode: "HTML" }
          );
        } catch {
          /* ignore */
        }
      }

      res.json({
        success: false,
        pending: true,
        message: "⏳ Deposit Pending: Transaction is propagating on TON network",
        deposit: pendingDep,
      });
      return;
    }

    // ── 7. Case C: Transaction Failed / Not Found ─────────────────────────────
    const [failedDep] = await db
      .insert(depositsTable)
      .values({
        userId: numUserId,
        amount: String(amtNum),
        currency: "TON",
        walletAddress: cleanWallet,
        txHash: cleanTxHash,
        status: "failed",
        reason: verification.error || "Blockchain verification failed",
      })
      .returning();

    if (bot) {
      try {
        await bot.sendMessage(
          numUserId,
          `❌ <b>Deposit Failed</b>\n\n` +
            `💎 <b>Amount:</b> ${amtNum.toFixed(4)} TON\n` +
            `Reason: ${esc(verification.error || "Verification failed")}`,
          { parse_mode: "HTML" }
        );
      } catch {
        /* ignore */
      }
    }

    res.status(400).json({
      success: false,
      error: verification.error || "فشل التحقق من معاملة الإيداع على شبكة TON",
      deposit: failedDep,
    });
  }
);

// ── GET User Deposits ─────────────────────────────────────────────────────────
router.get("/deposits/:userId", requireSession, async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId) || userId <= 0) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  if (sessionReq.sessionUserId !== undefined && sessionReq.sessionUserId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const deposits = await db
    .select()
    .from(depositsTable)
    .where(eq(depositsTable.userId, userId))
    .orderBy(desc(depositsTable.createdAt));

  res.json(deposits);
});

export default router;
