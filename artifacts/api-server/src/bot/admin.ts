import TelegramBot from "node-telegram-bot-api";
import { db } from "@workspace/db";
import { setAdminState } from "./fsm";
import {
  usersTable,
  tasksTable,
  wheelSlotsTable,
  botSettingsTable,
  withdrawalsTable,
  adminsTable,
  referralsTable,
} from "@workspace/db/schema";
import { eq, desc, sql, count, ilike, and, inArray } from "drizzle-orm";
import { addGoBalanceAndClaim } from "../lib/miningUtils";
import { logger } from "../lib/logger";
import { isBotEnabled, setBotEnabled, clearBotEnabledCache } from "./control";
import { clearAllSubCache } from "./subscription";
import { invalidateSetting } from "../lib/settingsCache";

export const OWNER_USERNAME = (process.env.OWNER_USERNAME || "J_O_H_N8").replace(/^@/, "");

type AdminPermission = "canUnban" | "canWarn" | "canReceiveWithdrawals" | "canEditWheel";

const ALL_PERMS: AdminPermission[] = ["canUnban", "canWarn", "canReceiveWithdrawals", "canEditWheel"];

export const PERM_LABELS: Record<AdminPermission, string> = {
  canUnban:              "🔓 Lifting the ban",
  canWarn:               "⚠️ Warning users",
  canReceiveWithdrawals: "💸 Managing withdrawals",
  canEditWheel:          "⛏️ Mining management",
};

// ─────────────────────────── HTML ESCAPE ───────────────────────────

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─────────────────────────── AUTH ───────────────────────────
import { OWNER_TELEGRAM_ID } from "../lib/adminSecurity";

export interface AdminInfo {
  isOwner: boolean;
  permissions: AdminPermission[];
}

export async function isOwner(userId: number, _username?: string): Promise<boolean> {
  return Number(userId) === OWNER_TELEGRAM_ID;
}

export async function getAdminInfo(userId: number, _username?: string): Promise<AdminInfo | null> {
  if (Number(userId) === OWNER_TELEGRAM_ID) {
    return { isOwner: true, permissions: [...ALL_PERMS] };
  }
  return null;
}

export function hasPerm(info: AdminInfo, _perm?: AdminPermission): boolean {
  return info?.isOwner === true;
}

// ─────────────────────────── HELPERS ───────────────────────────

export async function checkChannelMembership(
  bot: TelegramBot,
  userId: number,
  channelUsername: string
): Promise<boolean> {
  try {
    const member = await bot.getChatMember(`@${channelUsername}`, userId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch {
    return false;
  }
}

export async function getChannelPhotoUrl(
  bot: TelegramBot,
  channelUsername: string
): Promise<string | null> {
  try {
    const chat = await bot.getChat(`@${channelUsername}`) as unknown as {
      photo?: { big_file_id: string };
    };
    if (!chat.photo?.big_file_id) return null;
    const file = await bot.getFile(chat.photo.big_file_id);
    if (!file.file_path) return null;
    const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
    return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  } catch {
    return null;
  }
}

interface ConvState {
  step: string;
  data: Record<string, unknown>;
}
export const adminConvState = new Map<number, ConvState>();

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(botSettingsTable).where(eq(botSettingsTable.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(botSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: botSettingsTable.key, set: { value } });
}

async function editOrSend(
  bot: TelegramBot,
  chatId: number,
  text: string,
  keyboard: TelegramBot.InlineKeyboardMarkup,
  messageId?: number
) {
  const opts = { parse_mode: "HTML" as const, reply_markup: keyboard };
  if (messageId) {
    try {
      await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
      return;
    } catch { /* fall through to send */ }
  }
  await bot.sendMessage(chatId, text, { ...opts });
}

// ─────────────────────────── MAIN MENU ───────────────────────────

export async function showAdminMenu(bot: TelegramBot, chatId: number, messageId?: number, info?: AdminInfo) {
  const [usersRes] = await db.select({ c: count() }).from(usersTable);
  const [pendingRes] = await db.select({ c: count() }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "pending"));
  const text =
    `🎛 <b>Control Panel — Go Mining Bot</b>\n\n` +
    `👥 Users: <b>${usersRes?.c ?? 0}</b>\n` +
    `💸 Pending withdrawal requests: <b>${pendingRes?.c ?? 0}</b>\n\n` +
    `Choose from the list:`;

  const rows: TelegramBot.InlineKeyboardButton[][] = [];

  const row1: TelegramBot.InlineKeyboardButton[] = [];
  if (!info || info.isOwner || hasPerm(info, "canEditWheel"))
    row1.push({ text: "⛏️ Mining system", callback_data: "adm:mining" });
  if (!info || info.isOwner)
    row1.push({ text: "📋 Tasks", callback_data: "adm:tasks" });
  if (row1.length) rows.push(row1);

  const row2: TelegramBot.InlineKeyboardButton[] = [];
  if (!info || info.isOwner || hasPerm(info, "canUnban") || hasPerm(info, "canWarn"))
    row2.push({ text: "👥 Users", callback_data: "adm:users" });
  if (!info || info.isOwner || hasPerm(info, "canReceiveWithdrawals"))
    row2.push({ text: "💸 Draws", callback_data: "adm:wd" });
  if (row2.length) rows.push(row2);

  if (!info || info.isOwner) {
    rows.push([
      { text: "⚙️ Settings", callback_data: "adm:settings" },
      { text: "📊 Statistics", callback_data: "adm:stats" },
    ]);
  }

  if (!info || info.isOwner) {
    rows.push([
      { text: "📢 Mandatory channels", callback_data: "adm:channels" },
      { text: "🛠 Bot control", callback_data: "adm:botctrl" },
    ]);
  }

  if (!info || info.isOwner) {
    rows.push([{ text: "👮 Moderators", callback_data: "adm:admins" }]);
  }

  // ── BOOST button (owner only) ──
  if (!info || info.isOwner) {
    const [powerRow] = await db.select().from(botSettingsTable).where(eq(botSettingsTable.key, "spin_power")).limit(1);
    const multiplier = Math.max(1, parseInt(powerRow?.value || "1") || 1);
    const boostLabel = multiplier > 1 ? `⚡ BOOST — ×${multiplier} (enabled)` : "⚡ BOOST";
    rows.push([{ text: boostLabel, callback_data: "adm:boost" }]);
    rows.push([{ text: "🎛️ Control settings", callback_data: "adm:ctrl_settings" }]);
  }

  const keyboard: TelegramBot.InlineKeyboardMarkup = { inline_keyboard: rows };
  await editOrSend(bot, chatId, text, keyboard, messageId);
}

// ─────────────────────────── BOOST MENU ───────────────────────────

async function showBoostMenu(bot: TelegramBot, chatId: number, messageId?: number) {
  const [powerRow, endRow] = await Promise.all([
    db.select().from(botSettingsTable).where(eq(botSettingsTable.key, "spin_power")).limit(1),
    db.select().from(botSettingsTable).where(eq(botSettingsTable.key, "boost_ends_at")).limit(1),
  ]);
  const current = Math.max(1, parseInt(powerRow[0]?.value || "1") || 1);
  const isActive = current > 1;
  const endsAt = endRow[0]?.value || null;

  let statusLine = "🔴 Inactive (×1)";
  if (isActive) {
    if (endsAt) {
      const remaining = new Date(endsAt).getTime() - Date.now();
      if (remaining > 0) {
        const hrs = Math.ceil(remaining / 3_600_000);
        statusLine = `🟢 Enabled ×${current} — ends in ~${hrs}h`;
      } else {
        statusLine = `🔴 BOOST has expired (×${current})`;
      }
    } else {
      statusLine = `🟢Activated ×${current} — for life`;
    }
  }

  const text =
    `⚡ <b>BOOST — double profits</b>\n\n` +
    `Status: ${statusLine}\n\n` +
    `Choose the desired multiplier and then the duration:`;

  const multiplierRow: TelegramBot.InlineKeyboardButton[] = [2, 3, 4, 5].map((n) => ({
    text: (isActive && current === n) ? `✅ ×${n}` : `×${n}`,
    callback_data: `adm:boost:set:${n}`,
  }));

  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      multiplierRow,
      [
        { text: current === 1 ? "✅ Off (×1)" : "🔴Stop the BOOST", callback_data: "adm:boost:off" },
      ],
      [{ text: "◀️ Back", callback_data: "adm:main" }],
    ],
  };
  await editOrSend(bot, chatId, text, keyboard, messageId);
}

async function showBoostDurationMenu(bot: TelegramBot, chatId: number, multiplier: number, messageId?: number) {
  const text =
    `⚡ <b>BOOST ×${multiplier} — choose duration</b>\n\n` +
    `24 hours — expires automatically after 24 hours\n` +
    `48 hours — expires automatically after 48 hours\n` +
    `Lifetime — doesn't expire until you manually stop it`;

  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: "⏱ 24 hours", callback_data: `adm:boost:dur:${multiplier}:24` },
        { text: "⏱ 48 hours", callback_data: `adm:boost:dur:${multiplier}:48` },
        { text: "♾ For life", callback_data: `adm:boost:dur:${multiplier}:0` },
      ],
      [{ text: "◀️ Back", callback_data: "adm:boost" }],
    ],
  };
  await editOrSend(bot, chatId, text, keyboard, messageId);
}

// ─────────────────────────── CONTROL SETTINGS ───────────────────────────

async function showControlSettingsMenu(bot: TelegramBot, chatId: number, messageId?: number) {
  const [rawRef, rawTask, rawMin] = await Promise.all([
    getSetting("referral_threshold"),
    getSetting("task_threshold"),
    getSetting("min_withdrawal"),
  ]);
  const refVal  = parseInt(rawRef ?? "5") || 5;
  const taskVal = parseInt(rawTask ?? "5") || 5;
  const minVal  = parseFloat(rawMin ?? "0.1") || 0.1;

  const text =
    `⚙️ <b>Current bot settings:</b>\n\n` +
    `🔄 Roll referrals: <b>${refVal}</b>\n` +
    `📋 Tasks to roll: <b>${taskVal}</b>\n` +
    `💰 Withdrawal limit: <b>${minVal.toFixed(2)} TON</b>`;

  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: "✏️ Change the number of referrals to roll", callback_data: "adm:ctrl:ref" }],
      [{ text: "✏️ Change the number of tasks to roll",   callback_data: "adm:ctrl:task" }],
      [{ text: "✏️ Change withdrawal limit",           callback_data: "adm:ctrl:minwd" }],
      [{ text: "◀️ Back",                      callback_data: "adm:main" }],
    ],
  };
  await editOrSend(bot, chatId, text, keyboard, messageId);
}

// ─────────────────────────── MINING ───────────────────────────

async function showMiningMenu(bot: TelegramBot, chatId: number, messageId?: number) {
  const [stats] = await db.select({
    totalUsers: sql<number>`count(*)`,
    totalGo: sql<string>`coalesce(sum(coalesce(go_balance, balance)), 0)`,
    totalGram: sql<string>`coalesce(sum(gram_balance), 0)`,
  }).from(usersTable);

  const rawRate = await getSetting("default_mining_rate");
  const ratePct = rawRate ? (parseFloat(rawRate) * 100).toFixed(3) : "0.125";

  const totalGoNum = parseFloat(stats?.totalGo || "0");
  const totalGramNum = parseFloat(stats?.totalGram || "0");

  const text =
    `⛏️ <b>Mining Station Settings</b>\n\n` +
    `⚡ Daily mining percentage: <b>${ratePct}%</b>\n` +
    `🪙Total Go coins mined: <b>${totalGoNum.toFixed(2)} Go</b>\n` +
    `💎 Total Grams mined: <b>${totalGramNum.toFixed(4)} Gram</b>\n` +
    `📈 Daily Grid Production: <b>${(totalGoNum * (parseFloat(ratePct)/100)).toFixed(4)} Gram/day</b>\n\n` +
    `Choose a control action:`;

  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: "✏️ Adjust daily mining percentage (%)", callback_data: "adm:m:rate" }],
      [{ text: "🪙 Distributing the Go reward to all users", callback_data: "adm:m:airdrop" }],
      [{ text: "◀️ Back", callback_data: "adm:main" }],
    ],
  };
  await editOrSend(bot, chatId, text, keyboard, messageId);
}

// ─────────────────────────── TASKS ───────────────────────────

async function showTasksMenu(bot: TelegramBot, chatId: number, messageId?: number) {
  const tasks = await db.select().from(tasksTable).orderBy(tasksTable.id);
  let text = "📋 <b>Task Management</b>\n\n";
  if (tasks.length === 0) text += "There are no tasks yet.\n";
  else tasks.forEach((t) => { text += `${t.isActive ? "✅" : "❌"} [${t.id}] ${esc(t.title)}\n`; });
  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      ...tasks.map((t) => [
        { text: `${t.isActive ? "✅" : "❌"} ${t.title.substring(0, 28)}`, callback_data: `adm:t:v:${t.id}` },
      ]),
      [{ text: "➕ Add a new task", callback_data: "adm:t:add" }],
      [{ text: "◀️ Back", callback_data: "adm:main" }],
    ],
  };
  await editOrSend(bot, chatId, text, keyboard, messageId);
}

// ─────────────────────────── USERS ───────────────────────────

async function showUsersMenu(bot: TelegramBot, chatId: number, messageId?: number) {
  const [res] = await db.select({ c: count() }).from(usersTable);
  const text =
    `👥 <b>User Management</b>\n\n` +
    `Total users: <b>${res?.c ?? 0}</b>\n\n` +
    `Search by ID or @username:`;
  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: "🔍 Search for a user", callback_data: "adm:u:search" }],
      [{ text: "◀️ Back", callback_data: "adm:main" }],
    ],
  };
  await editOrSend(bot, chatId, text, keyboard, messageId);
}

function showUserCard(bot: TelegramBot, chatId: number, u: typeof usersTable.$inferSelect, info: AdminInfo) {
  const safeName = esc(`${u.firstName || "—"} ${u.lastName || ""}`.trim());
  const safeUsername = u.username ? `@${esc(u.username)}` : "—";
  const banned = u.isVisible === false;
  const goBal = parseFloat(u.goBalance || u.balance || "0").toFixed(2);
  const gramBal = parseFloat(u.gramBalance || "0").toFixed(4);
  const infoText =
    `${banned ? "🚫 Blocked": "✅ Active"} | ID: ${u.id}\n\n` +
    `Name: ${safeName}\n` +
    `Username: ${safeUsername}\n` +
    `🪙Go Balance: <b>${goBal} Go</b>\n` +
    `💎 Gram Balance: <b>${gramBal} Gram</b>\n` +
    `💰 TON Balance: <b>${parseFloat(u.tonBalance || "0").toFixed(4)} TON</b>\n` +
    `👥 Referrals: ${u.referralCount}\n` +
    `✅ Completed tasks: ${u.tasksCompleted}`;

  const rows: TelegramBot.InlineKeyboardButton[][] = [];

  if (info.isOwner) {
    rows.push([
      { text: "🪙 Add Go coins", callback_data: `adm:u:addbal:${u.id}` },
      { text: "💸 Go coins discount", callback_data: `adm:u:subbal:${u.id}` },
    ]);
    rows.push([
      { text: "✏️ Determine Go balance", callback_data: `adm:u:bal:${u.id}` },
      { text: "💎 Modify the gram balance", callback_data: `adm:u:spins:${u.id}` },
    ]);
  }

  const banRow: TelegramBot.InlineKeyboardButton[] = [];
  if (info.isOwner) {
    banRow.push(banned
      ? { text: "✅ Lifting the ban", callback_data: `adm:u:unban:${u.id}` }
      : { text: "🚫 Block user", callback_data: `adm:u:ban:${u.id}` }
    );
  } else if (hasPerm(info, "canUnban") && banned) {
    banRow.push({ text: "✅ Lifting the ban", callback_data: `adm:u:unban:${u.id}` });
  }

  if (hasPerm(info, "canWarn")) {
    banRow.push({ text: "⚠️ Warning", callback_data: `adm:u:warn:${u.id}` });
  }
  if (banRow.length) rows.push(banRow);

  if (info.isOwner) {
    rows.push([{ text: "🔄 Re-verify", callback_data: `adm:u:resetv:${u.id}` }]);
  }

  if (info.isOwner) {
    rows.push([{ text: "👥 His referrals list", callback_data: `adm:u:refs:${u.id}:0` }]);
  }
  rows.push([{ text: "◀️ Back to users", callback_data: "adm:users" }]);

  return bot.sendMessage(chatId, infoText, { parse_mode: "HTML", reply_markup: { inline_keyboard: rows } });
}

// ─────────────────────────── USER REFERRALS ───────────────────────────

async function showUserReferrals(
  bot: TelegramBot,
  chatId: number,
  targetUserId: number,
  page: number,
  msgId?: number,
) {
  const PAGE = 10;

  const [totalRow] = await db
    .select({ c: count() })
    .from(usersTable)
    .where(eq(usersTable.referredBy, targetUserId));
  const total = Number(totalRow?.c ?? 0);

  const referred = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      username: usersTable.username,
      isBlockedForLeaving: usersTable.isBlockedForLeaving,
    })
    .from(usersTable)
    .where(eq(usersTable.referredBy, targetUserId))
    .orderBy(desc(usersTable.createdAt))
    .limit(PAGE)
    .offset(page * PAGE);

  // Fetch referral records for this batch
  const ids = referred.map((r) => r.id);
  const refRecords = ids.length > 0
    ? await db
        .select({ referredId: referralsTable.referredId, status: referralsTable.status })
        .from(referralsTable)
        .where(and(
          eq(referralsTable.referrerId, targetUserId),
          inArray(referralsTable.referredId, ids),
        ))
    : [];
  const refMap = new Map(refRecords.map((r) => [r.referredId, r.status]));

  // Count summary
  let validCount = 0, warnCount = 0, removedCount = 0;

  let text = `👥 <b>User referrals ${targetUserId}</b>\n`;
  text += `Total: <b>${total}</b> | Page ${page + 1}\n\n`;

  if (referred.length === 0) {
    text += "No referrals yet.";
  } else {
    for (const r of referred) {
      const name = esc(`${r.firstName || "—"} ${r.username ? `@${r.username}` : ""}`.trim());
      const recStatus = refMap.get(r.id);
      let icon: string;
      if (recStatus === "removed") {
        icon = "❌"; removedCount++;
      } else if (r.isBlockedForLeaving) {
        icon = "⚠️"; warnCount++;
      } else {
        icon = "✅"; validCount++;
      }
      text += `${icon} ${name} (${r.id})\n`;
    }
    text += `\n✅ Active: <b>${validCount}</b> | ⚠️ Output: <b>${warnCount}</b> | ❌ Discount: <b>${removedCount}</b>`;
  }

  const nav: TelegramBot.InlineKeyboardButton[] = [];
  if (page > 0) nav.push({ text: "◀️ Previous", callback_data: `adm:u:refs:${targetUserId}:${page - 1}` });
  if ((page + 1) * PAGE < total) nav.push({ text: "Next ▶️", callback_data: `adm:u:refs:${targetUserId}:${page + 1}` });

  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      ...(nav.length ? [nav] : []),
      [{ text: "◀️ Back to the user", callback_data: `adm:u:v:${targetUserId}` }],
    ],
  };

  await editOrSend(bot, chatId, text, keyboard, msgId);
}

// ─────────────────────────── WITHDRAWALS ───────────────────────────

async function showWithdrawalsMenu(bot: TelegramBot, chatId: number, messageId?: number, tab: "pending" | "all" = "pending") {
  const statusIcon = (s: string) => s === "pending" ? "⏳" : s === "approved" ? "✅" : "❌";
  if (tab === "all") {
    const all = await db.select().from(withdrawalsTable).orderBy(desc(withdrawalsTable.createdAt)).limit(15);
    let text = `📋 All withdrawals (latest ${all.length})\n\n`;
    if (all.length === 0) text += "There are no withdrawals yet.";
    else all.forEach((w) => { text += `${statusIcon(w.status)} #${w.id} — ${parseFloat(w.amount).toFixed(3)} TON — ID: ${w.userId}\n`; });
    const keyboard: TelegramBot.InlineKeyboardMarkup = {
      inline_keyboard: [
        ...all.map((w) => [{ text: `${statusIcon(w.status)} #${w.id} — ${parseFloat(w.amount).toFixed(2)} TON`, callback_data: `adm:wd:v:${w.id}` }]),
        [{ text: "⏳ outstanding", callback_data: "adm:wd" }, { text: "📋 All ✓", callback_data: "adm:wd:all" }],
        [{ text: "◀️ Back", callback_data: "adm:main" }],
      ],
    };
    await editOrSend(bot, chatId, text, keyboard, messageId);
  } else {
    const pending = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.status, "pending")).orderBy(desc(withdrawalsTable.createdAt)).limit(10);
    const [allRes] = await db.select({ c: count() }).from(withdrawalsTable);
    let text = `💸 <b>Pending Withdrawal Requests</b>\nPending: ${pending.length} | Total: ${allRes?.c ?? 0}\n\n`;
    if (pending.length === 0) text += "There are no pending orders.";
    const keyboard: TelegramBot.InlineKeyboardMarkup = {
      inline_keyboard: [
        ...pending.map((w) => [{ text: `⏳ #${w.id} — ${parseFloat(w.amount).toFixed(2)} TON (${w.userId})`, callback_data: `adm:wd:v:${w.id}` }]),
        [{ text: "⏳Outstanding✓", callback_data: "adm:wd" }, { text: "📋 All", callback_data: "adm:wd:all" }],
        [{ text: "◀️ Back", callback_data: "adm:main" }],
      ],
    };
    await editOrSend(bot, chatId, text, keyboard, messageId);
  }
}

// ─────────────────────────── SETTINGS ───────────────────────────

async function showSettingsMenu(bot: TelegramBot, chatId: number, messageId?: number) {
  const [mode, chRaw, rawRef, rawTask, rawMin] = await Promise.all([
    getSetting("withdraw_mode"),
    getSetting("required_channels"),
    getSetting("referral_threshold"),
    getSetting("task_threshold"),
    getSetting("min_withdrawal"),
  ]);
  const modeLabel = (mode || "manual") === "auto" ? "🟢Automatic" : "🔴 Manual";
  const refThresh  = parseInt(rawRef ?? "5") || 5;
  const taskThresh = parseInt(rawTask ?? "5") || 5;
  const minWd      = parseFloat(rawMin ?? "0.1") || 0.1;

  let chList = "No channels required";
  if (chRaw) {
    try {
      const chs = JSON.parse(chRaw) as { username: string; title: string }[];
      chList = chs.length === 0 ? "No channels required" : chs.map((c, i) => `${i + 1}. ${esc(c.title || `@${c.username}`)}`).join("\n");
    } catch { /* ignore */ }
  }

  const text =
    `⚙️ <b>Bot Settings</b>\n\n` +
    `Current drawing mode: ${modeLabel}\n\n` +
    `<b>Manual</b> ← The owner manually approves each request.\n` +
    `<b>Automatic</b> ← Automatic approval and conversion.\n\n` +
    `👥 <b>Free Course Referrals:</b> ${refThresh}\n` +
    `📋 <b>Tasks for the free course:</b> ${taskThresh}\n` +
    `💸 <b>Minimum Withdrawal:</b> ${minWd.toFixed(2)} TON\n\n` +
    `🔒 <b>Channels required to subscribe:</b>\n${chList}`;

  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: "🔴 Manual", callback_data: "adm:set:mode:manual" }, { text: "🟢Automatic", callback_data: "adm:set:mode:auto" }],
      [{ text: `✏️ Course referrals: ${refThresh}`, callback_data: "adm:set:ref_thresh" }],
      [{ text: `✏️ Course assignments: ${taskThresh}`, callback_data: "adm:set:task_thresh" }],
      [{ text: `✏️ Withdrawal limit: ${minWd.toFixed(2)} TON`, callback_data: "adm:set:min_wd" }],
      [{ text: "🔒 Manage required channels", callback_data: "adm:set:channels" }],
      [{ text: "◀️ Back", callback_data: "adm:main" }],
    ],
  };
  await editOrSend(bot, chatId, text, keyboard, messageId);
}

async function showRequiredChannelsMenu(bot: TelegramBot, chatId: number, messageId?: number) {
  const chRaw = await getSetting("required_channels");
  let channels: { username: string; title: string; inviteLink: string }[] = [];
  if (chRaw) {
    try { channels = JSON.parse(chRaw); } catch { /* ignore */ }
  }
  const listText = channels.length === 0
    ? "No channels required yet."
    : channels.map((c, i) => `${i + 1}. ${esc(c.title || `@${c.username}`)} (@${esc(c.username)})`).join("\n");

  const text =
    `📢 <b>Manage mandatory channels</b>\n\n` +
    `All users (new and old) are <b>obligated</b> to subscribe to these channels to use the bot and mini-app.\n\n` +
    `<b>Current channels:</b>\n${listText}`;

  const channelButtons: TelegramBot.InlineKeyboardButton[][] = channels.map((c, i) => [
    { text: `🗑️ Delete: @${c.username}`, callback_data: `adm:set:ch:del:${i}` },
  ]);

  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      ...channelButtons,
      [{ text: "➕ Add a channel", callback_data: "adm:set:ch:add" }],
      [{ text: "◀️ Back to settings", callback_data: "adm:settings" }],
    ],
  };
  await editOrSend(bot, chatId, text, keyboard, messageId);
}

// ─────────────────────────── BOT CONTROL ───────────────────────────

async function showBotControlMenu(bot: TelegramBot, chatId: number, messageId?: number) {
  const enabled = await isBotEnabled();
  const statusText = enabled ? "🟢 It works normally" : "🔴Stop (maintenance mode)";
  const text =
    `🛠 <b>Bot state control</b>\n\n` +
    `Current status: <b>${statusText}</b>\n\n` +
    (enabled
      ? "To stop the bot click the button below. Users will see a maintenance message and only you will still have access."
      : "The bot is currently <b>discontinued</b>. Users cannot access. Click to turn it on.");
  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      enabled
        ? [{ text: "🔴Stop the bot (maintenance mode)", callback_data: "adm:botctrl:off" }]
        : [{ text: "🟢 Run the bot", callback_data: "adm:botctrl:on" }],
      [{ text: "◀️ Back", callback_data: "adm:main" }],
    ],
  };
  await editOrSend(bot, chatId, text, keyboard, messageId);
}

// ─────────────────────────── STATS ───────────────────────────

async function showStats(bot: TelegramBot, chatId: number, messageId?: number) {
  const [users] = await db.select({ c: count() }).from(usersTable);
  const [pending] = await db.select({ c: count() }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "pending"));
  const [approved] = await db.select({ c: count() }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "approved"));
  const [tasks] = await db.select({ c: count() }).from(tasksTable).where(eq(tasksTable.isActive, true));
  const [slots] = await db.select({ c: count() }).from(wheelSlotsTable);
  const text =
    `📊 <b>Statistics</b>\n\n` +
    `👥 Users: <b>${users?.c ?? 0}</b>\n` +
    `📋 Active tasks: <b>${tasks?.c ?? 0}</b>\n` +
    `🎡 Wheel slots: <b>${slots?.c ?? 0}</b>\n` +
    `💸 Pending withdrawals: <b>${pending?.c ?? 0}</b>\n` +
    `✅ Approved withdrawals: <b>${approved?.c ?? 0}</b>`;
  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [[{ text: "◀️ Back", callback_data: "adm:main" }]],
  };
  await editOrSend(bot, chatId, text, keyboard, messageId);
}

// ─────────────────────────── ADMINS MANAGEMENT ───────────────────────────

async function showAdminsMenu(bot: TelegramBot, chatId: number, messageId?: number) {
  let admins: (typeof adminsTable.$inferSelect)[] = [];
  try {
    admins = await db.select().from(adminsTable).orderBy(adminsTable.addedAt);
  } catch (err) {
    logger.error({ err }, "Failed to query admins table");
  }

  let text = `👮 <b>Manage admins</b>\n\nNumber of admins: <b>${admins.length}</b>\n\n`;
  if (admins.length === 0) {
    text += "There are no moderators added yet.\n";
  } else {
    for (const a of admins) {
      const name = a.username ? `@${esc(a.username)}` : `ID: ${a.id}`;
      const perms = (a.permissions as AdminPermission[]) ?? [];
      const permsText = perms.length > 0 ? perms.map((p) => PERM_LABELS[p]).join(", ") : "No powers";
      text += `👤 ${name}\n   ↳ ${permsText}\n\n`;
    }
  }

  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: "➕ Add a supervisor", callback_data: "adm:admins:add" }],
      ...admins.map((a) => [
        { text: `✏️ ${a.username ? `@${a.username}` : String(a.id)}`, callback_data: `adm:admins:edit:${a.id}` },
        { text: "🗑️ Delete", callback_data: `adm:admins:del:${a.id}` },
      ]),
      [{ text: "◀️ Back", callback_data: "adm:main" }],
    ],
  };
  await editOrSend(bot, chatId, text, keyboard, messageId);
}

async function showAdminPermsEditor(
  bot: TelegramBot,
  chatId: number,
  targetId: number,
  selectedPerms: AdminPermission[],
  isNew: boolean,
  messageId?: number
) {
  const text = isNew
    ? `👮 <b>Add a new admin</b>\n🆔 ID: <code>${targetId}</code>\n\nChoose permissions, then click Confirm:`
    : `✏️ <b>Modify admin permissions</b>\n🆔 ID: <code>${targetId}</code>\n\nChoose permissions, then click Save:`;

  const confirmData = isNew ? `adm:admins:confirm:${targetId}` : `adm:admins:save:${targetId}`;
  const confirmLabel = isNew ? "✅ Confirm addition" : "💾 Save permissions";

  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      ...ALL_PERMS.map((p) => [
        {
          text: `${selectedPerms.includes(p) ? "✅" : "☐"} ${PERM_LABELS[p]}`,
          callback_data: `adm:admins:tog:${targetId}:${p}:${isNew ? "1" : "0"}`,
        },
      ]),
      [{ text: confirmLabel, callback_data: confirmData }],
      [{ text: "❌ Cancel", callback_data: "adm:admins" }],
    ],
  };
  await editOrSend(bot, chatId, text, keyboard, messageId);
}

// ─────────────────────────── MAIN CALLBACK HANDLER ───────────────────────────

export async function handleAdminCallback(
  bot: TelegramBot,
  q: TelegramBot.CallbackQuery
): Promise<boolean> {
  const data = q.data ?? "";
  if (!data.startsWith("adm:")) return false;

  const chatId = q.message!.chat.id;
  const msgId = q.message!.message_id;
  const userId = q.from.id;
  const username = q.from.username;

  const info = await getAdminInfo(userId, username);
  if (!info) {
    await bot.answerCallbackQuery(q.id, { text: "⛔ Not authorized" });
    return true;
  }
  await bot.answerCallbackQuery(q.id);

  const parts = data.split(":");
  const sec = parts[1];
  const act = parts[2];
  const p1  = parts[3];
  const p2  = parts[4];
  const p3  = parts[5];

  try {
    if (data === "adm:main")     { await showAdminMenu(bot, chatId, msgId, info); return true; }
    if (data === "adm:stats")    { if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; } await showStats(bot, chatId, msgId); return true; }
    if (data === "adm:settings") { if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; } await showSettingsMenu(bot, chatId, msgId); return true; }

    if (data === "adm:channels") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      await showRequiredChannelsMenu(bot, chatId, msgId); return true;
    }

    if (data === "adm:botctrl") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      await showBotControlMenu(bot, chatId, msgId); return true;
    }
    if (data === "adm:botctrl:on" || data === "adm:botctrl:off") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      const enable = data === "adm:botctrl:on";
      await setBotEnabled(enable);
      clearBotEnabledCache();
      await bot.sendMessage(
        chatId,
        enable
          ? "✅ <b>The bot was launched successfully!</b> 🟢\n\nUsers can now access."
          : "🔴 <b>The bot has been stopped!</b>\n\nMaintenance mode is activated. Users will see a maintenance message.",
        { parse_mode: "HTML" }
      );
      await showBotControlMenu(bot, chatId, msgId); return true;
    }

    // ── Control Settings ──
    if (data === "adm:ctrl_settings") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      await showControlSettingsMenu(bot, chatId, msgId); return true;
    }
    if (data === "adm:ctrl:ref") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      const cur = parseInt((await getSetting("referral_threshold")) ?? "5") || 5;
      adminConvState.set(userId, { step: "ctrl_ref", data: { chatId, msgId } });
      await bot.sendMessage(chatId, `🔄 <b>Number of referrals to roll</b>\n\nCurrent value: <b>${cur}</b>\n\nSend new number:`, { parse_mode: "HTML" });
      return true;
    }
    if (data === "adm:ctrl:task") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      const cur = parseInt((await getSetting("task_threshold")) ?? "5") || 5;
      adminConvState.set(userId, { step: "ctrl_task", data: { chatId, msgId } });
      await bot.sendMessage(chatId, `📋 <b>Number of tasks to roll</b>\n\nCurrent value: <b>${cur}</b>\n\nSend new number:`, { parse_mode: "HTML" });
      return true;
    }
    if (data === "adm:ctrl:minwd") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      const cur = parseFloat((await getSetting("min_withdrawal")) ?? "0.1") || 0.1;
      adminConvState.set(userId, { step: "ctrl_minwd", data: { chatId, msgId } });
      await bot.sendMessage(chatId, `💰 <b>Minimum Withdrawal (TON)</b>\n\nCurrent value: <b>${cur.toFixed(2)} TON</b>\n\nSend the new number (example: 0.5):`, { parse_mode: "HTML" });
      return true;
    }

    // ── BOOST ──
    if (data === "adm:boost") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      await showBoostMenu(bot, chatId, msgId); return true;
    }
    if (data.startsWith("adm:boost:set:")) {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      const multiplier = parseInt(data.split(":")[3]);
      if (isNaN(multiplier) || multiplier < 2 || multiplier > 5) { await bot.answerCallbackQuery(q.id, { text: "❌ Invalid value" }); return true; }
      await showBoostDurationMenu(bot, chatId, multiplier, msgId); return true;
    }
    if (data.startsWith("adm:boost:dur:")) {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      const boostParts = data.split(":");
      const multiplier = parseInt(boostParts[3]);
      const durHours = parseInt(boostParts[4]);
      if (isNaN(multiplier) || multiplier < 2 || multiplier > 5) { await bot.answerCallbackQuery(q.id, { text: "❌ Invalid value" }); return true; }
      await db.insert(botSettingsTable).values({ key: "spin_power", value: String(multiplier) })
        .onConflictDoUpdate({ target: botSettingsTable.key, set: { value: String(multiplier) } });
      await db.delete(botSettingsTable).where(eq(botSettingsTable.key, "boost_starts_at")).catch(() => {});
      if (durHours > 0) {
        const endsAt = new Date(Date.now() + durHours * 3_600_000).toISOString();
        await db.insert(botSettingsTable).values({ key: "boost_ends_at", value: endsAt })
          .onConflictDoUpdate({ target: botSettingsTable.key, set: { value: endsAt } });
        await bot.sendMessage(chatId,
          `⚡ <b>BOOST is activated!</b>\nEvery profit will be multiplied by <b>×${multiplier}</b>\nIt automatically expires after <b>${durHours} hours</b>.`,
          { parse_mode: "HTML" }
        );
      } else {
        await db.delete(botSettingsTable).where(eq(botSettingsTable.key, "boost_ends_at")).catch(() => {});
        await bot.sendMessage(chatId,
          `⚡ <b>BOOST is enabled — for life!</b>\nEvery win will be multiplied by <b>×${multiplier}</b>\nIt does not expire until you manually stop it.`,
          { parse_mode: "HTML" }
        );
      }
      await showBoostMenu(bot, chatId, msgId); return true;
    }
    if (data === "adm:boost:off") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      await db.insert(botSettingsTable).values({ key: "spin_power", value: "1" })
        .onConflictDoUpdate({ target: botSettingsTable.key, set: { value: "1" } });
      await db.delete(botSettingsTable).where(eq(botSettingsTable.key, "boost_starts_at")).catch(() => {});
      await db.delete(botSettingsTable).where(eq(botSettingsTable.key, "boost_ends_at")).catch(() => {});
      await bot.sendMessage(chatId, "🔴 <b>BOOST has been stopped.</b>", { parse_mode: "HTML" });
      await showBoostMenu(bot, chatId, msgId); return true;
    }

    if (data === "adm:mining" || data === "adm:wheel") {
      if (!info.isOwner && !hasPerm(info, "canEditWheel")) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      await showMiningMenu(bot, chatId, msgId); return true;
    }
    if (data === "adm:tasks") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      await showTasksMenu(bot, chatId, msgId); return true;
    }
    if (data === "adm:users") {
      if (!info.isOwner && !hasPerm(info, "canUnban") && !hasPerm(info, "canWarn")) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      await showUsersMenu(bot, chatId, msgId); return true;
    }
    if (data === "adm:wd") {
      if (!info.isOwner && !hasPerm(info, "canReceiveWithdrawals")) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      await showWithdrawalsMenu(bot, chatId, msgId, "pending"); return true;
    }
    if (data === "adm:wd:all") {
      if (!info.isOwner && !hasPerm(info, "canReceiveWithdrawals")) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      await showWithdrawalsMenu(bot, chatId, msgId, "all"); return true;
    }
    if (data === "adm:admins") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      await showAdminsMenu(bot, chatId, msgId); return true;
    }

    // ── Mining settings ──
    if (sec === "m") {
      if (!info.isOwner && !hasPerm(info, "canEditWheel")) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      if (act === "rate") {
        adminConvState.set(userId, { step: "mining_rate", data: { chatId, msgId } });
        await bot.sendMessage(chatId, "⚡ <b>Edit Daily Mining Percentage</b>\n\nEnter the new percentage (example: <code>3</code> for 3% or <code>5</code> for 5%):", { parse_mode: "HTML" });
      } else if (act === "airdrop") {
        adminConvState.set(userId, { step: "mining_airdrop", data: { chatId, msgId } });
        await bot.sendMessage(chatId, "🪙 <b>Distribute Go coins to all users</b>\n\nEnter the number of Go coins to be added to each user (example: <code>10</code>):", { parse_mode: "HTML" });
      }
      return true;
    }

    // ── Tasks (owner only) ──
    if (sec === "t") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }

      if (act === "v" && p1) {
        const [t] = await db.select().from(tasksTable).where(eq(tasksTable.id, parseInt(p1))).limit(1);
        if (t) {
          await bot.editMessageText(
            `📋 Task #${t.id}\n\n${esc(t.icon || "⭐")} ${esc(t.title)}\nDescription: ${esc(t.description || "—")}\nLink: ${esc(t.url || "—")}\nStatus: ${t.isActive ? "✅ Active" : "❌ Disabled"}`,
            { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [
              [{ text: t.isActive ? "❌ Disable" : "✅ Activate", callback_data: `adm:t:tog:${t.id}` }, { text: "🗑️ Delete", callback_data: `adm:t:del:${t.id}` }],
              [{ text: "◀️ Back to tasks", callback_data: "adm:tasks" }],
            ]}}
          );
        }
      } else if (act === "tog" && p1) {
        const [t] = await db.select().from(tasksTable).where(eq(tasksTable.id, parseInt(p1))).limit(1);
        if (t) await db.update(tasksTable).set({ isActive: !t.isActive }).where(eq(tasksTable.id, parseInt(p1)));
        await showTasksMenu(bot, chatId, msgId);
      } else if (act === "del" && p1) {
        await db.delete(tasksTable).where(eq(tasksTable.id, parseInt(p1)));
        await showTasksMenu(bot, chatId, msgId);
      } else if (act === "add") {
        await setAdminState(userId, "admin_task_category", { chatId, messageId: msgId });
        await bot.sendMessage(chatId, "📌 <b>Choose the task type:</b>", {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🤖 Bot mission", callback_data: "adm_task_cat:bot" }],
              [{ text: "📢 Channel mission", callback_data: "adm_task_cat:channel" }],
              [{ text: "❌ Cancel", callback_data: "adm:tasks" }]
            ]
          }
        });
      } else if (act === "dur" && p1) {
        // Task duration selected — complete the task insertion
        const state = adminConvState.get(userId);
        if (!state || state.step !== "task_duration") { return true; }
        const durHours = parseInt(p1);
        const { title, description, url, icon, channelPhotoUrl } = state.data as {
          title: string; description: string | null; url: string | null;
          icon: string; channelPhotoUrl: string | null;
        };
        const expiresAt = durHours > 0 ? new Date(Date.now() + durHours * 3_600_000) : null;
        await db.insert(tasksTable).values({ title, description, url, icon, channelPhotoUrl, isActive: true, expiresAt });
        adminConvState.delete(userId);
        const durLabel = durHours === 24 ? "24 hours" : durHours === 48 ? "48 hours" : "lifelong";
        await bot.sendMessage(chatId,
          `✅ Task added: <b>${esc(title)}</b>\nDuration: <b>${durLabel}</b>${channelPhotoUrl ? " — 🖼 with photo" : ""}`,
          { parse_mode: "HTML" }
        );
        const tmp = await bot.sendMessage(chatId, "Loading...");
        await showTasksMenu(bot, chatId, tmp.message_id);
      }
      return true;
    }

    // ── Users ──
    if (sec === "u") {
      if (!info.isOwner && !hasPerm(info, "canUnban") && !hasPerm(info, "canWarn")) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }

      if (act === "search") {
        adminConvState.set(userId, { step: "user_search", data: {} });
        await bot.sendMessage(chatId, "🔍 Enter <b>Telegram ID</b> or <b>@UserName</b>:", { parse_mode: "HTML" });
      } else if (act === "addbal" && p1) {
        if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
        adminConvState.set(userId, { step: "user_addbal", data: { targetId: parseInt(p1) } });
        await bot.sendMessage(chatId, `💰 How much do you want to <b>add</b> to the user's balance ${p1}?\n(Example: 5 or 0.5)`, { parse_mode: "HTML" });
      } else if (act === "subbal" && p1) {
        if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
        adminConvState.set(userId, { step: "user_subbal", data: { targetId: parseInt(p1) } });
        await bot.sendMessage(chatId, `💸 How much do you want to <b>deduct</b> from the user's balance ${p1}?`, { parse_mode: "HTML" });
      } else if (act === "bal" && p1) {
        if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
        adminConvState.set(userId, { step: "user_balance", data: { targetId: parseInt(p1) } });
        await bot.sendMessage(chatId, `✏️ Enter the new balance for user ${p1}:`, { parse_mode: "HTML" });
      } else if (act === "spins" && p1) {
        if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
        adminConvState.set(userId, { step: "user_spins", data: { targetId: parseInt(p1) } });
        await bot.sendMessage(chatId, `🎰 Enter the spins for the user ${p1}\n(example: 10, +5, or -2)`, { parse_mode: "HTML" });
      } else if (act === "ban" && p1) {
        if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
        const targetId = parseInt(p1);
        await db.update(usersTable).set({ isVisible: false }).where(eq(usersTable.id, targetId));
        try { await bot.sendMessage(targetId, "🚫 Your account has been blocked. Contact support for more information."); } catch { /**/ }
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
        await bot.sendMessage(chatId, `🚫 User ${esc(u?.firstName || String(targetId))} (${targetId}) has been blocked.`);
      } else if (act === "unban" && p1) {
        if (!info.isOwner && !hasPerm(info, "canUnban")) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
        const targetId = parseInt(p1);
        await db.update(usersTable).set({
          isVisible: true,
          isBlockedForLeaving: false,
          ipVerifiedAt: new Date(),
          verificationToken: null,
        }).where(eq(usersTable.id, targetId));
        try { await bot.sendMessage(targetId, "✅ Your account has been banned. You can use now! 🎉"); } catch { /**/ }
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
        await bot.sendMessage(chatId, `✅ User ${esc(u?.firstName || String(targetId))} (${targetId}) has been unblocked — he can use directly without re-verification.`);
      } else if (act === "warn" && p1) {
        if (!info.isOwner && !hasPerm(info, "canWarn")) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
        adminConvState.set(userId, { step: "user_warn", data: { targetId: parseInt(p1) } });
        await bot.sendMessage(chatId, "⚠️ Enter the warning text that will be sent to the user:");
      } else if (act === "resetv" && p1) {
        if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
        const targetId = parseInt(p1);
        await db.update(usersTable).set({ ipVerifiedAt: null, deviceId: null, verificationToken: null }).where(eq(usersTable.id, targetId));
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
        await bot.sendMessage(chatId, `🔄 User ${esc(u?.firstName || String(targetId))} (${targetId}) has been re-verified.`);
      } else if (act === "v" && p1) {
        // View user card (used as back-button from referral list)
        if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, parseInt(p1))).limit(1);
        if (u) await showUserCard(bot, chatId, u, info);
      } else if (act === "refs" && p1) {
        // Referral list with pagination: adm:u:refs:{targetId}:{page}
        if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
        const targetId = parseInt(p1);
        const page = p2 !== undefined ? Math.max(0, parseInt(p2)) : 0;
        await showUserReferrals(bot, chatId, targetId, isNaN(page) ? 0 : page, msgId);
      }
      return true;
    }

    // ── Withdrawals ──
    if (sec === "wd") {
      if (!info.isOwner && !hasPerm(info, "canReceiveWithdrawals")) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      if (act === "v" && p1) {
        const [w] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, parseInt(p1))).limit(1);
        if (w) {
          const [u] = await db.select().from(usersTable).where(eq(usersTable.id, w.userId)).limit(1);
          await bot.editMessageText(
            `💸 <b>Withdrawal Request #${w.id}</b>\n\n👤 ${esc(u?.firstName || "—")} @${esc(u?.username || "—")}\n🆔 ${w.userId}\n💰 <b>${parseFloat(w.amount).toFixed(4)} TON</b>\n📍 <code>${esc(w.walletAddress)}</code>\nStatus: <b>${w.status}</b>`,
            {
              chat_id: chatId, message_id: msgId, parse_mode: "HTML",
              reply_markup: { inline_keyboard: [
                [{ text: "✅ Agree", callback_data: `withdraw_approve_${w.id}` }, { text: "❌ He refused", callback_data: `withdraw_reject_${w.id}` }],
                [{ text: "◀️ Back", callback_data: "adm:wd" }],
              ]},
            }
          );
        }
      }
      return true;
    }

    // ── Settings (owner only) ──
    if (sec === "set") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }
      if (act === "mode" && p1) { await setSetting("withdraw_mode", p1); await showSettingsMenu(bot, chatId, msgId); return true; }

      if (act === "ref_thresh") {
        const cur = parseInt((await getSetting("referral_threshold")) ?? "5") || 5;
        adminConvState.set(userId, { step: "set_ref_threshold", data: { chatId, msgId } });
        await bot.sendMessage(chatId, `👥 <b>Number of Referrals for Free Course</b>\n\nCurrent value: <b>${cur}</b>\n\nEnter new value (number between 1 and 100):\n\n/cancel to cancel`, { parse_mode: "HTML" });
        return true;
      }
      if (act === "task_thresh") {
        const cur = parseInt((await getSetting("task_threshold")) ?? "5") || 5;
        adminConvState.set(userId, { step: "set_task_threshold", data: { chatId, msgId } });
        await bot.sendMessage(chatId, `📋 <b>Number of tasks for free spin</b>\n\nCurrent value: <b>${cur}</b>\n\nEnter new value (number between 1 and 100):\n\n/cancel to cancel`, { parse_mode: "HTML" });
        return true;
      }
      if (act === "min_wd") {
        const cur = parseFloat((await getSetting("min_withdrawal")) ?? "0.1") || 0.1;
        adminConvState.set(userId, { step: "set_min_withdrawal", data: { chatId, msgId } });
        await bot.sendMessage(chatId, `💸 <b>Minimum Withdrawal (TON)</b>\n\nCurrent value: <b>${cur.toFixed(2)} TON</b>\n\nEnter new value (example: 0.5):\n\n/cancel to cancel`, { parse_mode: "HTML" });
        return true;
      }

      if (act === "channels") { await showRequiredChannelsMenu(bot, chatId, msgId); return true; }

      if (act === "ch") {
        if (p1 === "add") {
          adminConvState.set(userId, { step: "ch_add_username", data: {} });
          await bot.sendMessage(chatId, "📢 <b>Add a required channel</b>\n\nEnter your @username channel:", { parse_mode: "HTML" });
          return true;
        }
        if (p1 === "del" && p2 !== undefined) {
          const idx = parseInt(p2);
          const chRaw = await getSetting("required_channels");
          let channels: { username: string; title: string; inviteLink: string }[] = [];
          try { channels = JSON.parse(chRaw ?? "[]"); } catch { /* ignore */ }
          channels.splice(idx, 1);
          await setSetting("required_channels", JSON.stringify(channels));
          clearAllSubCache();
          await showRequiredChannelsMenu(bot, chatId, msgId);
          return true;
        }
      }
      return true;
    }

    // ── Admins management (owner only) ──
    if (sec === "admins") {
      if (!info.isOwner) { await bot.sendMessage(chatId, "⛔ You do not have permission"); return true; }

      if (act === "add") {
        adminConvState.set(userId, { step: "admin_add_id", data: { selectedPerms: [] } });
        await bot.sendMessage(chatId, "👮 <b>Add a new admin</b>\n\nEnter <b>@username</b> or <b>Telegram ID</b> for the user:", { parse_mode: "HTML" });
      } else if (act === "edit" && p1) {
        const targetId = parseInt(p1);
        const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.id, targetId)).limit(1);
        if (admin) {
          const perms = (admin.permissions as AdminPermission[]) ?? [];
          adminConvState.set(userId, { step: "admin_edit_perms", data: { targetId, selectedPerms: [...perms] } });
          await showAdminPermsEditor(bot, chatId, targetId, perms, false, msgId);
        }
      } else if (act === "del" && p1) {
        await db.delete(adminsTable).where(eq(adminsTable.id, parseInt(p1)));
        await showAdminsMenu(bot, chatId, msgId);
      } else if (act === "tog" && p1 && p2) {
        const targetId = parseInt(p1);
        const perm = p2 as AdminPermission;
        const isNew = p3 === "1";
        const state = adminConvState.get(userId);
        const currentPerms: AdminPermission[] = (state?.data?.selectedPerms as AdminPermission[]) ?? [];
        const newPerms = currentPerms.includes(perm) ? currentPerms.filter((x) => x !== perm) : [...currentPerms, perm];
        adminConvState.set(userId, { step: state?.step ?? (isNew ? "admin_add_perms" : "admin_edit_perms"), data: { ...(state?.data ?? {}), targetId, selectedPerms: newPerms } });
        await showAdminPermsEditor(bot, chatId, targetId, newPerms, isNew, msgId);
      } else if (act === "save" && p1) {
        const targetId = parseInt(p1);
        const state = adminConvState.get(userId);
        const perms: AdminPermission[] = (state?.data?.selectedPerms as AdminPermission[]) ?? [];
        adminConvState.delete(userId);
        await db.update(adminsTable).set({ permissions: perms }).where(eq(adminsTable.id, targetId));
        await showAdminsMenu(bot, chatId, msgId);
      } else if (act === "confirm" && p1) {
        const targetId = parseInt(p1);
        const state = adminConvState.get(userId);
        const perms: AdminPermission[] = (state?.data?.selectedPerms as AdminPermission[]) ?? [];
        adminConvState.delete(userId);

        let tgUsername: string | null = null;
        try {
          const rows = await db.select({ username: usersTable.username })
            .from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
          tgUsername = rows[0]?.username ?? null;
        } catch { /* ignore */ }

        const permsJson = JSON.stringify(perms);
        await db.execute(sql`
          INSERT INTO admins (id, username, permissions)
          VALUES (${targetId}, ${tgUsername}, ${permsJson}::jsonb)
          ON CONFLICT (id) DO UPDATE
            SET username = EXCLUDED.username,
                permissions = EXCLUDED.permissions
        `);

        const permsLines = perms.length > 0
          ? perms.map((p) => "  - " + PERM_LABELS[p]).join("\n")
          : "-No powers";
        const nameStr = tgUsername ? ` (@${esc(tgUsername)})` : "";
        await bot.sendMessage(
          chatId,
          `Supervisor added successfully!\n\nID: ${targetId}${nameStr}\n\nPermissions:\n${permsLines}`,
        );
        const tmp = await bot.sendMessage(chatId, "...");
        await showAdminsMenu(bot, chatId, tmp.message_id);
      }
      return true;
    }

  } catch (err) {
    logger.error({ err }, "Admin callback error");
    const errDetail = err instanceof Error ? err.message.slice(0, 150) : String(err).slice(0, 150);
    try { await bot.sendMessage(chatId, `❌ Error: ${esc(errDetail)}`); } catch { /**/ }
  }

  return true;
}

// ─────────────────────────── PHOTO HANDLER ───────────────────────────

export async function handleAdminPhoto(bot: TelegramBot, msg: TelegramBot.Message): Promise<boolean> {
  const userId = msg.from!.id;
  const state = adminConvState.get(userId);
  if (!state || state.step !== "task_icon") return false;
  if (!msg.photo || msg.photo.length === 0) return false;

  const chatId = msg.chat.id;
  try {
    const photo = msg.photo[msg.photo.length - 1];
    const file = await bot.getFile(photo.file_id);
    const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
    const channelPhotoUrl = file.file_path ? `https://api.telegram.org/file/bot${token}/${file.file_path}` : null;
    const { title, description, url } = state.data as { title: string; description: string | null; url: string | null };
    adminConvState.set(userId, { step: "task_duration", data: { title, description, url, icon: "⭐", channelPhotoUrl } });
    await bot.sendMessage(chatId,
      `✅ The image has been uploaded 🖼\n\n⏳ <b>Choose the duration of the task:</b>`,
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [
          [
            { text: "⏱ 24 hours", callback_data: "adm:t:dur:24" },
            { text: "⏱ 48 hours", callback_data: "adm:t:dur:48" },
            { text: "♾ For life", callback_data: "adm:t:dur:0" },
          ],
        ]},
      }
    );
  } catch (err) {
    logger.error({ err }, "handleAdminPhoto error");
    await bot.sendMessage(chatId, "❌ Failed to upload the image, please try again.");
  }
  return true;
}

// ─────────────────────────── TEXT HANDLER ───────────────────────────

export async function handleAdminText(bot: TelegramBot, msg: TelegramBot.Message): Promise<boolean> {
  const userId = msg.from!.id;
  const state = adminConvState.get(userId);
  if (!state) return false;

  const text = msg.text?.trim() ?? "";
  const chatId = msg.chat.id;
  const clearState = () => adminConvState.delete(userId);
  const send = (t: string, opts: TelegramBot.SendMessageOptions = {}) => bot.sendMessage(chatId, t, { ...opts });

  try {
    // ── Mining settings ──
    if (state.step === "mining_rate") {
      const pct = parseFloat(text);
      if (isNaN(pct) || pct <= 0 || pct > 100) { await send("❌ Enter a whole number between 0.1 and 100"); return true; }
      const decimalRate = (pct / 100).toFixed(6);
      await setSetting("default_mining_rate", decimalRate);
      await db.update(usersTable).set({ miningRate: decimalRate });
      clearState();
      await send(`✅ Mining percentage for all users has been updated to <b>${pct}% daily</b>`, { parse_mode: "HTML" });
      const tmp = await send("Loading...");
      await showMiningMenu(bot, chatId, tmp.message_id);
      return true;
    }
    if (state.step === "mining_airdrop") {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) { await send("❌ Enter an integer greater than 0"); return true; }
      // Get all users
      const allUsers = await db.select({ id: usersTable.id }).from(usersTable);
      for (const u of allUsers) {
        await addGoBalanceAndClaim(db, u.id, amount);
      }
      clearState();
      await send(`🎉 <b>${amount} Go has been successfully distributed to all users!</b>`, { parse_mode: "HTML" });
      const tmp = await send("Loading...");
      await showMiningMenu(bot, chatId, tmp.message_id);
      return true;
    }

    // ── Task flow ──
    if (state.step === "task_title") {
      adminConvState.set(userId, { step: "task_desc", data: { ...state.data, title: text } });
      await send("📝 Enter <b>task description</b> (or - to skip):", { parse_mode: "HTML" });
      return true;
    }
    if (state.step === "task_desc") {
      adminConvState.set(userId, { step: "task_url", data: { ...state.data, description: text === "-" ? null : text } });
      await send("🔗 Enter <b>task link</b> (example: https://t.me/...) or -:", { parse_mode: "HTML" });
      return true;
    }
    if (state.step === "task_url") {
      adminConvState.set(userId, { step: "task_icon", data: { ...state.data, url: text === "-" ? null : text } });
      await send("🖼 Send <b>channel art</b> (or <b>emoji</b> or - to skip):", { parse_mode: "HTML" });
      return true;
    }
    if (state.step === "task_icon") {
      const { title, description, url } = state.data as { title: string; description: string | null; url: string | null };
      const icon = text === "-" ? "⭐" : text;
      let channelPhotoUrl: string | null = null;
      if (url) { const m = url.match(/t\.me\/([A-Za-z0-9_]+)/); if (m) { try { channelPhotoUrl = await getChannelPhotoUrl(bot, m[1]); } catch { /**/ } } }
      adminConvState.set(userId, { step: "task_duration", data: { title, description, url, icon, channelPhotoUrl } });
      await bot.sendMessage(chatId,
        `✅ The icon has been set.\n\n⏳ <b>Choose the task duration:</b>`,
        {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [
            [
              { text: "⏱ 24 hours", callback_data: "adm:t:dur:24" },
              { text: "⏱ 48 hours", callback_data: "adm:t:dur:48" },
              { text: "♾ For life", callback_data: "adm:t:dur:0" },
            ],
          ]},
        }
      );
      return true;
    }

    // ── User search ──
    if (state.step === "user_search") {
      const info = await getAdminInfo(userId, msg.from?.username);
      if (!info) { clearState(); return false; }
      let u: typeof usersTable.$inferSelect | undefined;
      if (text.startsWith("@")) {
        const uname = text.slice(1);
        u = (await db.select().from(usersTable).where(ilike(usersTable.username, uname)).limit(1))[0];
      } else {
        const targetId = parseInt(text);
        if (isNaN(targetId)) { await send("❌ Enter a valid digital ID or @UserName"); return true; }
        u = (await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1))[0];
      }
      clearState();
      if (!u) { await send("❌ No user with this ID was found"); return true; }
      await showUserCard(bot, chatId, u, info);
      return true;
    }

    // ── User warn ──
    if (state.step === "user_warn") {
      const { targetId } = state.data as { targetId: number };
      clearState();
      try { await bot.sendMessage(targetId, `⚠️ <b>Warning from administration:</b>\n\n${esc(text)}`, { parse_mode: "HTML" }); } catch { /**/ }
      await send(`✅ The warning was sent to user ${targetId}.`);
      return true;
    }

    // ── Go & Gram Balances (owner only) ──
    if (state.step === "user_addbal") {
      const { targetId } = state.data as { targetId: number };
      clearState();
      const val = parseFloat(text);
      if (isNaN(val) || val <= 0) { await send("❌ Enter a valid positive value"); return true; }

      await addGoBalanceAndClaim(db, targetId, val);

      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
      const newGo = parseFloat(u.goBalance || u.balance || "0").toFixed(2);
      await send(`✅ Added <b>${val} Go</b> for user ${targetId}\nNew Go Balance: <b>${newGo} Go</b>`, { parse_mode: "HTML" });
      try { await bot.sendMessage(targetId, `🪙 <b>${val} Go</b> coin has been added to your account!\nYour current balance: <b>${newGo} Go</b> (active mining 3% daily ⛏️)`, { parse_mode: "HTML" }); } catch { /**/ }
      return true;
    }
    if (state.step === "user_subbal") {
      const { targetId } = state.data as { targetId: number };
      clearState();
      const val = parseFloat(text);
      if (isNaN(val) || val <= 0) { await send("❌ Enter a valid positive value"); return true; }

      await addGoBalanceAndClaim(db, targetId, -val);

      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
      const newGo = parseFloat(u.goBalance || u.balance || "0").toFixed(2);
      await send(`✅ <b>${val} Go</b> has been debited from user ${targetId}\nNew Go Balance: <b>${newGo} Go</b>`, { parse_mode: "HTML" });
      try { await bot.sendMessage(targetId, `📉 <b>${val} Go</b> has been deducted from your balance.\nYour current balance: <b>${newGo} Go</b>`, { parse_mode: "HTML" }); } catch { /**/ }
      return true;
    }
    if (state.step === "user_balance") {
      const { targetId } = state.data as { targetId: number };
      clearState();
      const val = parseFloat(text);
      if (isNaN(val) || val < 0) { await send("❌ Enter an integer value (0 or greater)"); return true; }

      const [uPre] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
      const currentGo = parseFloat(uPre?.goBalance || uPre?.balance || "0");
      await addGoBalanceAndClaim(db, targetId, val - currentGo);

      await send(`✅ User ${targetId}'s Go balance has been set to <b>${val} Go</b>`, { parse_mode: "HTML" });
      try { await bot.sendMessage(targetId, `🪙Go balance updated to <b>${val} Go</b>`, { parse_mode: "HTML" }); } catch { /**/ }
      return true;
    }
    if (state.step === "user_spins") {
      const { targetId } = state.data as { targetId: number };
      clearState();
      const isRelative = text.startsWith("+") || text.startsWith("-");
      const val = parseFloat(text);
      if (isNaN(val)) { await send("❌ Invalid value"); return true; }
      if (isRelative) {
        await db.update(usersTable).set({ gramBalance: sql`GREATEST(gram_balance + ${val}, 0)` }).where(eq(usersTable.id, targetId));
      } else {
        if (val < 0) { await send("❌ Enter a non-negative number"); return true; }
        await db.update(usersTable).set({ gramBalance: String(val) }).where(eq(usersTable.id, targetId));
      }
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
      const newGram = parseFloat(u.gramBalance || "0").toFixed(4);
      await send(`✅ New Gram Balance for User ${targetId}: <b>${newGram} Gram</b>`, { parse_mode: "HTML" });
      try { await bot.sendMessage(targetId, `💎 Your Gram balance has been updated to: <b>${newGram} Gram</b>`, { parse_mode: "HTML" }); } catch { /**/ }
      return true;
    }

    // ── Required channel: add username ──
    if (state.step === "ch_add_username") {
      const username = text.replace(/^@/, "").trim();
      if (!username) { await send("❌ Username is incorrect"); return true; }
      adminConvState.set(userId, { step: "ch_add_title", data: { username } });
      await send(`✅ Channel: @${esc(username)}\nEnter <b>channel name</b> to display (or - to use @${esc(username)}):`, { parse_mode: "HTML" });
      return true;
    }
    if (state.step === "ch_add_title") {
      const { username } = state.data as { username: string };
      const title = text === "-" ? `@${username}` : text.trim();
      adminConvState.set(userId, { step: "ch_add_link", data: { username, title } });
      await send(`✅ Name: ${esc(title)} Enter <b>invitation link</b> for the channel (https://t.me/...) or - to use the public link:`, { parse_mode: "HTML" });
      return true;
    }
    if (state.step === "ch_add_link") {
      const { username, title } = state.data as { username: string; title: string };
      const inviteLink = text === "-" ? `https://t.me/${username}` : text.trim();
      clearState();
      const chRaw = await getSetting("required_channels");
      let channels: { username: string; title: string; inviteLink: string }[] = [];
      try { channels = JSON.parse(chRaw ?? "[]"); } catch { /* ignore */ }

      let verifyNote = "";
      try {
        const botInfo = await bot.getMe();
        const member = await bot.getChatMember(`@${username}`, botInfo.id);
        if (!["administrator", "creator"].includes(member.status)) {
          verifyNote = `\n\n⚠️ <b>Note:</b> The bot is not a moderator of the channel. Make him a moderator to ensure the subscription check is working properly.`;
        }
      } catch {
        verifyNote = `\n\n⚠️ <b>Note:</b> The channel could not be verified. Make sure the bot is a member or moderator of @${esc(username)}.`;
      }

      channels.push({ username, title, inviteLink });
      await setSetting("required_channels", JSON.stringify(channels));
      clearAllSubCache();
      await send(
        `✅ <b>The requested channel has been added:</b>\n@${esc(username)} — ${esc(title)}\n\n` +
        `All bot users will be asked to subscribe to this channel upon use.${verifyNote}`,
        { parse_mode: "HTML" }
      );
      const tmp = await send("Loading...");
      await showRequiredChannelsMenu(bot, chatId, tmp.message_id);
      return true;
    }

    // ── Control Settings: referral ──
    if (state.step === "ctrl_ref") {
      const val = parseInt(text);
      if (isNaN(val) || val < 1 || val > 100) { await send("❌ Send an integer number between 1 and 100"); return true; }
      clearState();
      await setSetting("referral_threshold", String(val));
      invalidateSetting("referral_threshold");
      await send(`✅ Setting changed successfully! New value: <b>${val}</b>`, { parse_mode: "HTML" });
      const { chatId: oc, msgId: om } = state.data as { chatId: number; msgId: number };
      await showControlSettingsMenu(bot, oc, om);
      return true;
    }
    // ── Control Settings: task ──
    if (state.step === "ctrl_task") {
      const val = parseInt(text);
      if (isNaN(val) || val < 1 || val > 100) { await send("❌ Send an integer number between 1 and 100"); return true; }
      clearState();
      await setSetting("task_threshold", String(val));
      invalidateSetting("task_threshold");
      await send(`✅ Setting changed successfully! New value: <b>${val}</b>`, { parse_mode: "HTML" });
      const { chatId: oc, msgId: om } = state.data as { chatId: number; msgId: number };
      await showControlSettingsMenu(bot, oc, om);
      return true;
    }
    // ── Control Settings: min withdrawal ──
    if (state.step === "ctrl_minwd") {
      const val = parseFloat(text);
      if (isNaN(val) || val < 0.01) { await send("❌ Send a number greater than or equal to 0.01"); return true; }
      clearState();
      await setSetting("min_withdrawal", val.toFixed(4));
      invalidateSetting("min_withdrawal");
      await send(`✅ Setting changed successfully! New value: <b>${val.toFixed(2)} TON</b>`, { parse_mode: "HTML" });
      const { chatId: oc, msgId: om } = state.data as { chatId: number; msgId: number };
      await showControlSettingsMenu(bot, oc, om);
      return true;
    }

    // ── Settings: referral threshold ──
    if (state.step === "set_ref_threshold") {
      if (text === "/cancel") { clearState(); await bot.sendMessage(chatId, "❌ Canceled"); return true; }
      const val = parseInt(text);
      if (isNaN(val) || val < 1 || val > 100) { await send("❌ Enter a whole number between 1 and 100"); return true; }
      clearState();
      await setSetting("referral_threshold", String(val));
      invalidateSetting("referral_threshold");
      await send(`✅ The number of referrals for the free course has been updated to <b>${val}</b>`, { parse_mode: "HTML" });
      const { chatId: origChat, msgId: origMsg } = state.data as { chatId: number; msgId: number };
      await showSettingsMenu(bot, origChat, origMsg);
      return true;
    }

    // ── Settings: task threshold ──
    if (state.step === "set_task_threshold") {
      if (text === "/cancel") { clearState(); await bot.sendMessage(chatId, "❌ Canceled"); return true; }
      const val = parseInt(text);
      if (isNaN(val) || val < 1 || val > 100) { await send("❌ Enter a whole number between 1 and 100"); return true; }
      clearState();
      await setSetting("task_threshold", String(val));
      invalidateSetting("task_threshold");
      await send(`✅ The number of tasks for the free spin has been updated to <b>${val}</b>`, { parse_mode: "HTML" });
      const { chatId: origChat, msgId: origMsg } = state.data as { chatId: number; msgId: number };
      await showSettingsMenu(bot, origChat, origMsg);
      return true;
    }

    // ── Settings: min withdrawal ──
    if (state.step === "set_min_withdrawal") {
      if (text === "/cancel") { clearState(); await bot.sendMessage(chatId, "❌ Canceled"); return true; }
      const val = parseFloat(text);
      if (isNaN(val) || val < 0.01 || val > 10000) { await send("❌ Enter a whole number (0.01 or greater)"); return true; }
      clearState();
      await setSetting("min_withdrawal", val.toFixed(4));
      invalidateSetting("min_withdrawal");
      await send(`✅ Minimum withdrawal limit updated to <b>${val.toFixed(2)} TON</b>`, { parse_mode: "HTML" });
      const { chatId: origChat, msgId: origMsg } = state.data as { chatId: number; msgId: number };
      await showSettingsMenu(bot, origChat, origMsg);
      return true;
    }

    // ── Add admin: enter @username or ID ──
    if (state.step === "admin_add_id") {
      let targetId: number | null = null;
      let resolvedUsername: string | null = null;

      if (text.startsWith("@")) {
        const uname = text.slice(1);
        try {
          const rows = await db.select({ id: usersTable.id, username: usersTable.username })
            .from(usersTable).where(ilike(usersTable.username, uname)).limit(1);
          if (rows[0]) { targetId = rows[0].id; resolvedUsername = rows[0].username ?? uname; }
        } catch { /**/ }
        if (!targetId) { await send(`❌ No user was found on your Username @${esc(uname)}\nPlease enter your Telegram ID numerically instead.`); return true; }
      } else {
        const parsed = parseInt(text);
        if (isNaN(parsed) || parsed <= 0) { await send("❌ Enter your valid @Username or Telegram ID"); return true; }
        targetId = parsed;
        try {
          const rows = await db.select({ username: usersTable.username })
            .from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
          resolvedUsername = rows[0]?.username ?? null;
        } catch { /**/ }
      }

      const label = resolvedUsername ? `@${esc(resolvedUsername)}` : `ID: ${targetId}`;
      adminConvState.set(userId, { step: "admin_add_perms", data: { ...state.data, targetId, resolvedUsername, selectedPerms: [] } });
      await send(`👤 User identified: <b>${label}</b>\n\nChoose permissions now:`, { parse_mode: "HTML" });
      await showAdminPermsEditor(bot, chatId, targetId, [], true);
      return true;
    }

  } catch (err) {
    logger.error({ err }, "Admin text handler error");
    await bot.sendMessage(chatId, "❌ An error occurred, please try again.");
  }

  return false;
}

// Keep for backward compatibility — no longer needed as separate export
export async function handleNewAdminPermsCallback(_bot: TelegramBot, _q: TelegramBot.CallbackQuery): Promise<boolean> {
  return false;
}
