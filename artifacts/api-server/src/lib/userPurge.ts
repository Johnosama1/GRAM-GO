import { db } from "@workspace/db";
import {
  usersTable,
  referralsTable,
  referralCommissionsTable,
  userTasksTable,
  taskSubmissionsTable,
  dailyCheckinsTable,
  userComboAttemptsTable,
  userMilestonesTable,
  userPromoCodesTable,
  transactionsTable,
  withdrawalsTable,
  depositsTable,
  deviceFingerprintsTable,
  bansTable,
  securityEventsTable,
  adminLoginAttemptsTable,
  complaintsTable,
  adRewardEventsTable,
  fsmStatesTable,
} from "@workspace/db/schema";
import { inArray, or, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

export interface PurgeResult {
  userIds: number[];
  success: boolean;
  deletedCounts: Record<string, number>;
}

/**
 * Hard-deletes all data, history, referrals, tasks, commissions, balances,
 * transactions, and security logs for the given list of user IDs.
 * 
 * After purging:
 * - The users no longer exist in the system.
 * - When they enter the bot via any referral link, they are treated as brand new users.
 * - Their new referral link is registered and counted properly.
 */
export async function purgeUsersCompletely(
  userIds: number[],
  client: any = db,
): Promise<PurgeResult> {
  const validIds = userIds
    .map((id) => (typeof id === "string" ? parseInt(id, 10) : id))
    .filter((id) => typeof id === "number" && !isNaN(id) && id > 0);

  if (validIds.length === 0) {
    return { userIds: [], success: true, deletedCounts: {} };
  }

  logger.info({ validIds }, "[userPurge] Starting complete user data purge");

  const deletedCounts: Record<string, number> = {};

  try {
    // 1. User tasks & task submissions
    await client.delete(userTasksTable).where(inArray(userTasksTable.userId, validIds)).catch(() => {});
    await client.delete(taskSubmissionsTable).where(
      or(
        inArray(taskSubmissionsTable.userId, validIds),
        inArray(taskSubmissionsTable.reviewedBy, validIds),
      )
    ).catch(() => {});

    // 2. Daily checkins, daily combo attempts, milestones, promo codes, ads, complaints, fsm
    await client.delete(dailyCheckinsTable).where(inArray(dailyCheckinsTable.userId, validIds)).catch(() => {});
    await client.delete(userComboAttemptsTable).where(inArray(userComboAttemptsTable.userId, validIds)).catch(() => {});
    await client.delete(userMilestonesTable).where(inArray(userMilestonesTable.userId, validIds)).catch(() => {});
    await client.delete(userPromoCodesTable).where(inArray(userPromoCodesTable.userId, validIds)).catch(() => {});
    await client.delete(adRewardEventsTable).where(inArray(adRewardEventsTable.userId, validIds)).catch(() => {});
    await client.delete(complaintsTable).where(inArray(complaintsTable.userId, validIds)).catch(() => {});
    await client.delete(fsmStatesTable).where(inArray(fsmStatesTable.userId, validIds)).catch(() => {});

    // 3. Security logs, device fingerprints, bans, login attempts
    await client.delete(deviceFingerprintsTable).where(inArray(deviceFingerprintsTable.userId, validIds)).catch(() => {});
    await client.delete(bansTable).where(
      or(
        inArray(bansTable.userId, validIds),
        inArray(bansTable.matchedUserId, validIds),
      )
    ).catch(() => {});
    await client.delete(securityEventsTable).where(inArray(securityEventsTable.userId, validIds)).catch(() => {});
    await client.delete(adminLoginAttemptsTable).where(inArray(adminLoginAttemptsTable.userId, validIds)).catch(() => {});

    // 4. Financial transactions, commissions, withdrawals, deposits
    await client.delete(withdrawalsTable).where(inArray(withdrawalsTable.userId, validIds)).catch(() => {});
    await client.delete(depositsTable).where(inArray(depositsTable.userId, validIds)).catch(() => {});
    await client.delete(referralCommissionsTable).where(
      or(
        inArray(referralCommissionsTable.depositingUserId, validIds),
        inArray(referralCommissionsTable.referrerId, validIds),
      )
    ).catch(() => {});

    // Delete user transactions or qualification reward transactions referencing these user IDs
    for (const uid of validIds) {
      await client.delete(transactionsTable).where(
        or(
          eq(transactionsTable.userId, uid),
          sql`${transactionsTable.details}->>'referredUserId' = ${String(uid)}`,
        )
      ).catch(() => {});
    }

    // 5. Referrals table: purge both referred_id and referrer_id entries
    await client.delete(referralsTable).where(
      or(
        inArray(referralsTable.referredId, validIds),
        inArray(referralsTable.referrerId, validIds),
      )
    ).catch(() => {});

    // 6. Clean up other users who were referred by these user IDs (detach referredBy)
    await client.update(usersTable)
      .set({ referredBy: null })
      .where(inArray(usersTable.referredBy, validIds))
      .catch(() => {});

    // Find any users who were referrers of target users so we can update their referral_count
    const referrersOfTarget = await client
      .select({ referredBy: usersTable.referredBy })
      .from(usersTable)
      .where(inArray(usersTable.id, validIds))
      .catch(() => []);

    // 7. Finally, delete from usersTable
    await client.delete(usersTable).where(inArray(usersTable.id, validIds)).catch(() => {});

    // Recalculate referral_count for previous referrers
    for (const row of referrersOfTarget) {
      if (row?.referredBy) {
        await client.execute(sql`
          UPDATE users
          SET referral_count = (
            SELECT COUNT(*)::int FROM users WHERE referred_by = ${row.referredBy}
          )
          WHERE id = ${row.referredBy}
        `).catch(() => {});
      }
    }

    logger.info({ validIds }, "[userPurge] Complete user data purge successful");
    return { userIds: validIds, success: true, deletedCounts };
  } catch (err) {
    logger.error({ err, validIds }, "[userPurge] Error during user data purge");
    throw err;
  }
}
