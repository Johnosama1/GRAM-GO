import { db } from "@workspace/db";
import { withdrawalsTable, usersTable, transactionsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthorizedAdmins, logAdminAudit } from "../lib/adminSecurity";
import { getSetting } from "../lib/settingsCache";
import { executeAutoWithdrawal, isTonConfigured } from "../lib/withdrawalProcessor";
import { getBot } from "./index";
import { logger } from "../lib/logger";

const DEFAULT_HIGH_VALUE_THRESHOLD = 5.0; // 5 TON

export async function getConsensusThreshold(): Promise<number> {
  const custom = await getSetting("high_value_withdrawal_threshold");
  return custom ? parseFloat(custom) : DEFAULT_HIGH_VALUE_THRESHOLD;
}

export interface VoteResult {
  status: "voted" | "approved_and_executed" | "rejected_and_refunded" | "already_processed" | "error";
  message: string;
  currentApprovals: number;
  requiredApprovals: number;
}

export async function processWithdrawalVote(
  adminId: number,
  withdrawalId: number,
  action: "approve" | "reject",
  reason = "Rejected by admin"
): Promise<VoteResult> {
  // 1. Fetch withdrawal
  const [withdrawal] = await db
    .select()
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.id, withdrawalId))
    .limit(1);

  if (!withdrawal) {
    return { status: "error", message: "Withdrawal request not found", currentApprovals: 0, requiredApprovals: 0 };
  }

  if (withdrawal.status !== "pending") {
    return {
      status: "already_processed",
      message: `The withdrawal request has already been processed with status: ${withdrawal.status}`,
      currentApprovals: withdrawal.approvals?.length || 0,
      requiredApprovals: withdrawal.requiredApprovals || 1,
    };
  }

  const { allAdminIds } = await getAuthorizedAdmins();
  const threshold = await getConsensusThreshold();
  const amountNum = parseFloat(withdrawal.amount);
  const isHighValue = amountNum >= threshold;

  // Small amount = 1 approval. High value = unanimous consensus from all active admins
  const requiredApprovals = isHighValue ? Math.max(1, allAdminIds.size) : 1;

  const currentApprovals = new Set<number>(withdrawal.approvals || []);
  const currentRejections = new Set<number>(withdrawal.rejections || []);

  if (action === "approve") {
    currentApprovals.add(adminId);
    currentRejections.delete(adminId);
  } else {
    currentRejections.add(adminId);
    currentApprovals.delete(adminId);
  }

  const approvalsArray = Array.from(currentApprovals);
  const rejectionsArray = Array.from(currentRejections);

  // Check if rejected
  if (action === "reject" || rejectionsArray.length >= 1) {
    // Atomic CAS update to 'rejected'
    const [casResult] = await db
      .update(withdrawalsTable)
      .set({
        status: "rejected",
        errorMsg: reason,
        approvals: approvalsArray,
        rejections: rejectionsArray,
        processedAt: new Date(),
      })
      .where(and(eq(withdrawalsTable.id, withdrawalId), eq(withdrawalsTable.status, "pending")))
      .returning();

    if (!casResult) {
      return {
        status: "already_processed",
        message: "The request has already been processed concurrently by another administrator",
        currentApprovals: approvalsArray.length,
        requiredApprovals,
      };
    }

    // Refund user balance
    try {
      await db
        .update(usersTable)
        .set({
          gramBalance: sql`COALESCE(gram_balance, 0) + ${sql.raw(withdrawal.amount)}`,
        })
        .where(eq(usersTable.id, withdrawal.userId));

      await db
        .insert(transactionsTable)
        .values({
          userId: withdrawal.userId,
          type: "withdrawal_refund",
          amount: withdrawal.amount,
          currency: withdrawal.currency,
          details: { withdrawalId, reason },
        })
        .catch(() => {});

      const bot = getBot();
      if (bot) {
        await bot
          .sendMessage(
            withdrawal.userId,
            `❌ <b>Your withdrawal request has been rejected #${withdrawalId}</b>\n\n` +
              `Refund amount: <b>${withdrawal.amount} ${withdrawal.currency}</b>\n` +
              `Reason: ${reason}`,
            { parse_mode: "HTML" }
          )
          .catch(() => {});
      }
    } catch (err) {
      logger.error({ err, withdrawalId }, "Error processing withdrawal refund");
    }

    await logAdminAudit(adminId, "reject_withdrawal", { withdrawalId, reason }, withdrawal.userId);

    return {
      status: "rejected_and_refunded",
      message: `❌ The withdrawal request #${withdrawalId} was rejected and the user’s balance was returned`,
      currentApprovals: approvalsArray.length,
      requiredApprovals,
    };
  }

  // Check if reached required approvals
  if (approvalsArray.length >= requiredApprovals) {
    // Atomic CAS update to 'approved'
    const [casResult] = await db
      .update(withdrawalsTable)
      .set({
        status: "approved",
        approvals: approvalsArray,
        rejections: rejectionsArray,
        requiredApprovals,
        processedAt: new Date(),
      })
      .where(and(eq(withdrawalsTable.id, withdrawalId), eq(withdrawalsTable.status, "pending")))
      .returning();

    if (!casResult) {
      return {
        status: "already_processed",
        message: "The request was processed and confirmed simultaneously by another administrator",
        currentApprovals: approvalsArray.length,
        requiredApprovals,
      };
    }

      let autoWithdrawSuccess = false;
      let autoWithdrawError = "";

      // Attempt automatic blockchain payout if wallet configured
      if (await isTonConfigured()) {
        try {
          const res = await executeAutoWithdrawal(withdrawalId, adminId);
          autoWithdrawSuccess = res.success;
          if (!res.success) {
            autoWithdrawError = res.error || "Unknown conversion error";
          }
        } catch (err) {
          logger.error({ err, withdrawalId }, "Auto withdrawal execution error");
          autoWithdrawError = err instanceof Error ? err.message : String(err);
        }
      } else {
        autoWithdrawError = "Bot wallet not configured (TON_WALLET_MNEMONIC not configured)";
      }

      await logAdminAudit(
        adminId,
        "approve_withdrawal_consensus",
        {
          withdrawalId,
          approvals: approvalsArray,
          requiredApprovals,
          amount: withdrawal.amount,
        },
        withdrawal.userId
      );

      if (autoWithdrawSuccess) {
        return {
          status: "approved_and_executed",
          message: `✅ Quorum (${approvalsArray.length}/${requiredApprovals}) has been achieved and ${withdrawal.amount} TON has been successfully transferred on the blockchain!`,
          currentApprovals: approvalsArray.length,
          requiredApprovals,
        };
      } else {
        return {
          status: "error",
          message: `⚠️ Blockchain transfer failed:\n${autoWithdrawError}`,
          currentApprovals: approvalsArray.length,
          requiredApprovals,
        };
      }
    }

  // Partial vote recorded, waiting for remaining approvals
  await db
    .update(withdrawalsTable)
    .set({
      approvals: approvalsArray,
      rejections: rejectionsArray,
      requiredApprovals,
    })
    .where(eq(withdrawalsTable.id, withdrawalId));

  return {
    status: "voted",
    message: `🗳️ Your vote has been successfully registered (${approvalsArray.length}/${requiredApprovals} votes required for approval)`,
    currentApprovals: approvalsArray.length,
    requiredApprovals,
  };
}
