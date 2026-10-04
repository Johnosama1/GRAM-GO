import { db } from "@workspace/db";
import {
  depositsTable,
  usersTable,
  botSettingsTable,
  adminsTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getBot } from "../bot/index";
import { getSetting } from "./settingsCache";
import { logger } from "./logger";
import { getDepositWalletAddress } from "./depositVerifier";
import { calculateUserMining } from "../routes/mining";
import { OWNER_TELEGRAM_ID } from "./adminSecurity";

// ── HTML ESCAPE HELPER ────────────────────────────────────────────────────────
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── DATE & TIME FORMATTERS ────────────────────────────────────────────────────
export function formatDepositDateTime(dateInput: Date | string | number) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) {
    return {
      dateFormatted: "N/A",
      timeFormatted: "N/A",
      fullFormatted: "N/A",
    };
  }

  const pad = (n: number) => n.toString().padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const dateFormatted = `${day}/${month}/${year}`;

  let hours = date.getHours();
  const minutes = pad(date.getMinutes());
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 hour should be 12
  const timeFormatted = `${pad(hours)}:${minutes} ${ampm}`;

  return {
    dateFormatted,
    timeFormatted,
    fullFormatted: `${dateFormatted}, ${timeFormatted}`,
  };
}

export function formatNumber(val: number | string, decimals: number = 2): string {
  const num = typeof val === "number" ? val : parseFloat(String(val) || "0");
  if (isNaN(num)) return "0";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ── ADMIN RECIPIENTS RESOLUTION ───────────────────────────────────────────────
export async function getAdminNotificationRecipients(): Promise<number[]> {
  const adminIds = new Set<number>();

  // 1. Default system owner ID
  if (OWNER_TELEGRAM_ID && !isNaN(OWNER_TELEGRAM_ID) && OWNER_TELEGRAM_ID > 0) {
    adminIds.add(OWNER_TELEGRAM_ID);
  }

  // 2. Environment variables
  const envValues = [
    process.env.ADMIN_TELEGRAM_ID,
    process.env.ADMIN_ID,
    process.env.OWNER_TELEGRAM_ID,
    process.env.ADMIN_CHAT_ID,
  ];
  for (const envVal of envValues) {
    if (envVal) {
      const parsed = parseInt(envVal.trim(), 10);
      if (!isNaN(parsed) && parsed > 0) {
        adminIds.add(parsed);
      }
    }
  }

  // 3. Bot settings in database
  try {
    const settings = await db
      .select()
      .from(botSettingsTable)
      .where(
        inArray(botSettingsTable.key, [
          "owner_telegram_id",
          "admin_telegram_id",
          "admin_chat_id",
          "admin_ids",
        ])
      );

    for (const row of settings) {
      if (!row.value) continue;
      const parts = row.value.split(",");
      for (const p of parts) {
        const parsed = parseInt(p.trim(), 10);
        if (!isNaN(parsed) && parsed > 0) {
          adminIds.add(parsed);
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "depositNotifier: failed to load admin settings from DB");
  }

  // 4. Authorized admins in database admins table
  try {
    const dbAdmins = await db
      .select({ id: adminsTable.id })
      .from(adminsTable);

    for (const adm of dbAdmins) {
      const id = Number(adm.id);
      if (!isNaN(id) && id > 0) {
        adminIds.add(id);
      }
    }
  } catch (err) {
    logger.warn({ err }, "depositNotifier: failed to load admins from adminsTable");
  }

  return Array.from(adminIds);
}

// ── NOTIFICATION MESSAGE TYPES & FORMATTER ────────────────────────────────────
export interface DepositNotificationParams {
  user: {
    id: number;
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
  };
  deposit: {
    id: number;
    amount: number | string; // Deposited amount in Gram/TON
    currency?: string;
    goReceived: number | string; // GO amount credited
    txHash?: string | null;
    walletAddress?: string | null;
    depositWalletAddress?: string | null;
    status: string;
    confirmedAt: Date;
  };
  balance: {
    goBefore: number | string;
    goReceived: number | string;
    goAfter: number | string;
    gramBefore: number | string;
    gramAfter: number | string;
  };
  mining: {
    miningRate: number; // e.g. 0.03 for 3%
    dailyMiningGo: number; // Daily GO yield
    dailyMiningGram: number; // Daily Gram yield
    isMining: boolean;
    unclaimedGramHarvested?: number;
    lastMiningAt: Date;
    nextResetTime?: Date;
  };
}

export function formatAdminDepositNotification(params: DepositNotificationParams): {
  text: string;
  replyMarkup?: any;
} {
  const { user, deposit, balance, mining } = params;

  const userFullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const displayName = userFullName || "None";
  const usernameDisplay = user.username ? `@${escapeHtml(user.username)}` : "None";

  const { dateFormatted, timeFormatted } = formatDepositDateTime(deposit.confirmedAt);

  const amountNum = parseFloat(String(deposit.amount));
  const goReceivedNum = parseFloat(String(deposit.goReceived));

  const goBeforeNum = parseFloat(String(balance.goBefore));
  const goAfterNum = parseFloat(String(balance.goAfter));
  const gramBeforeNum = parseFloat(String(balance.gramBefore));
  const gramAfterNum = parseFloat(String(balance.gramAfter));

  const ratePercentNum = mining.miningRate * 100;
  const miningRatePercent = `${ratePercentNum % 1 === 0 ? ratePercentNum.toFixed(0) : ratePercentNum.toFixed(2)}%`;
  const dailyGoFormatted = formatNumber(mining.dailyMiningGo, 2);
  const dailyGramFormatted = formatNumber(mining.dailyMiningGram, 6);

  const miningStatusText = mining.isMining ? "🟢 Active" : "⚪ Inactive";
  const miningStartFormatted = formatDepositDateTime(mining.lastMiningAt).fullFormatted;

  const nextResetDate =
    mining.nextResetTime ||
    new Date(mining.lastMiningAt.getTime() + 86400 * 1000);
  const nextResetFormatted = formatDepositDateTime(nextResetDate).fullFormatted;

  const harvestedText =
    mining.unclaimedGramHarvested && mining.unclaimedGramHarvested > 0
      ? `✅ Auto-harvested (+${mining.unclaimedGramHarvested.toFixed(6)} Gram) & updated`
      : `✅ Recorded (Accruing continuously)`;

  const txHashClean = deposit.txHash ? escapeHtml(deposit.txHash) : "N/A";
  const senderWalletClean = deposit.walletAddress ? escapeHtml(deposit.walletAddress) : null;
  const depositWalletClean = deposit.depositWalletAddress ? escapeHtml(deposit.depositWalletAddress) : null;

  const text =
`💰 <b>NEW DEPOSIT</b>

👤 <b>User Information</b>
• <b>Name:</b> ${escapeHtml(displayName)}
• <b>Username:</b> ${usernameDisplay}
• <b>Telegram User ID:</b> <code>${user.id}</code>

💳 <b>Deposit Information</b>
• <b>Deposit Amount:</b> <b>${formatNumber(amountNum, 4)} Gram</b> (${formatNumber(amountNum, 4)} TON)
• <b>Currency/Network:</b> ${escapeHtml(deposit.currency || "Gram (TON Network)")}
• <b>GO Received:</b> <b>+${formatNumber(goReceivedNum, 2)} GO</b>
• <b>Status:</b> ✅ Confirmed
• <b>Date:</b> ${dateFormatted}
• <b>Time:</b> ${timeFormatted}

📊 <b>User Balance After Deposit</b>
• <b>GO Balance Before:</b> ${formatNumber(goBeforeNum, 2)} GO
• <b>GO Received:</b> +${formatNumber(goReceivedNum, 2)} GO
• <b>GO Balance After:</b> <b>${formatNumber(goAfterNum, 2)} GO</b>
• <b>Gram Balance Before:</b> ${formatNumber(gramBeforeNum, 6)} Gram
• <b>Gram Balance After:</b> <b>${formatNumber(gramAfterNum, 6)} Gram</b>

⛏️ <b>Mining Information</b>
• <b>Current Mining Rate:</b> ${miningRatePercent}
• <b>24-Hour Mining Amount:</b> <b>${dailyGoFormatted} GO</b> (${dailyGramFormatted} Gram)
• <b>24h Mining Record Status:</b> ${harvestedText}
• <b>Current Mining Status:</b> ${miningStatusText}
• <b>Mining Activation Time:</b> ${miningStartFormatted}
• <b>Next 24h Cycle Reset:</b> ${nextResetFormatted}

🔗 <b>Transaction & Addresses</b>
• <b>Hash/Reference:</b> <code>${txHashClean}</code>` +
(senderWalletClean ? `\n• <b>Sender Wallet:</b> <code>${senderWalletClean}</code>` : "") +
(depositWalletClean ? `\n• <b>Deposit Wallet:</b> <code>${depositWalletClean}</code>` : "");

  let replyMarkup: any = undefined;
  const buttons: any[] = [];

  if (
    deposit.txHash &&
    !deposit.txHash.startsWith("tx_") &&
    !deposit.txHash.startsWith("tc_") &&
    deposit.txHash.length >= 20
  ) {
    buttons.push({
      text: "🔍 View on Tonviewer",
      url: `https://tonviewer.com/transaction/${encodeURIComponent(deposit.txHash)}`,
    });
  }

  if (deposit.walletAddress && deposit.walletAddress.length >= 20) {
    buttons.push({
      text: "👛 Sender Wallet",
      url: `https://tonviewer.com/${encodeURIComponent(deposit.walletAddress)}`,
    });
  }

  if (buttons.length > 0) {
    replyMarkup = {
      inline_keyboard: [buttons],
    };
  }

  return { text, replyMarkup };
}

// ── SNAPSHOT & NOTIFICATION DISPATCHER ─────────────────────────────────────────
export interface BalanceSnapshot {
  goBefore?: number | string;
  gramBefore?: number | string;
  lastMiningAtBefore?: Date | null;
  goAfter?: number | string;
  gramAfter?: number | string;
  lastMiningAtAfter?: Date | null;
  unclaimedGramHarvested?: number;
}

export async function notifyAdminOnDeposit(
  depositId: number,
  snapshot?: BalanceSnapshot
): Promise<{ sent: boolean; reason?: string; recipientCount?: number }> {
  try {
    // 1. ATOMIC CHECK-AND-SET IDEMPOTENCY CLAIM
    // Atomically update depositsTable where id = depositId AND status = 'confirmed' AND adminNotified = false
    const claimResult = await db
      .update(depositsTable)
      .set({
        adminNotified: true,
        adminNotifiedAt: new Date(),
      })
      .where(
        and(
          eq(depositsTable.id, depositId),
          eq(depositsTable.status, "confirmed"),
          eq(depositsTable.adminNotified, false)
        )
      )
      .returning();

    if (claimResult.length === 0) {
      // Check why it was not claimed
      const [existing] = await db
        .select({
          id: depositsTable.id,
          status: depositsTable.status,
          adminNotified: depositsTable.adminNotified,
        })
        .from(depositsTable)
        .where(eq(depositsTable.id, depositId))
        .limit(1);

      if (!existing) {
        logger.warn({ depositId }, "depositNotifier: deposit record not found");
        return { sent: false, reason: "deposit_not_found" };
      }

      if (existing.status !== "confirmed") {
        logger.info(
          { depositId, status: existing.status },
          "depositNotifier: deposit is not confirmed, skipping notification"
        );
        return { sent: false, reason: "deposit_not_confirmed" };
      }

      if (existing.adminNotified) {
        logger.info(
          { depositId },
          "depositNotifier: deposit already notified, skipping duplicate notification"
        );
        return { sent: false, reason: "already_notified" };
      }

      return { sent: false, reason: "not_claimed" };
    }

    const deposit = claimResult[0];

    // 2. Fetch User from DB
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, deposit.userId))
      .limit(1);

    if (!user) {
      logger.error(
        { depositId, userId: deposit.userId },
        "depositNotifier: user not found for confirmed deposit"
      );
      return { sent: false, reason: "user_not_found" };
    }

    // 3. Fetch Global Mining Rate & Deposit Wallet Address
    const [globalRateStr, depositWalletStr] = await Promise.all([
      getSetting("global_mining_rate").catch(() => null),
      getDepositWalletAddress().catch(() => ""),
    ]);
    const globalRate = globalRateStr ? parseFloat(globalRateStr) : 0.03;

    // 4. Calculate or resolve actual values
    const depositAmt = parseFloat(deposit.amount);
    const goReceived = depositAmt * 1000;

    const goAfter =
      snapshot?.goAfter != null
        ? parseFloat(String(snapshot.goAfter))
        : parseFloat(user.goBalance || user.balance || "0");
    const goBefore =
      snapshot?.goBefore != null
        ? parseFloat(String(snapshot.goBefore))
        : Math.max(0, goAfter - goReceived);

    const gramAfter =
      snapshot?.gramAfter != null
        ? parseFloat(String(snapshot.gramAfter))
        : parseFloat(user.gramBalance || "0");
    const unclaimedHarvested = snapshot?.unclaimedGramHarvested ?? 0;
    const gramBefore =
      snapshot?.gramBefore != null
        ? parseFloat(String(snapshot.gramBefore))
        : Math.max(0, gramAfter - unclaimedHarvested);

    const lastMiningAt =
      snapshot?.lastMiningAtAfter || user.lastMiningAt || new Date();

    // User mining calculation post-deposit
    const miningCalc = calculateUserMining(
      {
        goBalance: String(goAfter),
        gramBalance: String(gramAfter),
        miningRate: String(globalRate),
        lastMiningAt,
      },
      globalRate,
      false
    );

    // 5. Format notification message
    const { text, replyMarkup } = formatAdminDepositNotification({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
      },
      deposit: {
        id: deposit.id,
        amount: depositAmt,
        currency: deposit.currency || "Gram",
        goReceived,
        txHash: deposit.txHash,
        walletAddress: deposit.walletAddress || user.savedWalletAddress,
        depositWalletAddress: depositWalletStr || undefined,
        status: deposit.status,
        confirmedAt: deposit.confirmedAt || new Date(),
      },
      balance: {
        goBefore,
        goReceived,
        goAfter,
        gramBefore,
        gramAfter,
      },
      mining: {
        miningRate: globalRate,
        dailyMiningGo: miningCalc.dailyYield * 1000,
        dailyMiningGram: miningCalc.dailyYield,
        isMining: miningCalc.isMining,
        unclaimedGramHarvested: unclaimedHarvested,
        lastMiningAt,
      },
    });

    // 6. Resolve Admin Recipients
    const adminRecipients = await getAdminNotificationRecipients();
    if (adminRecipients.length === 0) {
      logger.warn(
        { depositId },
        "depositNotifier: no admin recipients configured"
      );
      return { sent: false, reason: "no_admin_recipients" };
    }

    const bot = getBot();
    if (!bot) {
      logger.warn(
        { depositId },
        "depositNotifier: Telegram bot not initialized"
      );
      return { sent: false, reason: "bot_not_initialized" };
    }

    let successCount = 0;
    for (const adminId of adminRecipients) {
      try {
        await bot.sendMessage(adminId, text, {
          parse_mode: "HTML",
          reply_markup: replyMarkup,
          disable_web_page_preview: true,
        });
        successCount++;
        logger.info(
          { depositId, adminId },
          "Admin deposit notification sent successfully"
        );
      } catch (sendErr) {
        logger.warn(
          { err: sendErr, adminId, depositId },
          "Failed to send deposit notification to admin"
        );
      }
    }

    return { sent: successCount > 0, recipientCount: successCount };
  } catch (err) {
    logger.error(
      { err, depositId },
      "depositNotifier: unexpected error while processing notification"
    );
    return { sent: false, reason: "unexpected_error" };
  }
}
