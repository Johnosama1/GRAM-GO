import TelegramBot from "node-telegram-bot-api";
import { db } from "@workspace/db";
import {
  usersTable,
  botSettingsTable,
  withdrawalsTable,
  depositsTable,
  referralsTable,
} from "@workspace/db/schema";
import { eq, sql, and, ne, count, sum } from "drizzle-orm";
import { getSetting } from "../lib/settingsCache";
import { logger } from "../lib/logger";
import {
  executeAutoWithdrawal,
  isTonConfigured,
} from "../lib/withdrawalProcessor";
import { getWalletAddress, getWalletBalance } from "../lib/tonSender";
import { OWNER_USERNAME, isOwner, getAdminInfo } from "./admin";
import {
  enforceSubscription,
  handleSubRecheckCallback,
  clearAllSubCache,
  clearSubCache,
  getMissingChannels,
  getRequiredChannels,
} from "./subscription";
import { isBotEnabled, clearBotEnabledCache, setBotEnabled } from "./control";
import { calculateUserMining } from "../routes/mining";
import { getAdminState, setAdminState, clearAdminState } from "./fsm";
import { startBroadcast, cancelBroadcast, getBroadcastProgress } from "./broadcast";
import {
  handleUserSupportMessage,
  handleAdminReplyClick,
  handleUserReplyClick,
  deliverAdminReplyToUser,
} from "./support";
import { processWithdrawalVote, getConsensusThreshold } from "./consensus";
import { logAdminAudit } from "../lib/adminSecurity";

const TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.BOT_TOKEN ||
  process.env.TOKEN ||
  "";

let bot: TelegramBot;

export function getBot(): TelegramBot {
  return bot;
}

// ── Async handler tracking ─────────────────────────────────────────────────────
// node-telegram-bot-api fires handlers via EventEmitter (fire-and-forget).
// We collect all handler promises and await them in processUpdateAndWait
// to ensure DB writes + sendMessage finish before the response is sent.
const _handlerPromises: Promise<void>[] = [];

function wrapHandler<T extends unknown[]>(
  fn: (...args: T) => Promise<void> | void,
): (...args: T) => void {
  return (...args: T) => {
    const result = fn(...args);
    if (result instanceof Promise) {
      _handlerPromises.push(
        result.catch((err) => logger.error({ err }, "Bot handler error")),
      );
    }
  };
}

// ── Maintenance check helpers ──────────────────────────────────────────────

async function botIsDisabled(): Promise<boolean> {
  return !(await isBotEnabled());
}

import { isUserAdmin, getAdminAuth } from "../lib/adminSecurity";

async function allowOwnerWhenDisabled(
  userId: number,
  username?: string,
): Promise<boolean> {
  const isAdmin = await isUserAdmin(userId);
  if (isAdmin) return true;
  if (username && !!process.env.OWNER_USERNAME && username.replace(/^@/, "").toLowerCase() === OWNER_USERNAME.toLowerCase()) return true;
  return false;
}

async function maybeBlocked(
  chatId: number,
  userId: number,
  username?: string,
): Promise<boolean> {
  if (!(await botIsDisabled())) return false;
  if (await allowOwnerWhenDisabled(userId, username)) return false;
  await bot.sendMessage(
    chatId,
    "🚧 <b>البوت تحت الصيانة حالياً</b>\n\nنحن نقوم بتحديث وتحسين التطبيق. عد قريباً! 🔧",
    { parse_mode: "HTML" },
  );
  return true;
}

// ── buildMsg: Telegram message with custom emoji entities ─────────────────

const utf16Len = (s: string): number => {
  let n = 0;
  for (const ch of s) n += ch.codePointAt(0)! > 0xffff ? 2 : 1;
  return n;
};

export interface MsgPart {
  text: string;
  emojiId?: string;
}

export function buildMsg(parts: MsgPart[]): {
  text: string;
  entities: TelegramBot.MessageEntity[];
} {
  let text = "";
  let offset = 0;
  const entities: TelegramBot.MessageEntity[] = [];
  for (const p of parts) {
    if (p.emojiId) {
      entities.push({
        type: "custom_emoji",
        offset,
        length: utf16Len(p.text),
        custom_emoji_id: p.emojiId,
      });
    }
    text += p.text;
    offset += utf16Len(p.text);
  }
  return { text, entities };
}

// ── HTML escape helper ─────────────────────────────────────────────────────
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── Referral callback handler ──────────────────────────────────────────────
async function handleReferralCallback(
  bot: TelegramBot,
  q: TelegramBot.CallbackQuery,
): Promise<boolean> {
  const data = q.data ?? "";
  if (!data.startsWith("ref:")) return false;

  const parts = data.split(":");
  const action = parts[1];
  const p1 = parts[2];
  const p2 = parts[3];

  const callerId = q.from.id;
  const chatId = q.message!.chat.id;
  const msgId = q.message!.message_id;

  await bot.answerCallbackQuery(q.id).catch(() => {});

  // ── ref:warn:{referredId} — inviter sends warning to referred user ─────────
  if (action === "warn") {
    const referredId = parseInt(p1);
    if (isNaN(referredId)) return true;

    const missing = await getMissingChannels(bot, referredId).catch(() => []);
    if (missing.length === 0) {
      try {
        await bot.editMessageText(
          "✅ المستخدم عاد للاشتراك في القنوات. لا يوجد ما يلزم.",
          {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [] },
          },
        );
      } catch {
        await bot.sendMessage(chatId, "✅ المستخدم عاد للاشتراك في القنوات.", {
          parse_mode: "HTML",
        });
      }
      return true;
    }

    const channelNames = missing.map((c) => c.title || c.username).join("، ");
    try {
      await bot.sendMessage(
        referredId,
        `⚠️ لقد غادرت قناة <b>${esc(channelNames)}</b>. يجب العودة للاشتراك للحفاظ على إحالتك. اضغط تحقق بعد الانضمام.`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              ...missing.map((ch) => [
                {
                  text: `📢 ${ch.title || `@${ch.username}`}`,
                  url:
                    ch.inviteLink ||
                    `https://t.me/${ch.username.replace(/^@/, "")}`,
                },
              ]),
              [
                {
                  text: "✅ تحققت من الاشتراك",
                  callback_data: `ref:check:${callerId}:${referredId}`,
                },
              ],
            ],
          },
        },
      );

      await db
        .update(referralsTable)
        .set({ warnedAt: new Date() })
        .where(
          and(
            eq(referralsTable.referredId, referredId),
            eq(referralsTable.referrerId, callerId),
            eq(referralsTable.status, "active"),
          ),
        );

      try {
        await bot.editMessageText(
          `✅ تم إرسال التنبيه للمستخدم. يجب عليه الاشتراك في: <b>${esc(channelNames)}</b>`,
          {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [] },
          },
        );
      } catch {
        await bot.sendMessage(chatId, "✅ تم إرسال التنبيه للمستخدم.", {
          parse_mode: "HTML",
        });
      }
    } catch {
      await bot.sendMessage(
        chatId,
        "⚠️ تعذر إرسال التنبيه — المستخدم ربما حظر البوت.",
        { parse_mode: "HTML" },
      );
    }
    return true;
  }

  // ── ref:check:{referrerId}:{referredId} — referred user verifying they rejoined ──
  if (action === "check") {
    const referrerId = parseInt(p1);
    const referredId = parseInt(p2);
    if (isNaN(referrerId) || isNaN(referredId) || callerId !== referredId) {
      await bot.sendMessage(chatId, "⚠️ هذا الزر ليس لك.", {
        parse_mode: "HTML",
      });
      return true;
    }

    const missing = await getMissingChannels(bot, referredId).catch(() => null);
    if (missing === null) {
      await bot.sendMessage(chatId, "⚠️ تعذر التحقق، حاول مرة أخرى.", {
        parse_mode: "HTML",
      });
      return true;
    }

    if (missing.length > 0) {
      await bot.sendMessage(
        chatId,
        `❌ لم تنضم بعد إلى: <b>${esc(missing.map((c) => c.title || c.username).join("، "))}</b>`,
        { parse_mode: "HTML" },
      );
      return true;
    }

    await db
      .update(usersTable)
      .set({ isBlockedForLeaving: false })
      .where(eq(usersTable.id, referredId));

    try {
      await bot.editMessageText(
        "✅ شكراً! تم التحقق من اشتراكك. إحالتك محفوظة.",
        {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [] },
        },
      );
    } catch {
      await bot.sendMessage(chatId, "✅ شكراً! تم التحقق من اشتراكك.", {
        parse_mode: "HTML",
      });
    }

    try {
      const [u] = await db
        .select({
          firstName: usersTable.firstName,
          username: usersTable.username,
        })
        .from(usersTable)
        .where(eq(usersTable.id, referredId))
        .limit(1);
      const name = u?.username
        ? `@${esc(u.username)}`
        : esc(u?.firstName || String(referredId));
      await bot.sendMessage(
        referrerId,
        `✅ المستخدم <b>${name}</b> عاد للاشتراك — إحالته محفوظة.`,
        { parse_mode: "HTML" },
      );
    } catch {
      /* referrer may have blocked bot */
    }

    return true;
  }

  // ── ref:deduct:{referredId} — inviter manually deducts the referral ──────
  if (action === "deduct") {
    const referredId = parseInt(p1);
    if (isNaN(referredId)) return true;

    const [ref] = await db
      .select()
      .from(referralsTable)
      .where(
        and(
          eq(referralsTable.referredId, referredId),
          eq(referralsTable.referrerId, callerId),
          eq(referralsTable.status, "active"),
        ),
      )
      .limit(1);

    if (!ref) {
      try {
        await bot.editMessageText("ℹ️ تم خصم هذه الإحالة مسبقاً.", {
          chat_id: chatId,
          message_id: msgId,
          reply_markup: { inline_keyboard: [] },
        });
      } catch {
        await bot.sendMessage(chatId, "ℹ️ تم خصم هذه الإحالة مسبقاً.");
      }
      return true;
    }

    const [referrer] = await db
      .select({
        referralCount: usersTable.referralCount,
        balance: usersTable.balance,
      })
      .from(usersTable)
      .where(eq(usersTable.id, callerId))
      .limit(1);
    if (!referrer) return true;

    const rawThreshold = await getSetting("referral_threshold").catch(
      () => null,
    );
    const refsPerSpin = Math.max(1, parseInt(rawThreshold ?? "5") || 5);
    const currentCount = referrer.referralCount;
    const currentBalance = parseFloat(String(referrer.balance ?? "0"));

    const spinsBeforeDeduct = Math.floor(currentCount / refsPerSpin);
    const spinsAfterDeduct = Math.floor(
      Math.max(0, currentCount - 1) / refsPerSpin,
    );
    const spinsLost = spinsBeforeDeduct - spinsAfterDeduct;

    let deductAmount = 0;
    if (spinsLost > 0 && currentBalance > 0 && spinsBeforeDeduct > 0) {
      deductAmount = parseFloat(
        (currentBalance / spinsBeforeDeduct).toFixed(6),
      );
      deductAmount = Math.min(deductAmount, currentBalance);
    }

    const newCount = Math.max(0, currentCount - 1);
    const newBalance = parseFloat(
      Math.max(0, currentBalance - deductAmount).toFixed(6),
    );

    if (spinsLost > 0) {
      await db
        .update(usersTable)
        .set({
          referralCount: newCount,
          balance: String(newBalance),
          spins: sql`GREATEST(spins - 1, 0)`,
        })
        .where(eq(usersTable.id, callerId));
    } else {
      await db
        .update(usersTable)
        .set({ referralCount: newCount, balance: String(newBalance) })
        .where(eq(usersTable.id, callerId));
    }

    await db
      .update(referralsTable)
      .set({ status: "removed", removedAt: new Date() })
      .where(eq(referralsTable.id, ref.id));

    await db
      .update(usersTable)
      .set({ isBlockedForLeaving: true })
      .where(eq(usersTable.id, referredId));

    const confirmText =
      `✅ <b>تم الخصم:</b>\n\n` +
      `• الإحالات: <b>${newCount}</b>\n` +
      `• الرصيد المخصوم: <b>${deductAmount.toFixed(6)} TON</b>\n` +
      `• الرصيد الحالي: <b>${newBalance.toFixed(6)} TON</b>`;

    try {
      await bot.editMessageText(confirmText, {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      await bot.sendMessage(chatId, confirmText, { parse_mode: "HTML" });
    }

    logger.info(
      { callerId, referredId, deductAmount, newCount },
      "Referral deducted by inviter",
    );
    return true;
  }

  return false;
}

// ── Withdrawal notification ────────────────────────────────────────────────

export async function sendWithdrawalNotification(
  ownerId: number,
  user: {
    firstName: string;
    username?: string | null;
    id: number;
    ipHash?: string | null;
    ipSuspicious?: boolean;
    createdAt?: Date | string | null;
  },
  amount: string,
  walletAddress: string,
  withdrawalId: number,
): Promise<void> {
  if (!bot) return;
  try {
    const userName = user.username
      ? `@${esc(user.username)}`
      : esc(user.firstName || String(user.id));

    // ── Full user analysis — run all queries in parallel ──────────────────
    const [referralsResult, requiredResult, missingResult, multiResult, depositsResult, withdrawalsResult] =
      await Promise.allSettled([
        db
          .select({ status: referralsTable.status })
          .from(referralsTable)
          .where(eq(referralsTable.referrerId, user.id)),
        getRequiredChannels(),
        getMissingChannels(bot, user.id),
        user.ipHash
          ? db
              .select({ id: usersTable.id })
              .from(usersTable)
              .where(
                and(
                  eq(usersTable.ipHash, user.ipHash),
                  ne(usersTable.id, user.id),
                  eq(usersTable.isVisible, false),
                ),
              )
          : Promise.resolve([] as { id: number }[]),
        db
          .select({ c: count(), total: sum(depositsTable.amount) })
          .from(depositsTable)
          .where(and(eq(depositsTable.userId, user.id), eq(depositsTable.status, "confirmed"))),
        db
          .select({ c: count(), total: sum(withdrawalsTable.amount) })
          .from(withdrawalsTable)
          .where(and(eq(withdrawalsTable.userId, user.id), eq(withdrawalsTable.status, "completed"))),
      ]);

    const refs =
      referralsResult.status === "fulfilled" ? referralsResult.value : [];
    const totalRefs = refs.length;
    const activeRefs = refs.filter((r) => r.status === "active").length;
    const removedRefs = refs.filter((r) => r.status === "removed").length;

    const required =
      requiredResult.status === "fulfilled" ? requiredResult.value : [];
    const missing =
      missingResult.status === "fulfilled" ? missingResult.value : [];
    const subscribedCount = Math.max(0, required.length - missing.length);

    const multiAccCount =
      multiResult.status === "fulfilled" ? multiResult.value.length : 0;

    const depositsStats =
      depositsResult.status === "fulfilled" ? depositsResult.value[0] : undefined;
    const depositsCount = depositsStats?.c ?? 0;
    const depositsTotal = parseFloat(depositsStats?.total || "0");

    const withdrawalsStats =
      withdrawalsResult.status === "fulfilled" ? withdrawalsResult.value[0] : undefined;
    const withdrawalsCount = withdrawalsStats?.c ?? 0;
    const withdrawalsTotal = parseFloat(withdrawalsStats?.total || "0");

    // ── Account age ────────────────────────────────────────────────────────
    let accountAgeStr = "غير معروف";
    if (user.createdAt) {
      const ageMs = Date.now() - new Date(user.createdAt).getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      accountAgeStr =
        ageDays >= 1
          ? `${ageDays} يوم`
          : `${Math.max(1, Math.floor(ageMs / (1000 * 60 * 60)))} ساعة`;
    }

    // ── Risk score ─────────────────────────────────────────────────────────
    let riskScore = 0;
    if (user.ipSuspicious) riskScore += 35;
    if (multiAccCount > 0) riskScore += Math.min(30, multiAccCount * 10);
    if (removedRefs > 0) riskScore += Math.min(20, removedRefs * 5);
    if (missing.length > 0 && required.length > 0) riskScore += 15;
    riskScore = Math.min(100, riskScore);
    const riskEmoji = riskScore >= 61 ? "🔴" : riskScore >= 31 ? "⚠️" : "✅";

    // ── Truncated address for readability ──────────────────────────────────
    const shortAddr =
      walletAddress.length > 20
        ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-10)}`
        : walletAddress;

    const msgText =
      `💸 <b>طلب سحب جديد #${withdrawalId}</b>\n` +
      `👤 ${userName} (${user.id})\n` +
      `💰 المبلغ: <b>${parseFloat(amount).toFixed(4)} Gram</b>\n` +
      `📍 العنوان: <code>${esc(shortAddr)}</code>\n\n` +
      `📅 <b>عضو منذ:</b> ${accountAgeStr}\n\n` +
      `📥 <b>الإيداعات:</b> ${depositsCount} عملية بإجمالي ${depositsTotal.toFixed(4)} TON\n` +
      `📤 <b>السحوبات السابقة:</b> ${withdrawalsCount} عملية بإجمالي ${withdrawalsTotal.toFixed(4)} Gram\n\n` +
      `📢 <b>القنوات:</b> مشترك في ${subscribedCount} من ${required.length} قناة\n\n` +
      `👥 <b>الإحالات (${totalRefs} إجمالي):</b>\n` +
      `✅ منضمين ومحسوبين: ${activeRefs}\n` +
      `❌ خرجوا من القنوات: ${removedRefs}\n\n` +
      `🚨 <b>محاولات التعدد:</b>\n` +
      `تم اكتشاف ${multiAccCount} حساب تعدد وتم حظرهم\n\n` +
      `🎯 درجة الخطر: <b>${riskScore}/100</b> ${riskEmoji}`;

    await bot.sendMessage(ownerId, msgText, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ قبول وتحويل",
              callback_data: `withdraw_approve_${withdrawalId}`,
              style: "success",
            } as any,
            {
              text: "❌ رفض وإرجاع",
              callback_data: `withdraw_reject_${withdrawalId}`,
              style: "danger",
            } as any,
          ],
          [
            {
              text: "🚫 حظر المستخدم",
              callback_data: `withdraw_ban_${user.id}_${withdrawalId}`,
              style: "danger",
            } as any,
          ],
        ],
      },
    });
  } catch (err) {
    logger.error({ err, ownerId }, "sendWithdrawalNotification failed");
  }
}

// ── processUpdateAndWait: for webhook mode ────────────────────────────────

export async function processUpdateAndWait(
  update: TelegramBot.Update,
): Promise<void> {
  if (!bot) return;
  _handlerPromises.length = 0; // Clear previous cycle's promises
  try {
    // Trigger all registered handlers synchronously; wrapped handlers push
    // their Promise into _handlerPromises before returning.
    (
      bot as unknown as { processUpdate: (u: TelegramBot.Update) => void }
    ).processUpdate(update);
    // Give synchronous code one tick to register promises
    await new Promise<void>((resolve) => setImmediate(resolve));
    // Now await every async handler before returning the response
    if (_handlerPromises.length > 0) {
      await Promise.allSettled([..._handlerPromises]);
    }
  } catch (err) {
    logger.error({ err }, "processUpdateAndWait error");
  } finally {
    _handlerPromises.length = 0;
  }
}

export async function sendWelcomeMessage(
  chatId: number,
  userId?: number,
  firstName?: string,
  username?: string,
) {
  const vercelDomain =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const MINI_APP_URL =
    process.env.MINI_APP_URL ||
    (vercelDomain ? `https://${vercelDomain}/` : "") ||
    "https://gram-go-ivory.vercel.app/";

  const customWelcome = await getSetting("welcome_message").catch(() => null);

  let welcomeText =
    customWelcome?.trim() ||
    `<tg-emoji emoji-id="5920174652994362278">💎</tg-emoji> Welcome to GramGo!

<tg-emoji emoji-id="5424950874927537581">🏎</tg-emoji> Mine Gram. Earn rewards. Grow your balance.

<tg-emoji emoji-id="5213306719215577669">🧩</tg-emoji> Start mining, complete tasks, invite friends, and earn Gram rewards directly through GramGo.

<tg-emoji emoji-id="5316948721064232978">⬇️</tg-emoji> Press the button below to open the app`;

  // Replace placeholders
  welcomeText = welcomeText
    .replace(/\{first_name\}/g, esc(firstName || "صديقي"))
    .replace(/\{username\}/g, username ? `@${esc(username)}` : "")
    .replace(/\{user_id\}/g, String(userId || ""));

  await bot.sendMessage(chatId, welcomeText, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Open GramGo",
            icon_custom_emoji_id: "5278752052187512542",
            style: "success",
            web_app: { url: MINI_APP_URL },
          } as any,
        ],
        [
          {
            text: "News",
            url: "https://t.me/GramGO1News",
            icon_custom_emoji_id: "5424818078833715060",
            style: "primary",
          } as any,
          {
            text: "Withdrawals",
            url: "https://t.me/GramGOwithdrawal",
            icon_custom_emoji_id: "5409048419211682843",
            style: "success",
          } as any,
        ],
      ],
    },
  });
}

function setMenuButton() {
  const vercelDomain =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const MINI_APP_URL =
    process.env.MINI_APP_URL ||
    (vercelDomain ? `https://${vercelDomain}/` : "") ||
    "https://gram-go-ivory.vercel.app/";

  const token =
    process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || TOKEN;
  if (!token) return;

  fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      menu_button: {
        type: "web_app",
        text: "🚀 GramGo",
        web_app: { url: MINI_APP_URL },
      },
    }),
  }).catch(() => {});
}

// ── Security callback handler (spam: / multi:) — admin only ──────────────────

async function handleSecurityCallback(
  q: TelegramBot.CallbackQuery,
): Promise<boolean> {
  const data = q.data ?? "";
  if (!data.startsWith("spam:") && !data.startsWith("multi:")) return false;

  const chatId = q.message!.chat.id;
  const msgId = q.message!.message_id;

  const adminInfo = await getAdminInfo(q.from.id, q.from.username);
  if (!adminInfo) {
    await bot
      .answerCallbackQuery(q.id, { text: "⛔ غير مصرح" })
      .catch(() => {});
    return true;
  }
  await bot.answerCallbackQuery(q.id).catch(() => {});

  const parts = data.split(":");
  const prefix = parts[0]; // "spam" | "multi"
  const action = parts[1]; // "warn" | "ban" | "ignore" | "banall" | "bannew"
  const param = parts[2]; // userId or comma-separated IDs

  if (prefix === "spam") {
    const targetId = parseInt(param);
    if (isNaN(targetId)) return true;

    if (action === "ban") {
      await db
        .update(usersTable)
        .set({ isVisible: false })
        .where(eq(usersTable.id, targetId));
      await bot
        .editMessageText(`🚫 <b>تم حظر المستخدم #${targetId}</b>`, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "HTML",
        })
        .catch(() => {});
    } else if (action === "warn") {
      await bot
        .sendMessage(
          targetId,
          `⚠️ <b>تحذير من الإدارة:</b> تم رصد نشاط مشبوه على حسابك.\nيرجى الالتزام بشروط الاستخدام وإلا سيتم حظرك.`,
          { parse_mode: "HTML" },
        )
        .catch(() => {});
      await bot
        .editMessageText(`⚠️ تم إرسال تحذير للمستخدم #${targetId}`, {
          chat_id: chatId,
          message_id: msgId,
        })
        .catch(() => {});
    } else if (action === "ignore") {
      await bot
        .editMessageText(`👁️ تم وضع المستخدم #${targetId} قيد المراقبة`, {
          chat_id: chatId,
          message_id: msgId,
        })
        .catch(() => {});
    }
  } else if (prefix === "multi") {
    if (action === "banall") {
      const ids = param
        .split(",")
        .map(Number)
        .filter((n) => !isNaN(n));
      for (const uid of ids) {
        await db
          .update(usersTable)
          .set({ isVisible: false })
          .where(eq(usersTable.id, uid))
          .catch(() => {});
      }
      await bot
        .editMessageText(`🚫 <b>تم حظر ${ids.length} حساب بتهمة التعدد</b>`, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "HTML",
        })
        .catch(() => {});
    } else if (action === "bannew") {
      const uid = parseInt(param);
      if (!isNaN(uid)) {
        await db
          .update(usersTable)
          .set({ isVisible: false })
          .where(eq(usersTable.id, uid));
      }
      await bot
        .editMessageText(`🚫 تم حظر الحساب الجديد #${uid}`, {
          chat_id: chatId,
          message_id: msgId,
        })
        .catch(() => {});
    } else if (action === "ignore") {
      await bot
        .editMessageText(`👁️ تم تجاهل تنبيه التعدد`, {
          chat_id: chatId,
          message_id: msgId,
        })
        .catch(() => {});
    }
  }

  return true;
}

// ── Withdrawal callback handler ─────────────────────────────────────────────

async function handleWithdrawalCallback(
  q: TelegramBot.CallbackQuery,
): Promise<boolean> {
  const data = q.data ?? "";
  if (
    !data.startsWith("withdraw_approve_") &&
    !data.startsWith("withdraw_reject_") &&
    !data.startsWith("withdraw_ban_")
  )
    return false;

  const chatId = q.message!.chat.id;
  const msgId = q.message!.message_id;
  const adminInfo = await getAdminInfo(q.from.id, q.from.username);

  if (!adminInfo) {
    await bot.answerCallbackQuery(q.id, { text: "⛔ غير مصرح" });
    return true;
  }

  await bot.answerCallbackQuery(q.id);

  if (data.startsWith("withdraw_approve_")) {
    const wId = parseInt(data.replace("withdraw_approve_", ""));
    if (isNaN(wId)) return true;
    const [w] = await db
      .select()
      .from(withdrawalsTable)
      .where(eq(withdrawalsTable.id, wId))
      .limit(1);
    if (!w) {
      await bot.sendMessage(chatId, "❌ الطلب غير موجود");
      return true;
    }
    if (w.status !== "pending") {
      await bot.sendMessage(chatId, `⚠️ الطلب #${wId} بالفعل ${w.status}`);
      return true;
    }
    // Always execute TON transfer on admin approval
    if (await isTonConfigured()) {
      try {
        await bot.sendMessage(
          chatId,
          `⏳ جاري معالجة التحويل لطلب #${wId} وتأكيده على البلوكشين...`,
        );
        const result = await executeAutoWithdrawal(w.id, chatId);
        if (result.success) {
          const txHashStr = result.txHash || "";
          const explorerUrl = txHashStr && txHashStr.length >= 20
            ? (txHashStr.length === 64 || /^[0-9a-fA-F]+$/.test(txHashStr)
                ? `https://tonviewer.com/transaction/${encodeURIComponent(txHashStr)}`
                : `https://tonviewer.com/${encodeURIComponent(w.walletAddress)}`)
            : `https://tonviewer.com/${encodeURIComponent(w.walletAddress)}`;

          await bot.editMessageText(
            `✅ <b>تم التحويل والتأكيد على البلوكشين بنجاح</b>\n\n` +
              `طلب #${wId} — <b>${parseFloat(w.amount).toFixed(4)} TON</b>\n` +
              `📍 المحفظة: <code>${esc(w.walletAddress)}</code>\n` +
              (txHashStr ? `🔗 المعاملة: <code>${esc(txHashStr)}</code>\n` : "") +
              `🌐 <a href="${explorerUrl}">🔍 فتح على مستكشف البلوكشين (TonViewer)</a>`,
            {
              chat_id: chatId,
              message_id: msgId,
              parse_mode: "HTML",
              disable_web_page_preview: true,
              reply_markup: {
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
              },
            },
          );
        } else {
          await bot.sendMessage(
            chatId,
            `❌ فشل التحويل: ${esc(result.error ?? "")}`,
            { parse_mode: "HTML" },
          );
        }
      } catch (err) {
        await bot.sendMessage(
          chatId,
          `❌ فشل التحويل: ${esc(err instanceof Error ? err.message : String(err))}`,
          { parse_mode: "HTML" },
        );
      }
    } else {
      await bot.sendMessage(
        chatId,
        `⚠️ <b>محفظة السحب التلقائي للبوت غير مهيأة!</b>\n\n` +
          `لم يتم ضبط الكلمات السرية أو المفتاح السري للبوت حتى الآن.\n` +
          `يرجى الدخول إلى لوحة تحكم الأدمن > إعدادات المحفظة وإدخال الكلمات السرية (Mnemonic / 24 words) أو المفتاح السري لتفعيل التحويل المباشر على شبكة TON.`,
        { parse_mode: "HTML" },
      );
    }
  } else if (data.startsWith("withdraw_reject_")) {
    const wId = parseInt(data.replace("withdraw_reject_", ""));
    if (isNaN(wId)) return true;
    const [w] = await db
      .select()
      .from(withdrawalsTable)
      .where(eq(withdrawalsTable.id, wId))
      .limit(1);
    if (!w) {
      await bot.sendMessage(chatId, "❌ الطلب غير موجود");
      return true;
    }
    if (w.status !== "pending") {
      await bot.sendMessage(chatId, `⚠️ الطلب #${wId} بالفعل ${esc(w.status)}`);
      return true;
    }
    await db
      .update(withdrawalsTable)
      .set({ status: "rejected" })
      .where(eq(withdrawalsTable.id, wId));
    await db
      .update(usersTable)
      .set({ gramBalance: sql`gram_balance + ${w.amount}` })
      .where(eq(usersTable.id, w.userId));
    try {
      await bot.sendMessage(
        w.userId,
        `❌ <b>تم رفض طلب السحب #${wId}</b>\n` +
          `💰 تم إعادة <b>${parseFloat(w.amount).toFixed(4)} Gram</b> لرصيدك داخل البوت.`,
        { parse_mode: "HTML" },
      );
    } catch {
      /* ignore */
    }
    await bot.editMessageText(
      `❌ تم رفض الطلب #${wId}\n💰 أُعيد ${parseFloat(w.amount).toFixed(4)} Gram لرصيد المستخدم.`,
      { chat_id: chatId, message_id: msgId },
    );
  } else if (data.startsWith("withdraw_ban_")) {
    const parts = data.replace("withdraw_ban_", "").split("_");
    const targetUserId = parseInt(parts[0]);
    const wId = parseInt(parts[1]);
    if (isNaN(targetUserId) || isNaN(wId)) return true;

    await db
      .update(usersTable)
      .set({ isVisible: false })
      .where(eq(usersTable.id, targetUserId));

    const [w] = await db
      .select()
      .from(withdrawalsTable)
      .where(eq(withdrawalsTable.id, wId))
      .limit(1);
    if (w && w.status === "pending") {
      await db
        .update(withdrawalsTable)
        .set({ status: "rejected" })
        .where(eq(withdrawalsTable.id, wId));
      await db
        .update(usersTable)
        .set({ gramBalance: sql`gram_balance + ${w.amount}` })
        .where(eq(usersTable.id, w.userId));
    }

    await bot.editMessageText(
      `🚫 <b>تم حظر المستخدم #${targetUserId}</b>\n` +
        (w
          ? `❌ الطلب #${wId} مرفوض وأُعيد ${parseFloat(w.amount).toFixed(4)} Gram للرصيد.`
          : `❌ الطلب #${wId} مرفوض.`),
      { chat_id: chatId, message_id: msgId, parse_mode: "HTML" },
    );
  }

  return true;
}

// ── Bot setup ────────────────────────────────────────────────────────────────

export function initBotWebhook(webhookUrl: string) {
  if (!TOKEN) return;
  bot = new TelegramBot(TOKEN, {});
  bot
    .setWebHook(webhookUrl, {
      allowed_updates: [
        "message",
        "callback_query",
        "chat_member",
        "my_chat_member",
      ] as never,
    })
    .catch((err) => logger.error({ err }, "Failed to set webhook"));
  setupBotHandlers();
  setMenuButton();
}

export function initBotPolling() {
  if (!TOKEN) return;
  bot = new TelegramBot(TOKEN, { polling: true });
  setupBotHandlers();
  setMenuButton();
}

function setupBotHandlers() {
  // ── /start ────────────────────────────────────────────────────────────────
  bot.onText(
    /\/start\s*(.*)/,
    wrapHandler(async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from!.id;
      const username = msg.from?.username;
      const firstName = msg.from?.first_name || "";
      const lastName = msg.from?.last_name || "";

      try {
        if (await maybeBlocked(chatId, userId, username)) return;

        // Clear subscription cache so /start always does a live channel check
        clearSubCache(userId);

        const refParam = match?.[1]?.trim();
        let referredBy: number | undefined;
        if (refParam?.startsWith("ref_")) {
          const refId = parseInt(refParam.replace("ref_", ""));
          if (!isNaN(refId) && refId !== userId) referredBy = refId;
        }

        const existing = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);

        if (existing.length > 0 && existing[0].isVisible === false) {
          await bot.sendMessage(
            chatId,
            "🚫 حسابك محظور. تواصل مع الدعم للمزيد من المعلومات.",
            { parse_mode: "HTML" },
          );
          return;
        }

        const isNew = existing.length === 0;
        if (isNew) {
          await db
            .insert(usersTable)
            .values({
              id: userId,
              username: username || null,
              firstName,
              lastName,
              referredBy: referredBy ?? null,
              spins: 0,
            })
            .onConflictDoNothing();

          // ── Register referral as PENDING ─────────────────────────────────────
          // Counted only after the referred user is verified subscribed to all channels
          if (referredBy) {
            try {
              await db
                .insert(referralsTable)
                .values({
                  referrerId: referredBy,
                  referredId: userId,
                  status: "pending",
                })
                .onConflictDoNothing()
                .catch(() => {});

              // Notify inviter — referral is pending channel verification
              await bot
                .sendMessage(
                  referredBy,
                  `👥 صديق جديد انضم عبر رابطك!\n⏳ سيتم احتساب الإحالة بعد التحقق من اشتراكه في القنوات.`,
                  { parse_mode: "HTML" },
                )
                .catch(() => {});
            } catch (refErr) {
              logger.error({ refErr }, "Referral registration error");
            }
          }
        } else {
          await db
            .update(usersTable)
            .set({
              username: username || existing[0].username,
              firstName: firstName || existing[0].firstName,
            })
            .where(eq(usersTable.id, userId));
        }

        const adminInfo = await getAdminInfo(userId, username);

        // ── Check deep links (broadcast / dm_<id>) for admins ─────────────
        if (refParam === "broadcast" && adminInfo) {
          await setAdminState(userId, "admin_broadcast", {});
          await bot.sendMessage(
            chatId,
            `✨ <b>وضع البث الجماعي المتقدم (Broadcast Mode)</b>\n\n` +
              `✍️ <b>أرسل الآن الرسالة التي تريد بثها لجميع المستخدمين:</b>\n` +
              `• يمكنك استخدام <b>الإيموجي المميز (Telegram Premium Custom Emojis)</b>\n` +
              `• يمكنك إرسال نصوص، صور، ملصقات، أو فيديوهات\n` +
              `• ستصل الرسالة لجميع الناس مع كافة التنسيقات والإيموجي المميز 🚀\n\n` +
              `<i>(للإلغاء في أي وقت أرسل /cancel)</i>`,
            { parse_mode: "HTML" }
          );
          return;
        }

        if (refParam?.startsWith("dm_") && adminInfo) {
          const targetId = parseInt(refParam.replace("dm_", ""));
          if (!isNaN(targetId) && targetId > 0) {
            await setAdminState(userId, "admin_replying_to_user", { targetUserId: targetId });
            await bot.sendMessage(
              chatId,
              `✍️ <b>وضع المراسلة الخاصة</b> (المستخدم: <code>${targetId}</code>)\n\nأرسل الآن الرسالة التي تريد إرسالها له مباشرة.`,
              { parse_mode: "HTML" }
            );
            return;
          }
        }

        // ── Subscription check for ALL users (new and existing) ─────────────
        if (!adminInfo) {
          const blocked = await enforceSubscription(bot, chatId, userId);
          if (blocked) return;
        }

        await sendWelcomeMessage(chatId, userId, firstName, username);
      } catch (err) {
        logger.error({ err }, "Error in /start handler");
        console.error("[/start] error — attempting fallback welcome:", err);
        try {
          const [u] = await db
            .select({ isVisible: usersTable.isVisible })
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .limit(1)
            .catch(() => [null]);
          if (!u || u.isVisible !== false) {
            await sendWelcomeMessage(chatId, userId, firstName, username);
          }
        } catch (sendErr) {
          console.error("[/start] fallback sendWelcomeMessage failed:", sendErr);
        }
      }
    }),
  );

  // ── /balance ──────────────────────────────────────────────────────────────
  bot.onText(
    /^\/balance$/,
    wrapHandler(async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from!.id;
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!u) return;

      const rawRate = await getSetting("global_mining_rate").catch(() => null);
      const globalRate = rawRate ? parseFloat(rawRate) : 0.00125;
      const calc = calculateUserMining(u, globalRate);

      const text =
        `💰 <b>تفاصيل رصيدك الحالي — GramGo</b>\n\n` +
        `🪙 رصيد عملة GO: <b>${calc.goBalance.toFixed(2)} GO</b>\n` +
        `💎 رصيد عملة GRAM: <b>${calc.gramBalance.toFixed(6)} Gram</b>\n` +
        `💼 رصيد TON: <b>${parseFloat(u.tonBalance || "0").toFixed(4)} TON</b>\n\n` +
        `⛏️ أرباح التعدين قيد التجميع: <b>+${calc.unclaimedGram.toFixed(6)} Gram</b>\n` +
        `⚡ نسبة التعدين اليومية: <b>${(calc.miningRate * 100).toFixed(3)}%</b>`;

      await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    }),
  );

  // ── /help ─────────────────────────────────────────────────────────────────
  bot.onText(
    /^\/help$/,
    wrapHandler(async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from!.id;
      const adminInfo = await getAdminInfo(userId, msg.from?.username);

      let text =
        `ℹ️ <b>أوامر ومساعدة البوت — GramGo</b>\n\n` +
        `🔹 /start — تشغيل البوت وفتح التطبيق المصغر\n` +
        `🔹 /balance — عرض رصيدك وأرباح التعدين الحالية\n` +
        `🔹 /mine — معلومات محطة التعدين السحابية\n` +
        `🔹 /help — عرض هذه الرسالة\n\n` +
        `💬 يمكنك كتابة أي استفسار أو مشكلة هنا مباشرة وسيصل لفريق الدعم.`;

      if (adminInfo) {
        text +=
          `\n\n👑 <b>أوامر الأدمن المتاحة:</b>\n` +
          `🔸 /withdraw — مراجعة طلبات السحب المعلقة والتصويت عليها\n` +
          `🔸 /wallet — فحص رصيد محفظة السحب الساخنة\n` +
          `🔸 /cancel — إلغاء أي حالة إدخال جارية`;
      }

      await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    }),
  );

  // ── /cancel ───────────────────────────────────────────────────────────────
  bot.onText(
    /^\/cancel$/,
    wrapHandler(async (msg) => {
      const userId = msg.from!.id;
      await clearAdminState(userId);
      await bot.sendMessage(msg.chat.id, "✅ تم إلغاء العملية الحالية.");
    }),
  );

  // ── /withdraw & /withdrawals ──────────────────────────────────────────────
  bot.onText(
    /^\/withdraw(als)?$/,
    wrapHandler(async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from!.id;
      const adminInfo = await getAdminInfo(userId, msg.from?.username);

      if (!adminInfo) {
        await bot.sendMessage(chatId, "⚠️ هذا الأمر مخصص للإدارة فقط.", { parse_mode: "HTML" });
        return;
      }

      const pendingList = await db
        .select({
          id: withdrawalsTable.id,
          userId: withdrawalsTable.userId,
          amount: withdrawalsTable.amount,
          currency: withdrawalsTable.currency,
          walletAddress: withdrawalsTable.walletAddress,
          approvals: withdrawalsTable.approvals,
          requiredApprovals: withdrawalsTable.requiredApprovals,
          createdAt: withdrawalsTable.createdAt,
          username: usersTable.username,
          firstName: usersTable.firstName,
        })
        .from(withdrawalsTable)
        .leftJoin(usersTable, eq(withdrawalsTable.userId, usersTable.id))
        .where(eq(withdrawalsTable.status, "pending"))
        .orderBy(withdrawalsTable.createdAt)
        .limit(10);

      if (pendingList.length === 0) {
        await bot.sendMessage(chatId, "✅ لا توجد طلبات سحب معلقة حالياً.");
        return;
      }

      const threshold = await getConsensusThreshold();

      for (const w of pendingList) {
        const amountNum = parseFloat(w.amount);
        const isHigh = amountNum >= threshold;
        const votesCount = w.approvals?.length || 0;
        const reqCount = w.requiredApprovals || (isHigh ? "الكل (إجماع)" : 1);

        const card =
          `💸 <b>طلب سحب معلق #${w.id}</b>\n\n` +
          `👤 المستخدم: <b>${esc(w.firstName || "مستخدم")}</b> (${w.username ? "@" + esc(w.username) : "بدون يوزر"})\n` +
          `🆔 الآيدي: <code>${w.userId}</code>\n` +
          `💰 المبلغ: <b>${w.amount} ${w.currency}</b> ${isHigh ? "⚠️ <i>(مبلغ كبير — يتطلب إجماع الأدمنية)</i>" : ""}\n` +
          `📍 المحفظة: <code>${w.walletAddress}</code>\n` +
          `🗳️ الأصوات الحالية: <b>${votesCount} / ${reqCount}</b>\n` +
          `📅 التاريخ: <code>${w.createdAt ? new Date(w.createdAt).toLocaleString("ar") : "—"}</code>`;

        await bot.sendMessage(chatId, card, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ موافقة", callback_data: `withdraw_approve_${w.id}` },
                { text: "❌ رفض", callback_data: `withdraw_reject_${w.id}` },
              ],
            ],
          },
        });
      }
    }),
  );

  // ── /mine ─────────────────────────────────────────────────────────────────
  bot.onText(
    /^\/mine$/,
    wrapHandler(async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from!.id;
      const [u] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!u) return;

      const rawRate = await getSetting("global_mining_rate").catch(() => null);
      const globalRate = rawRate ? parseFloat(rawRate) : 0.00125;

      const calc = calculateUserMining(u, globalRate);
      const goBal = calc.goBalance;
      const unclaimedGo = calc.unclaimedGo;
      const rate = calc.miningRate;
      const dailyYield = calc.dailyYield.toFixed(4);
      const ratePercent = (rate * 100).toFixed(3);

      const vercelDomain =
        process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
      const MINI_APP_URL =
        process.env.MINI_APP_URL ||
        (vercelDomain ? `https://${vercelDomain}/` : "") ||
        "https://gram-go-ivory.vercel.app/";

      const text =
        `⛏️ <b>محطة التعدين السحابية — GramGo</b>\n\n` +
        `🪙 رصيد عملة GO: <b>${goBal.toFixed(2)} GO</b>\n` +
        `⏳ أرباح التعدين المتراكمة الآن: <b>+${unclaimedGo.toFixed(6)} Gram</b>\n` +
        `⚡ معدل التعدين: <b>${ratePercent}% يومياً</b>\n` +
        `📈 الإنتاج المتوقع: <b>+${dailyYield} Gram / 24 ساعة</b>\n` +
        `🟢 حالة التعدين: <b>${calc.isMining ? "تعدين سحابي 24/7 نشط (يعمل تلقائياً)" : calc.isCycleCompleted ? "توقف التعدين (اكتملت 24 ساعة) — يرجى جمع الأرباح لبدء دورة جديدة" : "في انتظار نقاط GO"}</b>\n\n` +
        `اضغط على الزر أدناه لفتح التطبيق وجمع الأرباح وإدارة حسابك:`;

      await bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Open GramGo",
                icon_custom_emoji_id: "5278752052187512542",
                style: "success",
                web_app: { url: MINI_APP_URL },
              } as any,
            ],
          ],
        },
      });
    }),
  );

  // ── /wallet (Owner hot-wallet check) ──────────────────────────────────────
  bot.onText(
    /^\/wallet$/,
    wrapHandler(async (msg) => {
      const userId = msg.from!.id;
      const username = msg.from?.username;
      const info = await getAdminInfo(userId, username);
      if (!info) return;
      const [addr, balance] = await Promise.all([
        getWalletAddress(),
        getWalletBalance(),
      ]);
      await bot.sendMessage(
        msg.chat.id,
        `💼 <b>محفظة البوت الساخنة</b>\n\n` +
          `📍 العنوان:\n<code>${esc(addr ?? "غير متاح")}</code>\n\n` +
          `💰 الرصيد: <b>${balance ?? "—"} TON</b>\n\n` +
          (balance && parseFloat(balance) < 0.1
            ? "⚠️ الرصيد منخفض — اشحن المحفظة لضمان نجاح عمليات السحب."
            : "✅ المحفظة جاهزة للإرسال."),
        { parse_mode: "HTML" },
      );
    }),
  );

  // ── /setowner ─────────────────────────────────────────────────────────────
  bot.onText(
    /^\/setowner$/,
    wrapHandler(async (msg) => {
      const userId = msg.from!.id;
      const username = msg.from?.username;
      if (username !== OWNER_USERNAME) return;
      await db
        .insert(botSettingsTable)
        .values({ key: "owner_telegram_id", value: String(userId) })
        .onConflictDoUpdate({
          target: botSettingsTable.key,
          set: { value: String(userId) },
        });
      await bot.sendMessage(
        msg.chat.id,
        `✅ تم تسجيلك كمالك للبوت!\nID: ${userId}\nلوحة الإدارة متاحة لك داخل تطبيق الـ Web App في قسم Admin.`,
      );
    }),
  );

  // ── Global callback_query handler ─────────────────────────────────────────
  bot.on(
    "callback_query",
    wrapHandler(async (q) => {
      if (!q.message) {
        await bot.answerCallbackQuery(q.id).catch(() => {});
        return;
      }

      const userId = q.from.id;
      const chatId = q.message.chat.id;
      const data = q.data ?? "";

      try {
        // 1. sub_recheck is handled first (no maintenance block for it)
        if (data === "sub_recheck") {
          await handleSubRecheckCallback(bot, q);
          return;
        }

        // 2. Get admin info
        const adminInfo = await getAdminInfo(userId, q.from.username);

        // 3. Maintenance check for non-admins
        if (!adminInfo) {
          if (await botIsDisabled()) {
            await bot
              .answerCallbackQuery(q.id, {
                text: "🚧 البوت تحت الصيانة حالياً. حاول مرة أخرى لاحقاً.",
                show_alert: true,
              })
              .catch(() => {});
            return;
          }
        }

        // ── Admin Broadcast Confirmation Callbacks (adm_bc:*) ───────────────
        if (data.startsWith("adm_bc:") && adminInfo) {
          const parts = data.split(":");
          const subAction = parts[1]; // "send" or "cancel"

          if (subAction === "cancel") {
            await clearAdminState(userId);
            await bot.editMessageText("❌ تم إلغاء البث الجماعي.", {
              chat_id: chatId,
              message_id: q.message?.message_id,
            }).catch(() => {});
            await bot.answerCallbackQuery(q.id, { text: "تم الإلغاء" });
            return;
          }

          if (subAction === "send") {
            const isPin = parts[2] === "1";
            const msgId = parseInt(parts[3] || "0");
            const state = await getAdminState(userId);
            await clearAdminState(userId);

            const fromChatId = (state?.metadata?.fromChatId as number) || chatId;
            const messageId = msgId || (state?.metadata?.messageId as number);

            await bot.editMessageText("⏳ <b>جاري بدء البث الجماعي للجميع مع الإيموجي المميز...</b>", {
              chat_id: chatId,
              message_id: q.message?.message_id,
              parse_mode: "HTML",
            }).catch(() => {});

            const res = await startBroadcast(
              bot,
              userId,
              (state?.metadata?.textPreview as string) || "Broadcast",
              undefined,
              isPin,
              fromChatId,
              messageId
            );

            await bot.sendMessage(chatId, res.message, { parse_mode: "HTML" });
            await bot.answerCallbackQuery(q.id, { text: "تم بدء الإرسال 🚀" });
            return;
          }
        }

        // ── Admin Menu Callbacks (adm:*) ───────────────────────────────────
        if (data.startsWith("adm:") && adminInfo) {
          const action = data.replace("adm:", "");

          if (action === "stats") {
            const [usersCount] = await db.select({ c: sql`count(*)` }).from(usersTable);
            const [bannedCount] = await db.select({ c: sql`count(*)` }).from(usersTable).where(eq(usersTable.isVisible, false));
            const [refsCount] = await db.select({ c: sql`count(*)` }).from(referralsTable);
            const [totalWd] = await db.select({ c: sql`count(*)` }).from(withdrawalsTable);
            const [pendingWd] = await db.select({ c: sql`count(*)` }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "pending"));

            const statsText =
              `📊 <b>إحصائيات النظام الشاملة</b>\n\n` +
              `👥 إجمالي المسجلين: <b>${usersCount?.c ?? 0}</b>\n` +
              `🚫 المحظورين: <b>${bannedCount?.c ?? 0}</b>\n` +
              `🔗 إجمالي الإحالات: <b>${refsCount?.c ?? 0}</b>\n` +
              `💸 إجمالي السحوبات: <b>${totalWd?.c ?? 0}</b>\n` +
              `⏳ السحوبات المعلقة: <b>${pendingWd?.c ?? 0}</b>`;

            await bot.sendMessage(chatId, statsText, { parse_mode: "HTML" });
            await bot.answerCallbackQuery(q.id);
            return;
          }

          if (action === "welcome") {
            await setAdminState(userId, "admin_welcome_msg", {});
            await bot.sendMessage(
              chatId,
              `✏️ <b>تعديل رسالة الترحيب</b>\n\n` +
                `أرسل الآن نص رسالة الترحيب الجديدة.\n` +
                `<i>يدعم تنسيق HTML واستخدام المتغيرات مثل: {first_name}, {username}, {user_id}</i>\n` +
                `<i>(للإلغاء أرسل /cancel)</i>`,
              { parse_mode: "HTML" }
            );
            await bot.answerCallbackQuery(q.id);
            return;
          }

          if (action === "broadcast") {
            await setAdminState(userId, "admin_broadcast", {});
            await bot.sendMessage(
              chatId,
              `📨 <b>إرسال بث جماعي (Broadcast)</b>\n\n` +
                `أرسل الآن نص الرسالة التي تريد بثها لجميع المستخدمين.\n` +
                `<i>(للإلغاء أرسل /cancel)</i>`,
              { parse_mode: "HTML" }
            );
            await bot.answerCallbackQuery(q.id);
            return;
          }

          if (action === "find_user") {
            await setAdminState(userId, "admin_find_user", {});
            await bot.sendMessage(
              chatId,
              `👤 <b>بحث عن مستخدم</b>\n\nأرسل آيدي المستخدم (Telegram ID) أو اليوزرنيم (@username):\n<i>(للإلغاء أرسل /cancel)</i>`,
              { parse_mode: "HTML" }
            );
            await bot.answerCallbackQuery(q.id);
            return;
          }

          if (action === "min_withdraw") {
            await setAdminState(userId, "admin_min_withdraw", {});
            const current = await getSetting("min_withdraw").catch(() => "0.5");
            await bot.sendMessage(
              chatId,
              `💸 <b>تعديل الحد الأدنى للسحب</b>\n\nالحد الحالي: <b>${current} TON</b>\nأرسل القيمة الجديدة (رقم فقط):\n<i>(للإلغاء أرسل /cancel)</i>`,
              { parse_mode: "HTML" }
            );
            await bot.answerCallbackQuery(q.id);
            return;
          }

          if (action === "min_deposit") {
            await setAdminState(userId, "admin_min_deposit", {});
            const current = await getSetting("min_deposit").catch(() => "0.1");
            await bot.sendMessage(
              chatId,
              `💰 <b>تعديل الحد الأدنى للإيداع</b>\n\nالحد الحالي: <b>${current} TON</b>\nأرسل القيمة الجديدة (رقم فقط):\n<i>(للإلغاء أرسل /cancel)</i>`,
              { parse_mode: "HTML" }
            );
            await bot.answerCallbackQuery(q.id);
            return;
          }

          if (action === "ref_reward") {
            await setAdminState(userId, "admin_ref_reward", {});
            const current = await getSetting("referral_reward").catch(() => "5");
            await bot.sendMessage(
              chatId,
              `🔗 <b>تعديل مكافأة الإحالة</b>\n\nالمكافأة الحالية: <b>${current} GO</b>\nأرسل القيمة الجديدة (رقم فقط):\n<i>(للإلغاء أرسل /cancel)</i>`,
              { parse_mode: "HTML" }
            );
            await bot.answerCallbackQuery(q.id);
            return;
          }

          if (action === "maint_toggle") {
            const currentlyEnabled = await isBotEnabled();
            const newStatus = !currentlyEnabled;
            await setBotEnabled(newStatus);
            clearBotEnabledCache();
            await logAdminAudit(userId, "toggle_maintenance", { enabled: newStatus });
            await bot.answerCallbackQuery(q.id, {
              text: newStatus ? "🟢 تم إيقاف الصيانة — البوت يعمل الآن" : "🔴 تم تفعيل وضع الصيانة",
              show_alert: true,
            });
            await bot.sendMessage(
              chatId,
              `🔧 حالة البوت الآن: <b>${newStatus ? "🟢 يعمل للجميع" : "🔴 تحت الصيانة (المستخدمون محجوبون)"}</b>`,
              { parse_mode: "HTML" }
            );
            return;
          }

          if (action === "review_wd") {
            await bot.answerCallbackQuery(q.id);
            // Simulate /withdraw
            const pendingList = await db
              .select({
                id: withdrawalsTable.id,
                userId: withdrawalsTable.userId,
                amount: withdrawalsTable.amount,
                currency: withdrawalsTable.currency,
                walletAddress: withdrawalsTable.walletAddress,
                approvals: withdrawalsTable.approvals,
                requiredApprovals: withdrawalsTable.requiredApprovals,
                createdAt: withdrawalsTable.createdAt,
                username: usersTable.username,
                firstName: usersTable.firstName,
              })
              .from(withdrawalsTable)
              .leftJoin(usersTable, eq(withdrawalsTable.userId, usersTable.id))
              .where(eq(withdrawalsTable.status, "pending"))
              .orderBy(withdrawalsTable.createdAt)
              .limit(5);

            if (pendingList.length === 0) {
              await bot.sendMessage(chatId, "✅ لا توجد طلبات سحب معلقة حالياً.");
              return;
            }

            for (const w of pendingList) {
              const card =
                `💸 <b>طلب سحب معلق #${w.id}</b>\n\n` +
                `👤 المستخدم: <b>${esc(w.firstName || "مستخدم")}</b> (${w.username ? "@" + esc(w.username) : "بدون يوزر"})\n` +
                `🆔 الآيدي: <code>${w.userId}</code>\n` +
                `💰 المبلغ: <b>${w.amount} ${w.currency}</b>\n` +
                `📍 المحفظة: <code>${w.walletAddress}</code>`;

              await bot.sendMessage(chatId, card, {
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: "✅ موافقة", callback_data: `withdraw_approve_${w.id}` },
                      { text: "❌ رفض", callback_data: `withdraw_reject_${w.id}` },
                    ],
                  ],
                },
              });
            }
            return;
          }
        }

        // ── Support Reply Actions (sup_reply_*) ──────────────────────────────
        if (data.startsWith("sup_reply_") && adminInfo) {
          await handleAdminReplyClick(bot, q);
          return;
        }

        if (data.startsWith("user_reply_admin_")) {
          await handleUserReplyClick(bot, q);
          return;
        }

        // ── Withdrawal Approval / Rejection Consensus ───────────────────────
        if (data.startsWith("withdraw_approve_") && adminInfo) {
          const wId = parseInt(data.replace("withdraw_approve_", ""));
          if (!isNaN(wId)) {
            const res = await processWithdrawalVote(userId, wId, "approve");
            await bot.answerCallbackQuery(q.id, { text: res.message, show_alert: true });
            if (q.message && (res.status === "approved_and_executed" || res.status === "already_processed")) {
              await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: q.message.chat.id,
                message_id: q.message.message_id,
              }).catch(() => {});
            }
            return;
          }
        }

        if (data.startsWith("withdraw_reject_") && adminInfo) {
          const wId = parseInt(data.replace("withdraw_reject_", ""));
          if (!isNaN(wId)) {
            const res = await processWithdrawalVote(userId, wId, "reject");
            await bot.answerCallbackQuery(q.id, { text: res.message, show_alert: true });
            if (q.message) {
              await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: q.message.chat.id,
                message_id: q.message.message_id,
              }).catch(() => {});
            }
            return;
          }
        }

        // ── User Management inline callbacks (adm_ban_*, adm_toggle_wd_*) ────
        if (data.startsWith("adm_ban_") && adminInfo) {
          const targetId = parseInt(data.replace("adm_ban_", ""));
          if (!isNaN(targetId)) {
            await db.update(usersTable).set({ isVisible: false }).where(eq(usersTable.id, targetId));
            await logAdminAudit(userId, "ban_user", {}, targetId);
            await bot.answerCallbackQuery(q.id, { text: "🚫 تم حظر المستخدم بنجاح", show_alert: true });
            return;
          }
        }

        if (data.startsWith("adm_unban_") && adminInfo) {
          const targetId = parseInt(data.replace("adm_unban_", ""));
          if (!isNaN(targetId)) {
            await db.update(usersTable).set({ isVisible: true }).where(eq(usersTable.id, targetId));
            await logAdminAudit(userId, "unban_user", {}, targetId);
            await bot.answerCallbackQuery(q.id, { text: "🔓 تم فك حظر المستخدم", show_alert: true });
            return;
          }
        }

        if (data.startsWith("adm_toggle_wd_") && adminInfo) {
          const targetId = parseInt(data.replace("adm_toggle_wd_", ""));
          if (!isNaN(targetId)) {
            const [u] = await db.select({ isWithdrawalBanned: usersTable.isWithdrawalBanned }).from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
            const nextStatus = !(u?.isWithdrawalBanned ?? false);
            await db.update(usersTable).set({ isWithdrawalBanned: nextStatus }).where(eq(usersTable.id, targetId));
            await logAdminAudit(userId, "toggle_user_withdrawal", { isWithdrawalBanned: nextStatus }, targetId);
            await bot.answerCallbackQuery(q.id, {
              text: nextStatus ? "🔒 تم منع المستخدم من السحب" : "🔓 تم السماح للمستخدم بالسحب",
              show_alert: true,
            });
            return;
          }
        }

        // 5.5 Security alerts: spam detection + multi-account (admin only)
        if (
          (data.startsWith("spam:") || data.startsWith("multi:")) &&
          adminInfo
        ) {
          await handleSecurityCallback(q);
          return;
        }

        // 6. Referral callbacks (ref:* prefix) — available to all users
        if (data.startsWith("ref:")) {
          if (await handleReferralCallback(bot, q)) return;
        }

        // 7. Subscription check for non-admin callbacks
        if (!adminInfo) {
          const blocked = await enforceSubscription(bot, chatId, userId, q.id);
          if (blocked) return;
        }

        // 8. Fallback — answer to remove loading state
        await bot.answerCallbackQuery(q.id).catch(() => {});
      } catch (err) {
        logger.error({ err, data, userId }, "callback_query handler error");
        await bot.answerCallbackQuery(q.id).catch(() => {});
      }
    }),
  );

  // ── Global message handler (FSM State Machine & Support) ─────────────────
  bot.on(
    "message",
    wrapHandler(async (msg) => {
      if (!msg.from) return;

      // Commands handled by onText — skip here to avoid double processing
      if (msg.text?.startsWith("/")) return;

      const userId = msg.from.id;
      const chatId = msg.chat.id;
      const username = msg.from.username;

      try {
        const adminInfo = await getAdminInfo(userId, username);

        // ── 1. Check if Admin is in active Conversation FSM State ────────────
        if (adminInfo) {
          const state = await getAdminState(userId);
          if (state && state.step) {
            const input = msg.text || "";

            if (state.step === "admin_broadcast") {
              // Store pending broadcast message in state
              await setAdminState(userId, "admin_broadcast_confirm", {
                fromChatId: msg.chat.id,
                messageId: msg.message_id,
                textPreview: msg.text || msg.caption || "(ملف/وسائط)",
              });

              await bot.sendMessage(
                chatId,
                `👁️ <b>معاينة رسالة البث جاهزة!</b>\n\n` +
                  `👆 الرسالة أعلاه سيتم إرسالها لجميع مستخدمي البوت بكامل <b>الإيموجي المميز (Custom Emojis)</b> والتنسيقات والصور.\n\n` +
                  `هل تريد بدء الإرسال الآن؟`,
                {
                  parse_mode: "HTML",
                  reply_to_message_id: msg.message_id,
                  reply_markup: {
                    inline_keyboard: [
                      [
                        { text: "🚀 إرسال للجميع الآن", callback_data: `adm_bc:send:0:${msg.message_id}` },
                        { text: "📌 إرسال مع التثبيت", callback_data: `adm_bc:send:1:${msg.message_id}` },
                      ],
                      [
                        { text: "❌ إلغاء", callback_data: "adm_bc:cancel" },
                      ],
                    ],
                  },
                }
              );
              return;
            }

            if (state.step === "admin_welcome_msg") {
              await clearAdminState(userId);
              await db
                .insert(botSettingsTable)
                .values({ key: "welcome_message", value: input })
                .onConflictDoUpdate({
                  target: botSettingsTable.key,
                  set: { value: input },
                });
              await logAdminAudit(userId, "update_welcome_message", { preview: input.slice(0, 100) });
              await bot.sendMessage(chatId, "✅ <b>تم حفظ نص رسالة الترحيب بنجاح!</b>", { parse_mode: "HTML" });
              return;
            }

            if (state.step === "admin_find_user") {
              await clearAdminState(userId);
              let targetUser: typeof usersTable.$inferSelect | undefined;
              const searchNum = parseInt(input.replace("@", "").trim());

              if (!isNaN(searchNum) && searchNum > 0) {
                const [u] = await db.select().from(usersTable).where(eq(usersTable.id, searchNum)).limit(1);
                targetUser = u;
              } else {
                const uname = input.replace("@", "").trim();
                const [u] = await db.select().from(usersTable).where(sql`LOWER(${usersTable.username}) = LOWER(${uname})`).limit(1);
                targetUser = u;
              }

              if (!targetUser) {
                await bot.sendMessage(chatId, "❌ لم يتم العثور على أي مستخدم بهذه البيانات.");
                return;
              }

              const card =
                `👤 <b>بطاقة بيانات المستخدم</b>\n\n` +
                `🆔 الآيدي: <code>${targetUser.id}</code>\n` +
                `👤 الاسم: <b>${esc(targetUser.firstName || "")} ${esc(targetUser.lastName || "")}</b>\n` +
                `🔗 اليوزر: ${targetUser.username ? "@" + esc(targetUser.username) : "بدون يوزر"}\n` +
                `🪙 رصيد GO: <b>${targetUser.goBalance} GO</b>\n` +
                `💎 رصيد GRAM: <b>${targetUser.gramBalance} Gram</b>\n` +
                `💼 رصيد TON: <b>${targetUser.tonBalance} TON</b>\n` +
                `👥 عدد الإحالات: <b>${targetUser.referralCount}</b>\n` +
                `🚫 حالة الحظر: <b>${targetUser.isVisible ? "نشط وغير محظور" : "🔴 محظور"}</b>\n` +
                `💸 حالة السحب: <b>${targetUser.isWithdrawalBanned ? "🔴 ممنوع من السحب" : "🟢 مسموح له بالسحب"}</b>\n` +
                `📅 تاريخ التسجيل: <code>${new Date(targetUser.createdAt).toLocaleDateString("ar")}</code>`;

              const botUsername = (await bot.getMe()).username;
              const dmLink = `https://t.me/${botUsername}?start=dm_${targetUser.id}`;

              await bot.sendMessage(chatId, card, {
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: targetUser.isVisible ? "🚫 حظر المستخدم" : "🔓 فك الحظر",
                        callback_data: targetUser.isVisible ? `adm_ban_${targetUser.id}` : `adm_unban_${targetUser.id}`,
                      },
                      {
                        text: targetUser.isWithdrawalBanned ? "🔓 سماح بالسحب" : "🔒 منع السحب",
                        callback_data: `adm_toggle_wd_${targetUser.id}`,
                      },
                    ],
                    [
                      { text: "✉️ مراسلة خاصة (Deep Link)", url: dmLink },
                    ],
                  ],
                },
              });
              return;
            }

            if (state.step === "admin_min_withdraw") {
              await clearAdminState(userId);
              const val = parseFloat(input);
              if (isNaN(val) || val <= 0) {
                await bot.sendMessage(chatId, "❌ يجب إدخال رقم صحيح وموجب.");
                return;
              }
              await db
                .insert(botSettingsTable)
                .values({ key: "min_withdraw", value: String(val) })
                .onConflictDoUpdate({
                  target: botSettingsTable.key,
                  set: { value: String(val) },
                });
              await logAdminAudit(userId, "update_min_withdraw", { value: val });
              await bot.sendMessage(chatId, `✅ تم تعيين الحد الأدنى للسحب إلى: <b>${val} TON</b>`, { parse_mode: "HTML" });
              return;
            }

            if (state.step === "admin_min_deposit") {
              await clearAdminState(userId);
              const val = parseFloat(input);
              if (isNaN(val) || val <= 0) {
                await bot.sendMessage(chatId, "❌ يجب إدخال رقم صحيح وموجب.");
                return;
              }
              await db
                .insert(botSettingsTable)
                .values({ key: "min_deposit", value: String(val) })
                .onConflictDoUpdate({
                  target: botSettingsTable.key,
                  set: { value: String(val) },
                });
              await logAdminAudit(userId, "update_min_deposit", { value: val });
              await bot.sendMessage(chatId, `✅ تم تعيين الحد الأدنى للإيداع إلى: <b>${val} TON</b>`, { parse_mode: "HTML" });
              return;
            }

            if (state.step === "admin_ref_reward") {
              await clearAdminState(userId);
              const val = parseFloat(input);
              if (isNaN(val) || val <= 0) {
                await bot.sendMessage(chatId, "❌ يجب إدخال رقم صحيح وموجب.");
                return;
              }
              await db
                .insert(botSettingsTable)
                .values({ key: "referral_reward", value: String(val) })
                .onConflictDoUpdate({
                  target: botSettingsTable.key,
                  set: { value: String(val) },
                });
              await logAdminAudit(userId, "update_referral_reward", { value: val });
              await bot.sendMessage(chatId, `✅ تم تعيين مكافأة الإحالة إلى: <b>${val} GO</b>`, { parse_mode: "HTML" });
              return;
            }

            if (state.step === "admin_replying_to_user") {
              const targetUserId = state.metadata?.targetUserId as number;
              if (targetUserId) {
                await deliverAdminReplyToUser(bot, userId, targetUserId, input);
                return;
              }
            }
          }
        }

        // Maintenance check for non-admins
        if (!adminInfo && (await botIsDisabled())) return;

        // ── 2. Check if Regular User is in Reply mode or sending feedback ────
        if (!adminInfo) {
          const userState = await getAdminState(userId);
          if (userState && userState.step === "user_replying_to_admin") {
            await clearAdminState(userId);
            await handleUserSupportMessage(bot, msg);
            return;
          }

          // Any text sent by regular user treated as support/complaint message
          if (msg.text) {
            const blocked = await enforceSubscription(bot, chatId, userId);
            if (blocked) return;
            await handleUserSupportMessage(bot, msg);
            return;
          }
        }
      } catch (err) {
        logger.error({ err, userId }, "message handler error");
      }
    }),
  );

  // ── Anti-Cheat: chat_member handler — notify referrer when user leaves ────
  bot.on(
    "chat_member",
    wrapHandler(async (update) => {
      try {
        const raw = update as unknown as {
          chat: { id: number; title?: string; username?: string };
          new_chat_member: { status: string; user: { id: number } };
        };
        const newMember = raw.new_chat_member;
        if (!newMember) return;

        const { status, user } = newMember;
        if (status !== "left" && status !== "kicked") return;

        const userId = user.id;
        const channelName = raw.chat.title || raw.chat.username || "القناة";

        const [userData] = await db
          .select({
            referredBy: usersTable.referredBy,
            firstName: usersTable.firstName,
            username: usersTable.username,
          })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);

        if (!userData?.referredBy) return;
        const referrerId = userData.referredBy;

        const [activeRef] = await db
          .select({ id: referralsTable.id, warnedAt: referralsTable.warnedAt })
          .from(referralsTable)
          .where(
            and(
              eq(referralsTable.referredId, userId),
              eq(referralsTable.referrerId, referrerId),
              eq(referralsTable.status, "active"),
            ),
          )
          .limit(1);

        if (!activeRef) return;

        // Cooldown: skip if warned in the last 23 hours
        const WARN_COOLDOWN_MS = 23 * 3_600_000;
        if (
          activeRef.warnedAt &&
          Date.now() - activeRef.warnedAt.getTime() < WARN_COOLDOWN_MS
        )
          return;

        const userDisplay = userData.username
          ? `@${esc(userData.username)}`
          : esc(userData.firstName || String(userId));

        // Mark user as blocked and update warnedAt
        await db
          .update(usersTable)
          .set({ isBlockedForLeaving: true })
          .where(eq(usersTable.id, userId));
        await db
          .update(referralsTable)
          .set({ warnedAt: new Date() })
          .where(eq(referralsTable.id, activeRef.id));

        // Notify referrer with action buttons
        try {
          await bot.sendMessage(
            referrerId,
            `⚠️ <b>تنبيه!</b>\nالمستخدم <b>${userDisplay}</b> غادر القناة: <b>${esc(channelName)}</b>`,
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "📤 إرسال تنبيه للشخص",
                      callback_data: `ref:warn:${userId}`,
                    },
                    {
                      text: "❌ خصم الإحالة",
                      callback_data: `ref:deduct:${userId}`,
                    },
                  ],
                ],
              },
            },
          );
        } catch {
          /* referrer may have blocked the bot */
        }

        logger.info(
          { userId, referrerId, channelName },
          "Anti-cheat: leave detected, referrer notified",
        );
      } catch (err) {
        logger.error({ err }, "chat_member anti-cheat handler error");
      }
    }),
  );
}
