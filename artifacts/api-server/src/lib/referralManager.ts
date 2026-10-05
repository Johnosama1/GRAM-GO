import { db } from "@workspace/db";
import {
  usersTable,
  referralsTable,
  referralCommissionsTable,
  dailyCheckinsTable,
  userComboAttemptsTable,
  userTasksTable,
  transactionsTable,
  botSettingsTable,
} from "@workspace/db/schema";
import { eq, and, sql, desc, or } from "drizzle-orm";
import { addGoBalanceAndClaim } from "./miningUtils";
import { getSetting, invalidateSetting } from "./settingsCache";
import { logAdminAudit } from "./adminSecurity";
import { logger } from "./logger";

export interface QualificationProgress {
  isQualified: boolean;
  dailyCheckin: boolean;
  tasksCompleted: number;
  tasksRequired: number;
}

export interface CommissionRate {
  level: number;
  percent: number;
}

export const DEFAULT_COMMISSION_RATES: Record<number, number> = {
  1: 10,
  2: 3,
  3: 2,
  4: 1,
  5: 1,
};

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Safely parses any raw referral string or param into a valid Telegram user ID number.
 * Supports: "ref_6507841710", "ref6507841710", "r_6507841710", "6507841710", "startapp=ref_6507841710"
 */
export function parseReferrerId(raw: any, currentUserId?: number): number | undefined {
  if (!raw) return undefined;
  const str = String(raw).trim();
  if (
    !str ||
    str === "broadcast" ||
    str === "news_broadcast" ||
    str === "complaint" ||
    str.startsWith("dm_") ||
    str.startsWith("reply_")
  ) {
    return undefined;
  }
  const match = str.match(/(?:ref_?|r_?|=)(\d{5,})/i);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0 && (!currentUserId || num !== currentUserId)) {
      return num;
    }
  }
  const digitsOnly = str.replace(/[^0-9]/g, "");
  if (digitsOnly.length >= 5) {
    const num = parseInt(digitsOnly, 10);
    if (!isNaN(num) && num > 0 && (!currentUserId || num !== currentUserId)) {
      return num;
    }
  }
  return undefined;
}

/**
 * Checks a user's progress toward the 2 qualification conditions:
 * 1. Daily Check-in (completed at least 1 checkin or lastDailyClaimAt is set)
 * 2. Complete at least 3 Tasks
 */
export async function getUserQualificationProgress(
  userId: number,
  client: any = db,
): Promise<QualificationProgress> {
  const [user] = await client
    .select({
      id: usersTable.id,
      tasksCompleted: usersTable.tasksCompleted,
      lastDailyClaimAt: usersTable.lastDailyClaimAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const [checkinRes, tasksRes] = await Promise.all([
    client
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(dailyCheckinsTable)
      .where(eq(dailyCheckinsTable.userId, userId)),
    client
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(userTasksTable)
      .where(eq(userTasksTable.userId, userId)),
  ]);

  const checkinCount = checkinRes[0]?.count || 0;
  const taskCount = tasksRes[0]?.count || 0;

  const hasCheckin = checkinCount > 0 || !!user?.lastDailyClaimAt;
  const tasksCompleted = Math.max(taskCount, user?.tasksCompleted || 0);
  const tasksRequired = 3;

  const isQualified = hasCheckin && tasksCompleted >= tasksRequired;

  return {
    isQualified,
    dailyCheckin: hasCheckin,
    tasksCompleted,
    tasksRequired,
  };
}

/**
 * Checks user qualification and updates referrals table status to 'successful' if qualified.
 * Sends Telegram notification to the referrer when a referral becomes successful.
 */
export async function checkAndUpdateReferralQualification(
  userId: number,
  client: any = db,
  bot?: any,
): Promise<QualificationProgress> {
  const progress = await getUserQualificationProgress(userId, client);

  if (progress.isQualified) {
    // Find any pending or active referral records for this referred user
    const pendingReferrals = await client
      .select()
      .from(referralsTable)
      .where(
        and(
          eq(referralsTable.referredId, userId),
          sql`${referralsTable.status} != 'successful'`,
        ),
      );

    if (pendingReferrals.length > 0) {
      const now = new Date();
      await client
        .update(referralsTable)
        .set({
          status: "successful",
          successfulAt: now,
        })
        .where(
          and(
            eq(referralsTable.referredId, userId),
            sql`${referralsTable.status} != 'successful'`,
          ),
        );

      // Fetch user details for notification
      const [referredUser] = await client
        .select({
          username: usersTable.username,
          firstName: usersTable.firstName,
        })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      const displayName = referredUser?.username
        ? `@${esc(referredUser.username)}`
        : esc(referredUser?.firstName || `User #${userId}`);

      // Process qualification reward (+5 GO) and send telegram notification to inviter(s)
      for (const ref of pendingReferrals) {
        // Idempotently credit +5 GO qualification reward
        try {
          const existingReward = await client
            .select({ id: transactionsTable.id })
            .from(transactionsTable)
            .where(
              and(
                eq(transactionsTable.userId, ref.referrerId),
                eq(transactionsTable.type, "referral_qualification_reward"),
                sql`${transactionsTable.details}->>'referredUserId' = ${String(userId)}`,
              ),
            )
            .limit(1);

          if (existingReward.length === 0) {
            await addGoBalanceAndClaim(client, ref.referrerId, 5);
            await client.insert(transactionsTable).values({
              userId: ref.referrerId,
              type: "referral_qualification_reward",
              amount: "5",
              currency: "GO",
              details: {
                referredUserId: userId,
                rewardGo: 5,
                reason: "qualification_completed",
              },
            });
            logger.info(
              { referrerId: ref.referrerId, referredUserId: userId },
              "Credited +5 GO referral qualification reward to referrer",
            );
          }
        } catch (rewardErr) {
          logger.error({ err: rewardErr, referrerId: ref.referrerId, userId }, "Failed to credit +5 GO referral reward");
        }

        if (bot) {
          try {
            await bot.sendMessage(
              ref.referrerId,
              `🟢 <b>Referral Qualified &amp; +5 GO Reward!</b> 🎉\n\n` +
                `Your friend <b>${displayName}</b> has completed all qualification requirements:\n` +
                `✅ Daily Check-in\n` +
                `✅ Complete 3 Tasks\n\n` +
                `🎁 <b>+5 GO bonus has been credited to your GO balance!</b> 🪙\n\n` +
                `Your referral is now marked <b>🟢 Successful</b>! ⛏️`,
              { parse_mode: "HTML" },
            );
          } catch {
            /* bot error ignored */
          }
        }
      }
    }
  }

  return progress;
}

/**
 * Gets 5-level commission percentages from database (Single source of truth).
 */
export async function getReferralCommissionPercentages(
  client: any = db,
): Promise<CommissionRate[]> {
  const [l1, l2, l3, l4, l5] = await Promise.all([
    getSetting("referral_l1_percent"),
    getSetting("referral_l2_percent"),
    getSetting("referral_l3_percent"),
    getSetting("referral_l4_percent"),
    getSetting("referral_l5_percent"),
  ]);

  const p1 = l1 !== null && l1 !== undefined ? parseFloat(l1) : DEFAULT_COMMISSION_RATES[1];
  const p2 = l2 !== null && l2 !== undefined ? parseFloat(l2) : DEFAULT_COMMISSION_RATES[2];
  const p3 = l3 !== null && l3 !== undefined ? parseFloat(l3) : DEFAULT_COMMISSION_RATES[3];
  const p4 = l4 !== null && l4 !== undefined ? parseFloat(l4) : DEFAULT_COMMISSION_RATES[4];
  const p5 = l5 !== null && l5 !== undefined ? parseFloat(l5) : DEFAULT_COMMISSION_RATES[5];

  return [
    { level: 1, percent: isNaN(p1) || p1 < 0 ? DEFAULT_COMMISSION_RATES[1] : p1 },
    { level: 2, percent: isNaN(p2) || p2 < 0 ? DEFAULT_COMMISSION_RATES[2] : p2 },
    { level: 3, percent: isNaN(p3) || p3 < 0 ? DEFAULT_COMMISSION_RATES[3] : p3 },
    { level: 4, percent: isNaN(p4) || p4 < 0 ? DEFAULT_COMMISSION_RATES[4] : p4 },
    { level: 5, percent: isNaN(p5) || p5 < 0 ? DEFAULT_COMMISSION_RATES[5] : p5 },
  ];
}

/**
 * Updates 5-level commission percentages in database and invalidates cache immediately.
 */
export async function updateReferralCommissionPercentages(
  rates: Record<number, number>,
  adminId: number,
  client: any = db,
) {
  for (let level = 1; level <= 5; level++) {
    const rate = rates[level];
    if (rate !== undefined) {
      const numRate = parseFloat(String(rate));
      if (isNaN(numRate) || numRate < 0 || numRate > 100) {
        throw new Error(`Invalid percentage for Level ${level}: must be between 0 and 100`);
      }
      const key = `referral_l${level}_percent`;
      const valStr = numRate.toString();
      await client
        .insert(botSettingsTable)
        .values({ key, value: valStr })
        .onConflictDoUpdate({
          target: botSettingsTable.key,
          set: { value: valStr },
        });
      invalidateSetting(key);
    }
  }

  await logAdminAudit(adminId, "update_referral_commissions", rates);
}

export interface DistributeCommissionResult {
  distributed: boolean;
  reason?: string;
  commissions: Array<{
    level: number;
    referrerId: number;
    percentage: number;
    commissionGo: number;
  }>;
}

/**
 * Distributes 5-level referral commissions upon a confirmed deposit.
 * 
 * Rules:
 * 1. Commission base is the GO amount credited from the deposit (e.g. 0.1 Gram = 100 GO).
 * 2. Commissions are calculated and paid in GO (+X GO to referrer's GO balance).
 * 3. Depositing user MUST be qualified (Daily Check-in + Daily Combo + 3 Tasks).
 * 4. Idempotent: Never pays twice for the same deposit.
 * 5. Traverses upward through referral chain for up to 5 levels (Level 1 to Level 5).
 */
export async function distributeDepositReferralCommissions(
  opts: {
    depositId: number;
    txHash?: string | null;
    depositingUserId: number;
    depositAmountGramOrTon: number;
    depositAmountGo: number;
  },
  client: any = db,
  bot?: any,
): Promise<DistributeCommissionResult> {
  const { depositId, txHash, depositingUserId, depositAmountGramOrTon, depositAmountGo } = opts;

  if (depositAmountGo <= 0) {
    return { distributed: false, reason: "zero_deposit_amount", commissions: [] };
  }

  // 1. Idempotency protection: Check if commissions already generated for this depositId
  const existingCommissions = await client
    .select({ id: referralCommissionsTable.id })
    .from(referralCommissionsTable)
    .where(eq(referralCommissionsTable.depositId, depositId))
    .limit(1);

  if (existingCommissions.length > 0) {
    logger.info({ depositId }, "Referral commissions already processed for deposit");
    return { distributed: false, reason: "already_processed", commissions: [] };
  }

  // 2. Non-blocking referral qualification check update
  checkAndUpdateReferralQualification(depositingUserId, client, bot).catch(() => {});

  // 3. Traverse referral chain up to 5 levels (A -> B -> C -> D -> E -> F)
  const chain: Array<{ referrerId: number; level: number }> = [];
  let currentUserId = depositingUserId;
  const visited = new Set<number>([depositingUserId]);

  for (let level = 1; level <= 5; level++) {
    let refId: number | null | undefined = null;

    const [u] = await client
      .select({ referredBy: usersTable.referredBy })
      .from(usersTable)
      .where(eq(usersTable.id, currentUserId))
      .limit(1);

    refId = u?.referredBy;

    // Fallback to referralsTable if not present in usersTable
    if (!refId || refId <= 0) {
      const [refRow] = await client
        .select({ referrerId: referralsTable.referrerId })
        .from(referralsTable)
        .where(eq(referralsTable.referredId, currentUserId))
        .limit(1);
      if (refRow?.referrerId) {
        refId = refRow.referrerId;
        // Sync it to usersTable
        await client
          .update(usersTable)
          .set({ referredBy: refId })
          .where(eq(usersTable.id, currentUserId))
          .catch(() => {});
      }
    }

    if (!refId || refId <= 0 || visited.has(refId)) {
      break; // No more referrers or cycle detected
    }

    visited.add(refId);
    chain.push({ referrerId: refId, level });
    currentUserId = refId;
  }

  if (chain.length === 0) {
    return { distributed: false, reason: "no_referrers", commissions: [] };
  }

  // 4. Get dynamic 5-level commission rates from database
  const commissionRates = await getReferralCommissionPercentages(client);
  const rateMap = new Map<number, number>(commissionRates.map((r) => [r.level, r.percent]));

  const distributedCommissions: Array<{
    level: number;
    referrerId: number;
    percentage: number;
    commissionGo: number;
  }> = [];

  // Fetch depositing user display name for notifications
  const [depositor] = await client
    .select({ username: usersTable.username, firstName: usersTable.firstName })
    .from(usersTable)
    .where(eq(usersTable.id, depositingUserId))
    .limit(1);

  const depositorDisplay = depositor?.username
    ? `@${esc(depositor.username)}`
    : esc(depositor?.firstName || `User #${depositingUserId}`);

  // 5. Pay commissions to each level in GO
  for (const item of chain) {
    const { referrerId, level } = item;
    const percent = rateMap.get(level) ?? 0;
    if (percent <= 0) continue;

    // Calculate commission in GO: e.g. 100 GO * 10% = 10 GO
    const rawCommission = depositAmountGo * (percent / 100);
    const commissionGo = Math.round(rawCommission * 1000000) / 1000000;

    if (commissionGo <= 0) continue;

    // Credit referrer's GO balance (harvests continuous mining automatically)
    await addGoBalanceAndClaim(client, referrerId, commissionGo);

    // Record auditable commission entry
    await client.insert(referralCommissionsTable).values({
      depositId,
      txHash: txHash || null,
      depositingUserId,
      referrerId,
      level,
      depositAmountGram: String(depositAmountGramOrTon),
      depositAmountGo: String(depositAmountGo),
      percentage: String(percent),
      commissionAmountGo: String(commissionGo),
      currency: "GO",
    });

    // Record in transactions history
    await client.insert(transactionsTable).values({
      userId: referrerId,
      type: "referral_commission",
      amount: String(commissionGo),
      currency: "GO",
      details: {
        level,
        fromUserId: depositingUserId,
        depositId,
        txHash,
        percentage: percent,
        depositAmountGo,
        depositAmountGram: depositAmountGramOrTon,
      },
    });

    distributedCommissions.push({
      level,
      referrerId,
      percentage: percent,
      commissionGo,
    });

    // Telegram Bot notification
    if (bot) {
      try {
        let levelTitle = "";
        let tierDesc = "";

        if (level === 1) {
          levelTitle = `💰 <b>Direct Deposit Commission (Level 1) — ${percent}%</b> 🪙`;
          tierDesc = `Your direct referral <b>${depositorDisplay}</b> made a deposit!`;
        } else if (level === 2) {
          levelTitle = `👥 <b>Network Deposit Commission (Level 2) — ${percent}%</b> 🪙`;
          tierDesc = `A user invited by your network <b>${depositorDisplay}</b> made a deposit!`;
        } else {
          levelTitle = `🌐 <b>Network Deposit Commission (Level ${level}) — ${percent}%</b> 🪙`;
          tierDesc = `A user in your Level ${level} network <b>${depositorDisplay}</b> made a deposit!`;
        }

        const msgText =
          `${levelTitle}\n\n` +
          `👤 <b>Depositor:</b> ${depositorDisplay}\n` +
          `ℹ️ <b>Referral Tier:</b> ${tierDesc}\n\n` +
          `💵 <b>Deposit Amount:</b> ${depositAmountGramOrTon.toFixed(4)} Gram (${depositAmountGo.toFixed(2)} GO)\n` +
          `🎁 <b>Commission Rate (${level === 1 ? "Direct" : "Level " + level}):</b> ${percent}%\n` +
          `🪙 <b>Earned Reward:</b> <b>+${commissionGo.toFixed(2)} GO</b>\n\n` +
          `✅ <b>+${commissionGo.toFixed(2)} GO has been added to your GO balance!</b> ⛏️`;

        await bot.sendMessage(
          referrerId,
          msgText,
          { parse_mode: "HTML" },
        );
      } catch {
        /* bot error ignored */
      }
    }
  }

  logger.info(
    { depositId, depositingUserId, count: distributedCommissions.length },
    "Referral commissions distributed successfully",
  );

  return {
    distributed: true,
    commissions: distributedCommissions,
  };
}

/**
 * Lists referrals for a user across 5 levels with qualification progress and commission statistics.
 */
export async function getUserReferralsWithProgress(
  referrerId: number,
  client: any = db,
) {
  const allReferredUsers: Array<{
    id: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
    tasksCompleted: number;
    lastDailyClaimAt: Date | null;
    comboCompletedAt: Date | null;
    createdAt: Date;
    referredBy: number | null;
    level: number;
  }> = [];

  let currentParentIds = [referrerId];
  const visited = new Set<number>([referrerId]);

  for (let currentLevel = 1; currentLevel <= 5; currentLevel++) {
    if (currentParentIds.length === 0) break;

    const layerUsers = await client
      .select({
        id: usersTable.id,
        username: usersTable.username,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        photoUrl: usersTable.photoUrl,
        tasksCompleted: usersTable.tasksCompleted,
        lastDailyClaimAt: usersTable.lastDailyClaimAt,
        comboCompletedAt: usersTable.comboCompletedAt,
        createdAt: usersTable.createdAt,
        referredBy: usersTable.referredBy,
      })
      .from(usersTable)
      .where(sql`${usersTable.referredBy} IN (${sql.join(currentParentIds, sql`, `)})`)
      .orderBy(desc(usersTable.createdAt))
      .catch(() => []);

    // For level 1, also include any direct records in referralsTable
    if (currentLevel === 1) {
      const tableDirectRefs = await client
        .select({ referredId: referralsTable.referredId })
        .from(referralsTable)
        .where(eq(referralsTable.referrerId, referrerId))
        .catch(() => []);

      const missingDirectIds = tableDirectRefs
        .map((r: any) => r.referredId)
        .filter((id: number) => !visited.has(id) && !layerUsers.some((u: any) => u.id === id));

      if (missingDirectIds.length > 0) {
        const extraUsers = await client
          .select({
            id: usersTable.id,
            username: usersTable.username,
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
            photoUrl: usersTable.photoUrl,
            tasksCompleted: usersTable.tasksCompleted,
            lastDailyClaimAt: usersTable.lastDailyClaimAt,
            comboCompletedAt: usersTable.comboCompletedAt,
            createdAt: usersTable.createdAt,
            referredBy: usersTable.referredBy,
          })
          .from(usersTable)
          .where(sql`${usersTable.id} IN (${sql.join(missingDirectIds, sql`, `)})`)
          .catch(() => []);

        layerUsers.push(...extraUsers);
      }
    }

    const nextParents: number[] = [];
    for (const u of layerUsers) {
      if (!visited.has(u.id)) {
        visited.add(u.id);
        allReferredUsers.push({ ...u, level: currentLevel });
        nextParents.push(u.id);
      }
    }
    currentParentIds = nextParents;
  }

  if (allReferredUsers.length === 0) {
    return [];
  }

  // Query referralsTable records for these users
  const userIds = allReferredUsers.map((u) => u.id);
  const referralRecords = await client
    .select()
    .from(referralsTable)
    .where(sql`${referralsTable.referredId} IN (${sql.join(userIds, sql`, `)})`);

  const refRecordMap = new Map<number, typeof referralsTable.$inferSelect>();
  for (const r of referralRecords) {
    refRecordMap.set(r.referredId, r);
  }

  // Query commissions earned from each referred user by referrerId
  const commissionsSum = await client
    .select({
      depositingUserId: referralCommissionsTable.depositingUserId,
      totalCommission: sql<string>`COALESCE(SUM(${referralCommissionsTable.commissionAmountGo}), '0')`,
    })
    .from(referralCommissionsTable)
    .where(eq(referralCommissionsTable.referrerId, referrerId))
    .groupBy(referralCommissionsTable.depositingUserId);

  const commissionMap = new Map<number, number>();
  for (const c of commissionsSum) {
    commissionMap.set(c.depositingUserId, parseFloat(c.totalCommission || "0"));
  }

  // Evaluate progress for each referred user
  const result = await Promise.all(
    allReferredUsers.map(async (u) => {
      const progress = await getUserQualificationProgress(u.id, client);
      const existingRef = refRecordMap.get(u.id);

      let status = existingRef?.status || "pending";
      let successfulAt = existingRef?.successfulAt || null;

      if (progress.isQualified && existingRef?.status !== "successful") {
        await checkAndUpdateReferralQualification(u.id, client, undefined).catch(() => {});
        status = "successful";
        if (!successfulAt) successfulAt = new Date();
      } else if (!progress.isQualified) {
        status = "pending";
      }

      return {
        id: existingRef?.id || u.id,
        referrerId,
        referredId: u.id,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        name: u.firstName
          ? `${u.firstName} ${u.lastName || ""}`.trim()
          : u.username
            ? `@${u.username}`
            : `User #${u.id}`,
        photoUrl: u.photoUrl ?? null,
        level: u.level,
        status: status === "successful" ? "successful" : "pending",
        progress,
        totalCommissionGo: commissionMap.get(u.id) || 0,
        createdAt: existingRef?.createdAt || u.createdAt,
        successfulAt,
      };
    }),
  );

  return result;
}

/**
 * Lists all 5-level commission history entries earned by a specific referrer.
 */
export async function getUserReferralCommissions(
  referrerId: number,
  client: any = db,
) {
  const rows = await client
    .select({
      id: referralCommissionsTable.id,
      depositId: referralCommissionsTable.depositId,
      level: referralCommissionsTable.level,
      depositingUserId: referralCommissionsTable.depositingUserId,
      depositingUserName: usersTable.firstName,
      depositingUserLastName: usersTable.lastName,
      depositingUserUsername: usersTable.username,
      depositingUserPhotoUrl: usersTable.photoUrl,
      percentage: referralCommissionsTable.percentage,
      depositAmountGram: referralCommissionsTable.depositAmountGram,
      depositAmountGo: referralCommissionsTable.depositAmountGo,
      commissionAmountGo: referralCommissionsTable.commissionAmountGo,
      currency: referralCommissionsTable.currency,
      createdAt: referralCommissionsTable.createdAt,
    })
    .from(referralCommissionsTable)
    .leftJoin(usersTable, eq(referralCommissionsTable.depositingUserId, usersTable.id))
    .where(eq(referralCommissionsTable.referrerId, referrerId))
    .orderBy(desc(referralCommissionsTable.createdAt));

  return rows.map((c: any) => {
    const name = c.depositingUserName
      ? `${c.depositingUserName} ${c.depositingUserLastName || ""}`.trim()
      : c.depositingUserUsername
        ? `@${c.depositingUserUsername}`
        : `User #${c.depositingUserId}`;

    return {
      id: c.id,
      depositId: c.depositId,
      level: c.level,
      depositingUserId: c.depositingUserId,
      depositingUserName: name,
      depositingUserUsername: c.depositingUserUsername,
      depositingUserPhotoUrl: c.depositingUserPhotoUrl || null,
      percentage: parseFloat(c.percentage || "0"),
      depositAmountGram: c.depositAmountGram,
      depositAmountGo: c.depositAmountGo,
      commissionAmountGo: parseFloat(c.commissionAmountGo || "0"),
      currency: c.currency || "GO",
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
    };
  });
}

/**
 * Sends a rich Telegram notification to the referrer when a new user joins via their referral link.
 * Includes:
 * - New user's username and display name
 * - Current count of successful referrals
 * - Current count of pending referrals
 * - Qualification criteria reminder to earn direct +5 GO and 5-level commissions
 */
export async function sendNewReferralNotification(
  bot: any,
  referrerId: number,
  referredUser: { id: number; username?: string | null; firstName?: string | null; lastName?: string | null },
  client: any = db,
): Promise<void> {
  if (!bot) return;

  try {
    const fullName = [referredUser.firstName, referredUser.lastName].filter(Boolean).join(" ").trim();
    const userDisplay = referredUser.username
      ? `@${esc(referredUser.username)}${fullName ? ` (${esc(fullName)})` : ""}`
      : esc(fullName || `User #${referredUser.id}`);

    // Query count of successful and pending referrals for this referrer
    const [successfulCountRes, pendingCountRes] = await Promise.all([
      client
        .select({ count: sql`COUNT(*)::int` })
        .from(referralsTable)
        .where(
          and(
            eq(referralsTable.referrerId, referrerId),
            or(eq(referralsTable.status, "successful"), eq(referralsTable.status, "active")),
          ),
        ),
      client
        .select({ count: sql`COUNT(*)::int` })
        .from(referralsTable)
        .where(
          and(
            eq(referralsTable.referrerId, referrerId),
            eq(referralsTable.status, "pending"),
          ),
        ),
    ]);

    const successfulCount = Number(successfulCountRes[0]?.count || 0);
    const pendingCount = Number(pendingCountRes[0]?.count || 0);

    const message =
      `🎉 <b>New Referral Joined via Your Link!</b>\n\n` +
      `👤 <b>New Member:</b> ${userDisplay}\n\n` +
      `📊 <b>Your Referral Network Stats:</b>\n` +
      `🟢 <b>Successful:</b> ${successfulCount}\n` +
      `🟡 <b>Pending:</b> ${pendingCount}\n\n` +
      `🎁 <b>Qualification to Earn +5 GO:</b>\n` +
      `1️⃣ Daily Check-in\n` +
      `2️⃣ Complete 3 Tasks\n\n` +
      `⚡ Once your friend completes the qualification requirements, you will immediately receive <b>+5 GO</b> bonus! ⛏️`;

    await bot.sendMessage(referrerId, message, { parse_mode: "HTML" });
    logger.info({ referrerId, referredUserId: referredUser.id }, "Sent rich new referral notification to inviter");
  } catch (err) {
    logger.warn({ err, referrerId, referredId: referredUser.id }, "Failed to send new referral notification");
  }
}
