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
    return { status: "error", message: "طلب السحب غير موجود", currentApprovals: 0, requiredApprovals: 0 };
  }

  if (withdrawal.status !== "pending") {
    return {
      status: "already_processed",
      message: `طلب السحب تمت معالجته مسبقاً بحالة: ${withdrawal.status}`,
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
        message: "تمت معالجة الطلب بالفعل بالتزامن من قبل مسؤول آخر",
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
            `❌ <b>تم رفض طلب السحب الخاص بك #${withdrawalId}</b>\n\n` +
              `المبلغ المسترجع: <b>${withdrawal.amount} ${withdrawal.currency}</b>\n` +
              `السبب: ${reason}`,
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
      message: `❌ تم رفض طلب السحب #${withdrawalId} واسترجاع الرصيد للمستخدم`,
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
        message: "تمت معالجة الطلب وتأكيده بالتزامن من قبل مسؤول آخر",
        currentApprovals: approvalsArray.length,
        requiredApprovals,
      };
    }

    // Attempt automatic blockchain payout if wallet configured
    if (await isTonConfigured()) {
      executeAutoWithdrawal(withdrawalId).catch((err) => {
        logger.error({ err, withdrawalId }, "Auto withdrawal background execution error");
      });
    }

    const bot = getBot();
    if (bot) {
      await bot
        .sendMessage(
          withdrawal.userId,
          `✅ <b>تمت الموافقة على طلب السحب الخاص بك #${withdrawalId}!</b>\n\n` +
            `المبلغ: <b>${withdrawal.amount} ${withdrawal.currency}</b>\n` +
            `المحفظة: <code>${withdrawal.walletAddress}</code>\n\n` +
            `جاري تحويل المعاملة عبر شبكة البلوكشين 🚀`,
          { parse_mode: "HTML" }
        )
        .catch(() => {});
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

    return {
      status: "approved_and_executed",
      message: `✅ تم اكتمال النصاب (${approvalsArray.length}/${requiredApprovals}) والموافقة على السحب #${withdrawalId}!`,
      currentApprovals: approvalsArray.length,
      requiredApprovals,
    };
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
    message: `🗳️ تم تسجيل صوتك بنجاح (${approvalsArray.length}/${requiredApprovals} أصوات مطلوبة للموافقة)`,
    currentApprovals: approvalsArray.length,
    requiredApprovals,
  };
}
