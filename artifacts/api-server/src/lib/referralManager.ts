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
  dailyCombo: boolean;
  tasksCompleted: number;
  tasksRequired: number;
}

export interface CommissionRate {
  level: number;
  percent: number;
}

export const DEFAULT_COMMISSION_RATES: Record<number, number> = {
  1: 10,
  2: 5,
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
 * Checks a user's progress toward the 3 qualification conditions:
 * 1. Daily Check-in (completed at least 1 checkin or lastDailyClaimAt is set)
 * 2. Daily Combo (completed at least 1 successful combo or comboCompletedAt is set)
 * 3. Complete at least 3 Tasks
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
      comboCompletedAt: usersTable.comboCompletedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const [checkinRes, comboRes, tasksRes] = await Promise.all([
    client
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(dailyCheckinsTable)
      .where(eq(dailyCheckinsTable.userId, userId)),
    client
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(userComboAttemptsTable)
      .where(
        and(
          eq(userComboAttemptsTable.userId, userId),
          eq(userComboAttemptsTable.isSuccess, true),
        ),
      ),
    client
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(userTasksTable)
      .where(eq(userTasksTable.userId, userId)),
  ]);

  const checkinCount = checkinRes[0]?.count || 0;
  const comboCount = comboRes[0]?.count || 0;
  const taskCount = tasksRes[0]?.count || 0;

  const hasCheckin = checkinCount > 0 || !!user?.lastDailyClaimAt;
  const hasCombo = comboCount > 0 || !!user?.comboCompletedAt;
  const tasksCompleted = Math.max(taskCount, user?.tasksCompleted || 0);
  const tasksRequired = 3;

  const isQualified = hasCheckin && hasCombo && tasksCompleted >= tasksRequired;

  return {
    isQualified,
    dailyCheckin: hasCheckin,
    dailyCombo: hasCombo,
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

      // Process qualification reward (+1 GO) and send telegram notification to inviter(s)
      for (const ref of pendingReferrals) {
        // Idempotently credit +1 GO qualification reward
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
            await addGoBalanceAndClaim(client, ref.referrerId, 1);
            await client.insert(transactionsTable).values({
              userId: ref.referrerId,
              type: "referral_qualification_reward",
              amount: "1",
              currency: "GO",
              details: {
                referredUserId: userId,
                rewardGo: 1,
                reason: "qualification_completed",
              },
            });
            logger.info(
              { referrerId: ref.referrerId, referredUserId: userId },
              "Credited +1 GO referral qualification reward to referrer",
            );
          }
        } catch (rewardErr) {
          logger.error({ err: rewardErr, referrerId: ref.referrerId, userId }, "Failed to credit +1 GO referral reward");
        }

        if (bot) {
          try {
            await bot.sendMessage(
              ref.referrerId,
              `🟢 <b>Referral Successful &amp; +1 GO Reward!</b>\n\n` +
                `🎉 Your friend ${displayName} has completed all qualification requirements:\n` +
                `✅ Daily Check-in\n` +
                `✅ Daily Combo\n` +
                `✅ 3 Completed Tasks\n\n` +
                `🎁 <b>You received +1 GO referral qualification reward!</b>\n\n` +
                `Your referral is now marked <b>🟢 Successful</b> and eligible for 5-level network commissions! ⛏️`,
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

  // 2. Referral Qualification Check: User must be qualified
  const qualProgress = await checkAndUpdateReferralQualification(depositingUserId, client, bot);
  if (!qualProgress.isQualified) {
    logger.info(
      { depositingUserId, depositId, qualProgress },
      "Depositing user has not completed referral qualification — commissions withheld",
    );
    return { distributed: false, reason: "depositing_user_not_qualified", commissions: [] };
  }

  // 3. Traverse referral chain up to 5 levels (A -> B -> C -> D -> E -> F)
  const chain: Array<{ referrerId: number; level: number }> = [];
  let currentUserId = depositingUserId;
  const visited = new Set<number>([depositingUserId]);

  for (let level = 1; level <= 5; level++) {
    const [u] = await client
      .select({ referredBy: usersTable.referredBy })
      .from(usersTable)
      .where(eq(usersTable.id, currentUserId))
      .limit(1);

    const refId = u?.referredBy;
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
        await bot.sendMessage(
          referrerId,
          `🎁 <b>Referral Commission Received!</b>\n\n` +
            `📊 <b>Level ${level} Commission:</b> +${commissionGo.toFixed(2)} GO (${percent}%)\n` +
            `👤 <b>From:</b> ${depositorDisplay}\n` +
            `💎 <b>Deposit:</b> ${depositAmountGramOrTon.toFixed(4)} Gram (${depositAmountGo.toFixed(2)} GO)\n` +
            `🪙 <b>Credited to GO Balance</b>`,
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
 * Lists referrals for a user with qualification progress and commission statistics.
 */
export async function getUserReferralsWithProgress(
  referrerId: number,
  client: any = db,
) {
  // Query all users directly referred by referrerId
  const referredUsers = await client
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
    })
    .from(usersTable)
    .where(eq(usersTable.referredBy, referrerId))
    .orderBy(desc(usersTable.createdAt));

  if (referredUsers.length === 0) {
    return [];
  }

  // Also query referralsTable records
  const referralRecords = await client
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.referrerId, referrerId));

  const refRecordMap = new Map<number, typeof referralsTable.$inferSelect>();
  for (const r of referralRecords) {
    refRecordMap.set(r.referredId, r);
  }

  // Query commissions earned from each referred user
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
    referredUsers.map(async (u: any) => {
      const progress = await getUserQualificationProgress(u.id, client);
      const existingRef = refRecordMap.get(u.id);

      // Auto-update to successful if newly qualified
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
        level: 1,
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
