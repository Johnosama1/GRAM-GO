import { resolveMiniAppUrl } from "../lib/envUrls";
import { AsyncLocalStorage } from "node:async_hooks";
import TelegramBot from "node-telegram-bot-api";
import { db } from "@workspace/db";
import { tasksTable } from "@workspace/db/schema";
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
import { getWalletAddress, getWalletBalanceDetailed, checkWalletAddressMismatch } from "../lib/tonSender";
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
  handleUserReplyComplaintClick,
  handleUserReplyToComplaintMessage,
  deliverAdminReplyToUser,
  handleComplaintSubmission,
  handleAdminReplyComplaintClick,
  deliverAdminReplyToComplaint,
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
const handlerPromisesStorage = new AsyncLocalStorage<Promise<void>[]>();

function wrapHandler<T extends unknown[]>(
  fn: (...args: T) => Promise<void> | void,
): (...args: T) => void {
  return (...args: T) => {
    const result = fn(...args);
    if (result instanceof Promise) {
      const p = result.catch((err) => logger.error({ err }, "Bot handler error"));
      const promises = handlerPromisesStorage.getStore();
      if (promises) {
        promises.push(p);
      }
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
    "🚧 <b>The bot is currently under maintenance</b>\n\nWe are updating and improving the application. Come back soon! 🔧",
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
          "✅ The user has returned to subscribing to the channels. There is nothing necessary.",
          {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [] },
          },
        );
      } catch {
        await bot.sendMessage(chatId, "✅ The user has returned to subscribing to the channels.", {
          parse_mode: "HTML",
        });
      }
      return true;
    }

    const channelNames = missing.map((c) => c.title || c.username).join(",");
    try {
      await bot.sendMessage(
        referredId,
        `⚠️ You have left the <b>${esc(channelNames)}</b> channel. You must re-subscribe to maintain your referral. Click Verify after joining.`,
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
                  text: "✅ Verified subscription",
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
          `✅ The alert has been sent to the user. Must subscribe to: <b>${esc(channelNames)}</b>`,
          {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [] },
          },
        );
      } catch {
        await bot.sendMessage(chatId, "✅ The alert has been sent to the user.", {
          parse_mode: "HTML",
        });
      }
    } catch {
      await bot.sendMessage(
        chatId,
        "⚠️ Unable to send alert — user may have blocked the bot.",
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
      await bot.sendMessage(chatId, "⚠️ This button is not for you.", {
        parse_mode: "HTML",
      });
      return true;
    }

    const missing = await getMissingChannels(bot, referredId).catch(() => null);
    if (missing === null) {
      await bot.sendMessage(chatId, "⚠️ Unable to verify, try again.", {
        parse_mode: "HTML",
      });
      return true;
    }

    if (missing.length > 0) {
      await bot.sendMessage(
        chatId,
        `❌ You haven't joined yet: <b>${esc(missing.map((c) => c.title || c.username).join(","))}</b>`,
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
        "✅ Thanks! Your subscription has been verified. Your referral is reserved.",
        {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [] },
        },
      );
    } catch {
      await bot.sendMessage(chatId, "✅ Thanks! Your subscription has been verified.", {
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
        `✅ User <b>${name}</b> has resubscribed — his referral is saved.`,
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
        await bot.editMessageText("ℹ️ This referral has already been discounted.", {
          chat_id: chatId,
          message_id: msgId,
          reply_markup: { inline_keyboard: [] },
        });
      } catch {
        await bot.sendMessage(chatId, "ℹ️ This referral has already been discounted.");
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
      `✅ <b>Discounted:</b>\n\n` +
      `• Referrals: <b>${newCount}</b>\n` +
      `• Deducted balance: <b>${deductAmount.toFixed(6)} TON</b>\n` +
      `• Current balance: <b>${newBalance.toFixed(6)} TON</b>`;

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
    let accountAgeStr = "unknown";
    if (user.createdAt) {
      const ageMs = Date.now() - new Date(user.createdAt).getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      accountAgeStr =
        ageDays >= 1
          ? `${ageDays} day`
          : `${Math.max(1, Math.floor(ageMs / (1000 * 60 * 60)))} hours`;
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
      `💸 <b>New withdrawal request #${withdrawalId}</b>\n` +
      `👤 ${userName} (${user.id})\n` +
      `💰 Amount: <b>${parseFloat(amount).toFixed(4)} Gram</b>\n` +
      `📍 Address: <code>${esc(shortAddr)}</code>\n\n` +
      `📅 <b>Member since:</b> ${accountAgeStr}\n\n` +
      `📥 <b>Deposits:</b> ${depositsCount} transaction with a total of ${depositsTotal.toFixed(4)} TON\n` +
      `📤 <b>Previous draws:</b> ${withdrawalsCount} transaction with a total of ${withdrawalsTotal.toFixed(4)} Gram\n\n` +
      `📢 <b>Channels:</b> Subscribed to ${subscribedCount} from ${required.length} channel\n\n` +
      `👥 <b>Referrals (${totalRefs}):</b>\n` +
      `✅ Joined and counted: ${activeRefs}\n` +
      `❌ Exited from channels: ${removedRefs}\n\n` +
      `🚨 <b>Attempts at polygamy:</b>\n` +
      `${multiAccCount} Multiple accounts have been detected and banned\n\n` +
      `🎯 Risk Score: <b>${riskScore}/100</b> ${riskEmoji}`;

    await bot.sendMessage(ownerId, msgText, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Accept and transfer",
              callback_data: `withdraw_approve_${withdrawalId}`,
              style: "success",
            } as any,
            {
              text: "❌ Reject and return",
              callback_data: `withdraw_reject_${withdrawalId}`,
              style: "danger",
            } as any,
          ],
          [
            {
              text: "🚫 Block user",
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

  const promises: Promise<void>[] = [];

  await handlerPromisesStorage.run(promises, async () => {
    try {
      // Trigger all registered handlers synchronously; wrapped handlers push
      // their Promise into the storage array before returning.
      (
        bot as unknown as { processUpdate: (u: TelegramBot.Update) => void }
      ).processUpdate(update);
      // Give synchronous code one tick to register promises
      await new Promise<void>((resolve) => setImmediate(resolve));
      // Now await every async handler before returning the response
      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }
    } catch (err) {
      logger.error({ err }, "processUpdateAndWait error");
    }
  });
}

export async function sendWelcomeMessage(
  chatId: number,
  userId?: number,
  firstName?: string,
  username?: string,
) {
  const MINI_APP_URL = resolveMiniAppUrl();

  const customWelcome = await getSetting("welcome_message").catch(() => null);

  let welcomeText =
    customWelcome?.trim() ||
    `<tg-emoji emoji-id="5920174652994362278">💎</tg-emoji> Welcome to GramGo!

<tg-emoji emoji-id="5424950874927537581">🏎</tg-emoji> Mine Gram. Earn rewards. Grow your balance.

<tg-emoji emoji-id="5213306719215577669">🧩</tg-emoji> Start mining, complete tasks, invite friends, and earn Gram rewards directly through GramGo.

<tg-emoji emoji-id="5316948721064232978">⬇️</tg-emoji> Press the button below to open the app`;

  // Replace placeholders
  welcomeText = welcomeText
    .replace(/\{first_name\}/g, esc(firstName || "my friend"))
    .replace(/\{username\}/g, username ? `@${esc(username)}` : "")
    .replace(/\{user_id\}/g, String(userId || ""));

  await bot.sendPhoto(chatId, `${MINI_APP_URL}welcome-image.png`, {
    caption: welcomeText,
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
  const MINI_APP_URL = resolveMiniAppUrl();

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
      .answerCallbackQuery(q.id, { text: "⛔ Not authorized" })
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
        .editMessageText(`🚫 <b>User #${targetId}</b> has been blocked`, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "HTML",
        })
        .catch(() => {});
    } else if (action === "warn") {
      await bot
        .sendMessage(
          targetId,
          `⚠️ <b>Administration Warning:</b> Suspicious activity has been detected on your account.\nPlease adhere to the terms of use or you will be banned.`,
          { parse_mode: "HTML" },
        )
        .catch(() => {});
      await bot
        .editMessageText(`⚠️ A warning has been sent to user #${targetId}`, {
          chat_id: chatId,
          message_id: msgId,
        })
        .catch(() => {});
    } else if (action === "ignore") {
      await bot
        .editMessageText(`👁️ User #${targetId} has been placed on probation`, {
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
        .editMessageText(`🚫 <b>${ids.length} account banned for bigamy</b>`, {
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
        .editMessageText(`🚫 New account #${uid} banned`, {
          chat_id: chatId,
          message_id: msgId,
        })
        .catch(() => {});
    } else if (action === "ignore") {
      await bot
        .editMessageText(`👁️ Multiplicity alert ignored`, {
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
    await bot.answerCallbackQuery(q.id, { text: "⛔ Not authorized" });
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
      await bot.sendMessage(chatId, "❌ The request does not exist");
      return true;
    }
    if (w.status !== "pending") {
      await bot.sendMessage(chatId, `⚠️ The request #${wId} is already ${w.status}`);
      return true;
    }
    // Always execute TON transfer on admin approval
    if (await isTonConfigured()) {
      try {
        await bot.sendMessage(
          chatId,
          `⏳ The #${wId} request is being processed and confirmed on the blockchain...`,
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
            `✅ <b>The blockchain has been transferred and confirmed successfully</b>\n\n` +
              `Request #${wId} — <b>${parseFloat(w.amount).toFixed(4)} TON</b>\n` +
              `📍 Wallet: <code>${esc(w.walletAddress)}</code>\n` +
              (txHashStr ? `🔗 Transaction: <code>${esc(txHashStr)}</code>\n` : "") +
              `🌐 <a href="${explorerUrl}">🔍 Open on Blockchain Explorer (TonViewer)</a>`,
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
            `❌ Conversion failed: ${esc(result.error ?? "")}`,
            { parse_mode: "HTML" },
          );
        }
      } catch (err) {
        await bot.sendMessage(
          chatId,
          `❌ Conversion failed: ${esc(err instanceof Error ? err.message : String(err))}`,
          { parse_mode: "HTML" },
        );
      }
    } else {
      await bot.sendMessage(
        chatId,
        `⚠️ <b>Bot auto withdrawal wallet not configured!</b>\n\n` +
          `The bot's passwords or secret key have not been set yet.\n` +
          `Please enter the Admin Control Panel > Wallet Settings and enter the password (Mnemonic / 24 words) or secret key to activate direct transfer on the TON network.`,
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
      await bot.sendMessage(chatId, "❌ The request does not exist");
      return true;
    }
    if (w.status !== "pending") {
      await bot.sendMessage(chatId, `⚠️ The request #${wId} is already ${esc(w.status)}`);
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
        `❌ <b>Withdrawal request #${wId}</b>\n was rejected` +
          `💰 Your <b>${parseFloat(w.amount).toFixed(4)} Gram</b> has been restored to your balance within the bot.`,
        { parse_mode: "HTML" },
      );
    } catch {
      /* ignore */
    }
    await bot.editMessageText(
      `❌ The request was rejected #${wId}\n💰 ${parseFloat(w.amount).toFixed(4)} Gram was returned to the user's balance.`,
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
      `🚫 <b>User #${targetUserId}</b>\n has been blocked` +
        (w
          ? `❌ The request #${wId} was rejected and ${parseFloat(w.amount).toFixed(4)} Gram was returned for the balance.`
          : `❌ Request #${wId} rejected.`),
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
            "🚫 Your account is banned. Contact support for more information.",
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
                  `👥 A new friend joined via your link!\n⏳ The referral will be calculated after verifying his subscription to the channels.`,
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
            `✨ <b>Advanced Broadcast Mode</b>\n\n` +
              `✍️ <b>Now send the message you want to broadcast to all users:</b>\n` +
              `• You can use <b>Telegram Premium Custom Emojis</b>\n` +
              `• You can send texts, photos, stickers, or videos\n` +
              `• The message will reach all people with all formats and the distinctive emoji 🚀\n\n` +
              `<i>(To cancel at any time send /cancel)</i>`,
            { parse_mode: "HTML" }
          );
          return;
        }

        if (refParam === "news_broadcast" && adminInfo) {
          await setAdminState(userId, "admin_news_broadcast", {});
          await bot.sendMessage(
            chatId,
            `📢 <b>Post a message in the news channel</b>\n\n` +
              `✍️ <b>Now send the post (text, image or video) that you want to publish in the channel:</b>\n` +
              `• You can use the distinctive emoji 🌟\n` +
              `• After sending the post, I will ask you for the details of the button that will appear below it.\n\n` +
              `<i>(To cancel at any time send /cancel)</i>`,
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
              `✍️ <b>Private Messaging Mode</b> (User: <code>${targetId}</code>)\n\nNow send the message you want to send to him directly.`,
              { parse_mode: "HTML" }
            );
            return;
          }
        }



        // ── Complaint System ────────────────────────────────────────────────────────
        if (refParam === "complaint") {
          await bot.sendMessage(
            chatId,
            "📝 <b>Submit a complaint</b>\n\n" +
            "Do you want to file a complaint with the GRAM GO support team?\n\n" +
            "You can send your complaint and the support team will review it and contact you when needed.\n\n" +
            "Do you want to continue?",
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "✅ Yes", callback_data: "complaint_yes" },
                    { text: "❌ No", callback_data: "complaint_no" },
                  ],
                ],
              },
            }
          );
          return;
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

      const [rawRate, startMinerVisibleStr] = await Promise.all([
        getSetting("global_mining_rate").catch(() => null),
        getSetting("start_miner_visible").catch(() => null)
      ]);
      const globalRate = rawRate ? parseFloat(rawRate) : 0.03;
      const startMinerVisible = startMinerVisibleStr !== "false";
      const calc = calculateUserMining(u, globalRate, startMinerVisible);

      const text =
        `💰 <b>Details of your current balance — GramGo</b>\n\n` +
        `🪙GO Coin Balance: <b>${calc.goBalance.toFixed(2)} GO</b>\n` +
        `💎GRAM Balance: <b>${calc.gramBalance.toFixed(6)} Gram</b>\n` +
        `💼 TON Balance: <b>${parseFloat(u.tonBalance || "0").toFixed(4)} TON</b>\n\n` +
        `⛏️ Mining profits being collected: <b>+${calc.unclaimedGram.toFixed(6)} Gram</b>\n` +
        `⚡ Daily Mining Rate: <b>${(calc.miningRate * 100).toFixed(3)}%</b>`;

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
        `ℹ️ <b>Bot commands and help — GramGo</b>\n\n` +
        `🔹 /start — start the bot and open the widget\n` +
        `🔹 /balance — View your balance and current mining profits\n` +
        `🔹 /mine — Cloud mining station information\n` +
        `🔹 /help — Display this message\n\n` +
        `💬 You can write any inquiry or problem directly here and it will reach the support team.`;

      if (adminInfo) {
        text +=
          `\n\n👑 <b>Available admin commands:</b>\n` +
          `🔸 /withdraw — Review and vote on pending withdrawal requests\n` +
          `🔸 /wallet — Check the balance of the hot wallet\n` +
          `🔸 /cancel — Cancel any ongoing input state`;
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
      await bot.sendMessage(msg.chat.id, "✅ The current operation has been cancelled.");
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
        await bot.sendMessage(chatId, "⚠️ This is for administration only.", { parse_mode: "HTML" });
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
        await bot.sendMessage(chatId, "✅ There are currently no pending withdrawal requests.");
        return;
      }

      const threshold = await getConsensusThreshold();

      for (const w of pendingList) {
        const amountNum = parseFloat(w.amount);
        const isHigh = amountNum >= threshold;
        const votesCount = w.approvals?.length || 0;
        const reqCount = w.requiredApprovals || (isHigh ? "All (consensus)" : 1);

        const card =
          `💸 <b>Pending withdrawal request #${w.id}</b>\n\n` +
          `👤 User: <b>${esc(w.firstName || "User")}</b> (${w.username ? "@" + esc(w.username) : "Without User"})\n` +
          `🆔 Handles: <code>${w.userId}</code>\n` +
          `💰 Amount: <b>${w.amount} ${w.currency}</b> ${isHigh ? "⚠️ <i>(Large amount - requires administrative consensus)</i>" : ""}\n` +
          `📍 Wallet: <code>${w.walletAddress}</code>\n` +
          `🗳️ Current votes: <b>${votesCount} / ${reqCount}</b>\n` +
          `📅 Date: <code>${w.createdAt ? new Date(w.createdAt).toLocaleString("ar") : "—"}</code>`;

        await bot.sendMessage(chatId, card, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Agree", callback_data: `withdraw_approve_${w.id}` },
                { text: "❌ He refused", callback_data: `withdraw_reject_${w.id}` },
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

      const [rawRate, startMinerVisibleStr] = await Promise.all([
        getSetting("global_mining_rate").catch(() => null),
        getSetting("start_miner_visible").catch(() => null)
      ]);
      const globalRate = rawRate ? parseFloat(rawRate) : 0.03;
      const startMinerVisible = startMinerVisibleStr !== "false";

      const calc = calculateUserMining(u, globalRate, startMinerVisible);
      const goBal = calc.goBalance;
      const unclaimedGo = calc.unclaimedGo;
      const rate = calc.miningRate;
      const dailyYield = calc.dailyYield.toFixed(4);
      const ratePercent = (rate * 100).toFixed(3);

      const MINI_APP_URL = resolveMiniAppUrl();

      const text =
        `⛏️ <b>Cloud Mining Station — GramGo</b>\n\n` +
        `🪙GO Coin Balance: <b>${goBal.toFixed(2)} GO</b>\n` +
        `⏳ Mining Profits Accumulated Now: <b>+${unclaimedGo.toFixed(6)} Gram</b>\n` +
        `⚡ Mining rate: <b>${ratePercent}% daily</b>\n` +
        `📈 Expected production: <b>+${dailyYield} Gram / 24 hours</b>\n` +
        `🟢 Mining status: <b>${calc.isMining ? "Cloud mining 24/7 active (runs automatically)" : calc.isCycleCompleted ? "Mining stopped (24 hours completed) — Please collect profits to start a new cycle" : "Waiting for GO Points"}</b>\n\n` +
        `Click the button below to open the app, collect profits and manage your account:`;

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
      const [addr, balanceResult, mismatch] = await Promise.all([
        getWalletAddress(),
        getWalletBalanceDetailed(),
        checkWalletAddressMismatch(),
      ]);
      const { balance, error: balanceError } = balanceResult;
      const statusLine = balanceError
        ? `❌ Unable to read balance from TON network:\n<code>${esc(balanceError)}</code>`
        : balance && parseFloat(balance) < 0.1
          ? "⚠️ Low balance — Top up the wallet to ensure successful withdrawals."
          : "✅ The wallet is ready to send.";
      await bot.sendMessage(
        msg.chat.id,
        `💼 <b>Hot Bot Wallet</b>\n\n` +
          `📍 Address:\n<code>${esc(addr ?? "unavailable")}</code>\n\n` +
          `💰 Balance: <b>${balance ?? "—"} TON</b>\n\n` +
          statusLine +
          (mismatch
            ? `\n\n🚨 <b>Warning: Address different from the actual wallet!</b>\n` +
              `The <code>WALLET_ADDRESS</code> variable on the server is set to:\n<code>${esc(mismatch.configured)}</code>\n\n` +
              `But the secret key <code>OWNER_SECRET_KEY</code> actually controls another wallet (address above ⬆️).` +
              `Sending is always done from the wallet that holds the secret key, not from the WALLET_ADDRESS value — because sending needs the secret key itself, not just the address.` +
              `You must either charge the address shown above, or put in OWNER_SECRET_KEY the same key as the wallet whose address is ${esc(mismatch.configured)}.`
            : ""),
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
        `✅ You have been registered as the owner of the bot!\nID: ${userId}\nThe administration panel is available to you within the Web App in the Admin section.`,
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

      // ── Complaint System Callbacks ──────────────────────────────────────────
      if (data.startsWith("admin_reply_complaint_")) {
        const isAdmin = await getAdminInfo(userId);
        if (!isAdmin) {
           await bot.answerCallbackQuery(q.id, { text: "Unauthorized", show_alert: true });
           return;
        }
        await handleAdminReplyComplaintClick(bot, q);
        return;
      }

      if (data === "complaint_no") {
        await bot.answerCallbackQuery(q.id);
        try {
          await bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: chatId, message_id: q.message.message_id }
          );
        } catch {}
        await clearAdminState(userId);
        await bot.sendMessage(
          userId,
          "❌ The complaint has been cancelled.\n\nIf you need help at any time, you can return to the support section again."
        );
        return;
      }

      if (data === "complaint_yes") {
        await bot.answerCallbackQuery(q.id);
        try {
          await bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: chatId, message_id: q.message.message_id }
          );
        } catch {}
        await setAdminState(userId, "user_writing_complaint", {});
        await bot.sendMessage(
          userId,
          "✍️ <b>Write your complaint now</b>\n\n" +
          "Please write your message in detail, and it will be sent directly to the support team.\n\n" +
          "You can explain the problem or inquiry you need help with.\n\n" +
          "⏳ After sending the message, you will be notified that it has reached the support team.",
          { parse_mode: "HTML" }
        );
        return;
      }
      // ──────────────────────────────────────────────────────────────────────

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
                text: "🚧 The bot is currently under maintenance. Try again later.",
                show_alert: true,
              })
              .catch(() => {});
            return;
          }
        }


        // ── Admin Task Creation Callback (adm_task_cat:*) ───────────────
        if (data.startsWith("adm_task_cat:") && adminInfo) {
          const category = data.split(":")[1]; // "bot" or "channel"
          await setAdminState(userId, "admin_task_title", { category, chatId, messageId: q.message?.message_id });
          await bot.editMessageText("📝 Enter <b>task name</b> (task title):", {
            chat_id: chatId,
            message_id: q.message?.message_id,
            parse_mode: "HTML",
          }).catch(() => {});
          await bot.answerCallbackQuery(q.id);
          return;
        }

        // ── Admin News Broadcast Confirmation Callbacks (news_bc:*) ───────────────
        if (data.startsWith("news_bc:") && adminInfo) {
          const subAction = data.split(":")[1];

          if (subAction === "cancel") {
            await clearAdminState(userId);
            await bot.editMessageText("❌ The news channel’s post has been cancelled.", {
              chat_id: chatId,
              message_id: q.message?.message_id,
            }).catch(() => {});
            await bot.answerCallbackQuery(q.id, { text: "Canceled" });
            return;
          }

          if (subAction === "send") {
            const state = await getAdminState(userId);
            if (!state || !state.metadata) {
              await bot.answerCallbackQuery(q.id, { text: "The session has ended", show_alert: true });
              return;
            }

            const { fromChatId, messageId, btnStyle, btnName, customEmojiId, btnUrl, textData, entitiesData, mediaType, fileId } = state.metadata as any;
            await clearAdminState(userId);

            await bot.editMessageText("⏳ <b>Posting in the channel...</b>", {
              chat_id: chatId,
              message_id: q.message?.message_id,
              parse_mode: "HTML",
            }).catch(() => {});

            const newsButton: any = {
              text: btnName || "Open",
              url: btnUrl || `https://t.me/GramGO1_bot`, // Using bot URL
            };
            if (btnStyle && ["success", "primary", "destructive", "secondary"].includes(btnStyle)) {
              newsButton.style = btnStyle;
            }
            if (customEmojiId) {
              newsButton.icon_custom_emoji_id = customEmojiId;
            }

            try {
              const sendOpts: any = {
                  reply_markup: {
                    inline_keyboard: [[newsButton]],
                  },
                };
                if (entitiesData && entitiesData.length > 0) {
                  if (mediaType) {
                    sendOpts.caption_entities = entitiesData;
                  } else {
                    sendOpts.entities = entitiesData;
                  }
                }
                if (mediaType && fileId) {
                  sendOpts.caption = textData;
                  if (mediaType === "photo") {
                    await bot.sendPhoto("@GramGO1News", fileId, sendOpts);
                  } else if (mediaType === "video") {
                    await bot.sendVideo("@GramGO1News", fileId, sendOpts);
                  } else if (mediaType === "animation") {
                    await bot.sendAnimation("@GramGO1News", fileId, sendOpts);
                  } else if (mediaType === "document") {
                    await bot.sendDocument("@GramGO1News", fileId, sendOpts);
                  } else if (mediaType === "audio") {
                    await bot.sendAudio("@GramGO1News", fileId, sendOpts);
                  } else if (mediaType === "voice") {
                    await bot.sendVoice("@GramGO1News", fileId, sendOpts);
                  } else {
                    await bot.copyMessage("@GramGO1News", fromChatId, messageId, { reply_markup: { inline_keyboard: [[newsButton]] } });
                  }
                } else if (textData || (entitiesData && entitiesData.length > 0)) {
                  await bot.sendMessage("@GramGO1News", textData || " ", sendOpts);
                } else {
                  await bot.copyMessage("@GramGO1News", fromChatId, messageId, { reply_markup: { inline_keyboard: [[newsButton]] } });
                }
              await bot.sendMessage(chatId, "✅ <b>Successfully published in the channel!</b>", { parse_mode: "HTML" });
              await bot.answerCallbackQuery(q.id, { text: "Published 🚀" });
            } catch (err: any) {
              logger.error({ err }, "Error sending to news channel");
              let errMsg = "An unknown error has occurred";
              if (err.response && err.response.body && err.response.body.description) {
                errMsg = err.response.body.description;
              }
              await bot.sendMessage(chatId, `❌ <b>Post failed:</b> ${errMsg}`, { parse_mode: "HTML" });
              await bot.answerCallbackQuery(q.id, { text: "Deployment failed" });
            }
            return;
          }
        }

        // ── Admin Broadcast Confirmation Callbacks (adm_bc:*) ───────────────
        if (data.startsWith("adm_bc:") && adminInfo) {
          const parts = data.split(":");
          const subAction = parts[1]; // "send" or "cancel"

          if (subAction === "cancel") {
            await clearAdminState(userId);
            await bot.editMessageText("❌ Group broadcast has been cancelled.", {
              chat_id: chatId,
              message_id: q.message?.message_id,
            }).catch(() => {});
            await bot.answerCallbackQuery(q.id, { text: "Canceled" });
            return;
          }

          if (subAction === "send") {
            const isPin = parts[2] === "1";
            const msgId = parseInt(parts[3] || "0");
            const state = await getAdminState(userId);
            await clearAdminState(userId);

            const fromChatId = (state?.metadata?.fromChatId as number) || chatId;
            const messageId = msgId || (state?.metadata?.messageId as number);

            await bot.editMessageText("⏳ <b>The group broadcast is starting for everyone with the special emoji...</b>", {
              chat_id: chatId,
              message_id: q.message?.message_id,
              parse_mode: "HTML",
            }).catch(() => {});

            const textData = (state?.metadata?.textData as string) || "";
            const entitiesData = (state?.metadata?.entitiesData as any[]) || undefined;
            const mediaType = state?.metadata?.mediaType as string | undefined;
            const fileId = state?.metadata?.fileId as string | undefined;

            const res = await startBroadcast(
              bot,
              userId,
              textData || "Broadcast",
              entitiesData,
              isPin,
              fromChatId,
              messageId,
              mediaType,
              fileId
            );

            await bot.sendMessage(chatId, res.message, { parse_mode: "HTML" });
            await bot.answerCallbackQuery(q.id, { text: "Transmission has started 🚀" });
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
              `📊 <b>Comprehensive system statistics</b>\n\n` +
              `👥 Total registered: <b>${usersCount?.c ?? 0}</b>\n` +
              `🚫 Banned: <b>${bannedCount?.c ?? 0}</b>\n` +
              `🔗 Total Referrals: <b>${refsCount?.c ?? 0}</b>\n` +
              `💸 Total withdrawals: <b>${totalWd?.c ?? 0}</b>\n` +
              `⏳ Pending withdrawals: <b>${pendingWd?.c ?? 0}</b>`;

            await bot.sendMessage(chatId, statsText, { parse_mode: "HTML" });
            await bot.answerCallbackQuery(q.id);
            return;
          }

          if (action === "welcome") {
            await setAdminState(userId, "admin_welcome_msg", {});
            await bot.sendMessage(
              chatId,
              `✏️ <b>Edit the welcome message</b>\n\n` +
                `Now send the text of the new welcome message.\n` +
                `<i>Supports HTML formatting and the use of variables such as: {first_name}, {username}, {user_id}</i>\n` +
                `<i>(To cancel, send /cancel)</i>`,
              { parse_mode: "HTML" }
            );
            await bot.answerCallbackQuery(q.id);
            return;
          }

          if (action === "broadcast") {
            await setAdminState(userId, "admin_broadcast", {});
            await bot.sendMessage(
              chatId,
              `📨 <b>Send a group broadcast (Broadcast)</b>\n\n` +
                `Now send the text of the message you want to broadcast to all users.\n` +
                `<i>(To cancel, send /cancel)</i>`,
              { parse_mode: "HTML" }
            );
            await bot.answerCallbackQuery(q.id);
            return;
          }

          if (action === "find_user") {
            await setAdminState(userId, "admin_find_user", {});
            await bot.sendMessage(
              chatId,
              `👤 <b>Search for a user</b>\n\nSend user ID (Telegram ID) or username (@username):\n<i>(To cancel, send /cancel)</i>`,
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
              `💸 <b>Modify the minimum withdrawal amount</b>\n\nCurrent limit: <b>${current} TON</b>\nSend the new value (number only):\n<i>(To cancel, send /cancel)</i>`,
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
              `💰 <b>Modify the minimum deposit</b>\n\nCurrent limit: <b>${current} TON</b>\nSend the new value (number only):\n<i>(For cancellation send /cancel)</i>`,
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
              `🔗 <b>Modify referral bonus</b>\n\nCurrent bonus: <b>${current} GO</b>\nSend the new value (number only):\n<i>(To cancel send /cancel)</i>`,
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
              text: newStatus ? "🟢 Maintenance has been stopped — the bot is now working" : "🔴 Maintenance mode has been activated",
              show_alert: true,
            });
            await bot.sendMessage(
              chatId,
              `🔧 Bot status now: <b>${newStatus ? "🟢Works for everyone": "🔴Under maintenance (users blocked)"}</b>`,
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
              await bot.sendMessage(chatId, "✅ There are currently no pending withdrawal requests.");
              return;
            }

            for (const w of pendingList) {
              const card =
                `💸 <b>Pending withdrawal request #${w.id}</b>\n\n` +
                `👤 User: <b>${esc(w.firstName || "User")}</b> (${w.username ? "@" + esc(w.username) : "Without User"})\n` +
                `🆔 Handles: <code>${w.userId}</code>\n` +
                `💰 Amount: <b>${w.amount} ${w.currency}</b>\n` +
                `📍 Wallet: <code>${w.walletAddress}</code>`;

              await bot.sendMessage(chatId, card, {
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: "✅ Agree", callback_data: `withdraw_approve_${w.id}` },
                      { text: "❌ He refused", callback_data: `withdraw_reject_${w.id}` },
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

        if (data.startsWith("user_reply_complaint_")) {
          await handleUserReplyComplaintClick(bot, q);
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
            await bot.answerCallbackQuery(q.id, { text: "🚫 The user has been successfully blocked", show_alert: true });
            return;
          }
        }

        if (data.startsWith("adm_unban_") && adminInfo) {
          const targetId = parseInt(data.replace("adm_unban_", ""));
          if (!isNaN(targetId)) {
            await db.update(usersTable).set({ isVisible: true }).where(eq(usersTable.id, targetId));
            await logAdminAudit(userId, "unban_user", {}, targetId);
            await bot.answerCallbackQuery(q.id, { text: "🔓 The user has been unblocked", show_alert: true });
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
              text: nextStatus ? "🔒 The user has been blocked from withdrawing" : "🔓 The user has been allowed to withdraw",
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


            if (state.step === "admin_task_title") {
              const title = input.trim();
              if (!title) {
                await bot.sendMessage(chatId, "❌ Please enter valid text.", { parse_mode: "HTML" });
                return;
              }
              await setAdminState(userId, "admin_task_desc", { ...state.metadata, title });
              await bot.sendMessage(chatId, "📝 Enter <b>task description</b> (or send <code>-</code> to skip description):", { parse_mode: "HTML" });
              return;
            }

            if (state.step === "admin_task_desc") {
              const description = input.trim() === "-" ? null : input.trim();
              await setAdminState(userId, "admin_task_icon", { ...state.metadata, description });
              await bot.sendMessage(chatId, "🖼 Send a <b>Custom Emoji</b> or <b>Image</b> for the task (or send <code>-</code> to skip the image):", { parse_mode: "HTML" });
              return;
            }

            if (state.step === "admin_task_icon") {
              let channelPhotoUrl: string | undefined;
              let customEmojiId: string | undefined;
              let icon: string | undefined;

              if (msg.photo && msg.photo.length > 0) {
                try {
                  const photo = msg.photo[msg.photo.length - 1];
                  const fileData = await bot.getFile(photo.file_id);
                  const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
                  if (fileData.file_path) {
                    channelPhotoUrl = `https://api.telegram.org/file/bot${token}/${fileData.file_path}`;
                  }
                } catch (err) {
                  logger.error({ err }, "Error resolving photo for task");
                }
              } else if (input !== "-") {
                if (msg.entities && msg.entities.length > 0) {
                  const customEmojiEntity = msg.entities.find(e => e.type === "custom_emoji");
                  if (customEmojiEntity && customEmojiEntity.custom_emoji_id) {
                    customEmojiId = customEmojiEntity.custom_emoji_id;
                  }
                }
                if (!customEmojiId && /^\d+$/.test(input.trim())) {
                  customEmojiId = input.trim();
                } else if (!customEmojiId) {
                  icon = input.trim();
                }
              }

              // Use existing metadata and append the new image/icon info
              await setAdminState(userId, "admin_task_url", {
                ...state.metadata,
                channelPhotoUrl,
                icon: customEmojiId ? customEmojiId : icon || "⭐" // if custom emoji, store it in icon field for DB
              });

              await bot.sendMessage(chatId, "🔗 Enter <b>task link (URL)</b>:", { parse_mode: "HTML" });
              return;
            }

            if (state.step === "admin_task_url") {
              const url = input.trim() === "-" ? null : input.trim();
              if (url && !url.startsWith("http")) {
                await bot.sendMessage(chatId, "❌ The link must start with http or https. Try again:", { parse_mode: "HTML" });
                return;
              }

              await setAdminState(userId, "admin_task_reward", { ...state.metadata, url });
              await bot.sendMessage(chatId, "💰 Enter <b>Bonus Value</b> (eg: 5):", { parse_mode: "HTML" });
              return;
            }

            if (state.step === "admin_task_reward") {
              const rewardAmount = parseFloat(input.trim());
              if (isNaN(rewardAmount) || rewardAmount <= 0) {
                await bot.sendMessage(chatId, "❌ Please enter a valid and positive number for the reward.", { parse_mode: "HTML" });
                return;
              }

              await setAdminState(userId, "admin_task_limit", { ...state.metadata, rewardAmount });
              await bot.sendMessage(chatId, "📈 Enter <b>Limit</b> (send <code>0</code> or <code>-</code> to make it unlimited):", { parse_mode: "HTML" });
              return;
            }

            if (state.step === "admin_task_limit") {
              let maxClaims = parseInt(input.trim());
              if (input.trim() === "-" || maxClaims <= 0 || isNaN(maxClaims)) {
                maxClaims = null as any;
              }

              const md = state.metadata || {};
              const category = md.category as string || "all";
              const title = md.title as string;
              const description = md.description as string | null;
              const icon = md.icon as string | undefined;
              const channelPhotoUrl = md.channelPhotoUrl as string | null;
              const url = md.url as string | null;
              const rewardAmount = md.rewardAmount as number;

              let botUsername: string | null = null;
              let channelUsername: string | null = null;
              let botLink: string | null = url;

              // Parse URLs if necessary based on category
              if (url) {
                if (category === "bot") {
                  botUsername = url.match(/t\.me\/([A-Za-z0-9_]+)/)?.[1] || null;
                } else if (category === "channel") {
                  channelUsername = url.match(/t\.me\/([A-Za-z0-9_]+)/)?.[1] || null;
                }
              }

              try {
                await db.insert(tasksTable).values({
                  title,
                  description,
                  url,
                  icon: icon || "⭐",
                  channelPhotoUrl,
                  rewardAmount: String(rewardAmount),
                  rewardCurrency: "GO",
                  maxClaims,
                  category,
                  botUsername,
                  channelUsername,
                  botLink,
                  isActive: true,
                });

                await bot.sendMessage(chatId, `✅ <b>Quest created successfully!</b>\n\nQuest Name: ${esc(title)}\nCategory: ${category}\nReward: ${rewardAmount} GO`, { parse_mode: "HTML" });
                await clearAdminState(userId);
              } catch (err) {
                logger.error({ err, userId }, "Failed to create task");
                await bot.sendMessage(chatId, "❌ An error occurred while creating the task. Please try again later.", { parse_mode: "HTML" });
                // We don't clear state so they can try again if it was a transient error, or they can use /cancel
              }
              return;
            }

            if (state.step === "admin_broadcast") {
              let mediaType: string | undefined;
              let fileId: string | undefined;

              if (msg.photo && msg.photo.length > 0) {
                mediaType = "photo";
                fileId = msg.photo[msg.photo.length - 1].file_id;
              } else if (msg.video) {
                mediaType = "video";
                fileId = msg.video.file_id;
              } else if (msg.animation) {
                mediaType = "animation";
                fileId = msg.animation.file_id;
              } else if (msg.document) {
                mediaType = "document";
                fileId = msg.document.file_id;
              } else if (msg.audio) {
                mediaType = "audio";
                fileId = msg.audio.file_id;
              } else if (msg.voice) {
                mediaType = "voice";
                fileId = msg.voice.file_id;
              }

              // Store pending broadcast message in state
              await setAdminState(userId, "admin_broadcast_confirm", {
                fromChatId: msg.chat.id,
                messageId: msg.message_id,
                textData: msg.text || msg.caption || "",
                entitiesData: msg.entities || msg.caption_entities || [],
                mediaType,
                fileId,
                textPreview: msg.text || msg.caption || "(File/Media)",
              });

              await bot.sendMessage(
                chatId,
                `👁️ <b>Broadcast message preview is ready!</b>\n\n` +
                  `👆 The above message will be sent to all bot users with all <b>Custom Emojis</b>, formats, and images.\n\n` +
                  `Want to start sending now?`,
                {
                  parse_mode: "HTML",
                  reply_to_message_id: msg.message_id,
                  reply_markup: {
                    inline_keyboard: [
                      [
                        { text: "🚀 Send to everyone now", callback_data: `adm_bc:send:0:${msg.message_id}` },
                        { text: "📌 Send with installation", callback_data: `adm_bc:send:1:${msg.message_id}` },
                      ],
                      [
                        { text: "❌ Cancel", callback_data: "adm_bc:cancel" },
                      ],
                    ],
                  },
                }
              );
              return;
            }

            if (state.step === "admin_news_broadcast") {
              let mediaType: string | undefined;
              let fileId: string | undefined;

              if (msg.photo && msg.photo.length > 0) {
                mediaType = "photo";
                fileId = msg.photo[msg.photo.length - 1].file_id;
              } else if (msg.video) {
                mediaType = "video";
                fileId = msg.video.file_id;
              } else if (msg.animation) {
                mediaType = "animation";
                fileId = msg.animation.file_id;
              } else if (msg.document) {
                mediaType = "document";
                fileId = msg.document.file_id;
              } else if (msg.audio) {
                mediaType = "audio";
                fileId = msg.audio.file_id;
              } else if (msg.voice) {
                mediaType = "voice";
                fileId = msg.voice.file_id;
              }

              await setAdminState(userId, "admin_news_bc_color", {
                fromChatId: msg.chat.id,
                messageId: msg.message_id,
                textData: msg.text || msg.caption || "",
                entitiesData: msg.entities || msg.caption_entities || [],
                mediaType,
                fileId,
              });
              await bot.sendMessage(
                chatId,
                `✅ <b>Post received.</b>\n\n` +
                `🎨 <b>What color is the button?</b>\n` +
                `(Type success for green, primary for blue, destructive for red, or any other color)`,
                { parse_mode: "HTML" }
              );
              return;
            }

            if (state.step === "admin_news_bc_color") {
              let style = input.trim().toLowerCase();
              if (style === "Green" || style === "green") style = "success";
              else if (style === "Red" || style === "red") style = "destructive";
              else if (style === "Blue" || style === "blue") style = "primary";

              await setAdminState(userId, "admin_news_bc_btn_name", {
                ...state.metadata,
                btnStyle: style,
              });
              await bot.sendMessage(
                chatId,
                `✅ <b>Color selected:</b> ${style}\n\n` +
                `📝 <b>What is the name of the button?</b>\n` +
                `(The word that will appear on the button)`,
                { parse_mode: "HTML" }
              );
              return;
            }

            if (state.step === "admin_news_bc_btn_name") {
              const btnName = input.trim();
              await setAdminState(userId, "admin_news_bc_btn_emoji", {
                ...state.metadata,
                btnName,
              });
              await bot.sendMessage(
                chatId,
                `✅ <b>Name specified:</b> ${btnName}\n\n` +
                `✨ <b>What is the special emoji for the button?</b>\n` +
                `(Send the emoji here, or send the emoji ID directly. If you don't want an emoji, send -)`,
                { parse_mode: "HTML" }
              );
              return;
            }

            if (state.step === "admin_news_bc_btn_emoji") {
              let customEmojiId: string | undefined = undefined;
              if (input !== "-") {
                if (msg.entities && msg.entities.length > 0) {
                  const customEmojiEntity = msg.entities.find(e => e.type === "custom_emoji");
                  if (customEmojiEntity && customEmojiEntity.custom_emoji_id) {
                    customEmojiId = customEmojiEntity.custom_emoji_id;
                  }
                }
                if (!customEmojiId && /^\d+$/.test(input.trim())) {
                  customEmojiId = input.trim();
                }
              }

              const md = state.metadata || {};
              const fromChatId = md.fromChatId as number;
              const messageId = md.messageId as number;
              const btnStyle = md.btnStyle as string;
              const btnName = md.btnName as string;

              await setAdminState(userId, "admin_news_bc_btn_url", {
                ...md,
                customEmojiId,
              });

              await bot.sendMessage(
                chatId,
                `✅ <b>Emoji selected!</b>\n\n` +
                `🔗 <b>What is the link (URL) of the button?</b>\n` +
                `(Example: https://t.me/GramGO1_bot or contest link)`,
                { parse_mode: "HTML" }
              );
              return;
            }

            if (state.step === "admin_news_bc_btn_url") {
              const btnUrl = input.trim();

              const md = state.metadata || {};
              const fromChatId = md.fromChatId as number;
              const messageId = md.messageId as number;
              const btnStyle = md.btnStyle as string;
              const btnName = md.btnName as string;
              const customEmojiId = md.customEmojiId as string | undefined;
              const textData = md.textData;
              const entitiesData = md.entitiesData;
              const mediaType = md.mediaType;
              const fileId = md.fileId;

              await setAdminState(userId, "admin_news_bc_confirm", {
                ...md,
                btnUrl
              });

              // Construct the preview keyboard
              const previewButton: any = {
                text: btnName,
                url: btnUrl || `https://t.me/GramGO1_bot`, // Base bot link
              };
              if (btnStyle && ["success", "primary", "destructive", "secondary"].includes(btnStyle)) {
                previewButton.style = btnStyle;
              }
              if (customEmojiId) {
                previewButton.icon_custom_emoji_id = customEmojiId;
              }

              await bot.sendMessage(
                chatId,
                `👁️ <b>Broadcast message preview is ready!</b>\n\n` +
                `The attached post will be published in the <b>@GramGO1News</b> channel with the following button:\n\n` +
                `Are you sure to publish now?`,
                {
                  parse_mode: "HTML",
                  reply_to_message_id: messageId,
                  reply_markup: {
                    inline_keyboard: [
                      [previewButton],
                      [
                        { text: "🚀 Publish now in the channel", callback_data: `news_bc:send` },
                        { text: "❌ Cancel", callback_data: "news_bc:cancel" },
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
              await bot.sendMessage(chatId, "✅ <b>The text of the welcome message has been saved successfully!</b>", { parse_mode: "HTML" });
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
                await bot.sendMessage(chatId, "❌ No user was found with this data.");
                return;
              }

              const card =
                `👤 <b>User data card</b>\n\n` +
                `🆔 Handles: <code>${targetUser.id}</code>\n` +
                `👤 Name: <b>${esc(targetUser.firstName || "")} ${esc(targetUser.lastName || "")}</b>\n` +
                `🔗 Username: ${targetUser.username? "@" + esc(targetUser.username) : "Without user"}\n` +
                `🪙GO Balance: <b>${targetUser.goBalance} GO</b>\n` +
                `💎 GRAM Balance: <b>${targetUser.gramBalance} Gram</b>\n` +
                `💼 TON Balance: <b>${targetUser.tonBalance} TON</b>\n` +
                `👥 Number of referrals: <b>${targetUser.referralCount}</b>\n` +
                `🚫 Ban status: <b>${targetUser.isVisible ? "Active and not blocked": "🔴Blocked"}</b>\n` +
                `💸 Draw status: <b>${targetUser.isWithdrawalBanned ? "🔴Prohibited from withdrawing": "🟢Allowed to withdraw"}</b>\n` +
                `📅 Registration date: <code>${new Date(targetUser.createdAt).toLocaleDateString("ar")}</code>`;

              const botUsername = (await bot.getMe()).username;
              const dmLink = `https://t.me/${botUsername}?start=dm_${targetUser.id}`;

              await bot.sendMessage(chatId, card, {
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: targetUser.isVisible ? "🚫 Block user" : "🔓 Unblock",
                        callback_data: targetUser.isVisible ? `adm_ban_${targetUser.id}` : `adm_unban_${targetUser.id}`,
                      },
                      {
                        text: targetUser.isWithdrawalBanned ? "🔓 Allow withdrawal" : "🔒 Prevent withdrawal",
                        callback_data: `adm_toggle_wd_${targetUser.id}`,
                      },
                    ],
                    [
                      { text: "✉️ Private messaging (Deep Link)", url: dmLink },
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
                await bot.sendMessage(chatId, "❌ You must enter a valid and positive number.");
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
              await bot.sendMessage(chatId, `✅ The minimum withdrawal limit is set to: <b>${val} TON</b>`, { parse_mode: "HTML" });
              return;
            }

            if (state.step === "admin_min_deposit") {
              await clearAdminState(userId);
              const val = parseFloat(input);
              if (isNaN(val) || val <= 0) {
                await bot.sendMessage(chatId, "❌ You must enter a valid and positive number.");
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
              await bot.sendMessage(chatId, `✅ The minimum deposit is set to: <b>${val} TON</b>`, { parse_mode: "HTML" });
              return;
            }

            if (state.step === "admin_ref_reward") {
              await clearAdminState(userId);
              const val = parseFloat(input);
              if (isNaN(val) || val <= 0) {
                await bot.sendMessage(chatId, "❌ You must enter a valid and positive number.");
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
              await bot.sendMessage(chatId, `✅ Referral bonus is set to: <b>${val} GO</b>`, { parse_mode: "HTML" });
              return;
            }

            if (state.step === "admin_replying_to_user") {
              const targetUserId = state.metadata?.targetUserId as number;
              if (targetUserId) {
                await deliverAdminReplyToUser(bot, userId, targetUserId, input);
                return;
              }
            }

            if (state.step === "admin_reply_complaint") {
              const targetUserId = state.metadata?.targetUserId as number;
              const complaintId = state.metadata?.complaintId as number;
              if (targetUserId && complaintId) {
                await deliverAdminReplyToComplaint(bot, userId, targetUserId, complaintId, input);
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

          if (userState && userState.step === "user_writing_complaint") {
            await handleComplaintSubmission(bot, msg);
            return;
          }

          if (userState && userState.step === "user_replying_to_admin") {
            await clearAdminState(userId);
            await handleUserSupportMessage(bot, msg);
            return;
          }

          if (userState && userState.step === "user_replying_to_complaint") {
            const complaintId = Number(userState.metadata?.complaintId || 0);
            await clearAdminState(userId);
            await handleUserReplyToComplaintMessage(bot, msg, complaintId);
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
        const channelName = raw.chat.title || raw.chat.username || "Channel";

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
            `⚠️ <b>Warning!</b>\nUser <b>${userDisplay}</b> left the channel: <b>${esc(channelName)}</b>`,
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "📤 Send an alert to the person",
                      callback_data: `ref:warn:${userId}`,
                    },
                    {
                      text: "❌ Referral discount",
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
