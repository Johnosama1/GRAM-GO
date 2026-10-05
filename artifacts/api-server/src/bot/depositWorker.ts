import { db } from "@workspace/db";
import { depositsTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { verifyTonDepositTransaction } from "../lib/depositVerifier";
import { addGoBalanceAndClaim } from "../lib/miningUtils";
import { notifyAdminOnDeposit } from "../lib/depositNotifier";
import { distributeDepositReferralCommissions } from "../lib/referralManager";
import { getBot } from "./index";
import { logger } from "../lib/logger";

const ONE_MINUTE = 60 * 1000;

export async function processPendingDeposits() {
  const bot = getBot();
  if (!bot) return;

  try {
    const pendingDeposits = await db
      .select()
      .from(depositsTable)
      .where(eq(depositsTable.status, "pending"));

    for (const dep of pendingDeposits) {
      if (!dep.txHash) continue;

      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, dep.userId)).limit(1);
      if (!user) continue;

      const verification = await verifyTonDepositTransaction({
        userId: dep.userId,
        amount: parseFloat(dep.amount),
        walletAddress: dep.walletAddress,
        txHash: dep.txHash,
      });

      if (verification.isPending) {
        // still pending, wait
        continue;
      }

      if (verification.verified) {
        const verifiedAmt = parseFloat(verification.amount || dep.amount);
        const confirmedTxHash = verification.txHash || dep.txHash;
        const senderWallet = verification.senderWallet || dep.walletAddress || user.savedWalletAddress;

        const goBefore = parseFloat(user.goBalance || user.balance || "0");
        const gramBefore = parseFloat(user.gramBalance || "0");
        const lastMiningAtBefore = user.lastMiningAt;

        let goAfter = goBefore + verifiedAmt * 1000;
        let gramAfter = gramBefore;
        let lastMiningAtAfter = new Date();
        let unclaimedHarvested = 0;

        await db.transaction(async (tx) => {
           await tx
             .update(depositsTable)
             .set({
               status: "confirmed",
               amount: String(verifiedAmt),
               walletAddress: senderWallet,
               txHash: confirmedTxHash,
               confirmedAt: verification.confirmedAt || new Date(),
             })
             .where(eq(depositsTable.id, dep.id));

           const goAmount = verifiedAmt * 1000;
           const updatedUser = await addGoBalanceAndClaim(tx, dep.userId, goAmount);
           if (updatedUser) {
             goAfter = parseFloat(updatedUser.goBalance || updatedUser.balance || "0");
             gramAfter = parseFloat(updatedUser.gramBalance || "0");
             lastMiningAtAfter = updatedUser.lastMiningAt || new Date();
             unclaimedHarvested = Math.max(0, gramAfter - gramBefore);
           }

           // Distribute 5-level referral commissions in GO
           await distributeDepositReferralCommissions(
             {
               depositId: dep.id,
               txHash: confirmedTxHash,
               depositingUserId: dep.userId,
               depositAmountGramOrTon: verifiedAmt,
               depositAmountGo: goAmount,
             },
             tx,
             bot,
           );
        });

        // Notify Admin (Idempotent, Comprehensive)
        await notifyAdminOnDeposit(dep.id, {
          goBefore,
          goAfter,
          gramBefore,
          gramAfter,
          lastMiningAtBefore,
          lastMiningAtAfter,
          unclaimedGramHarvested: unclaimedHarvested,
        }).catch((e) => {
          logger.error({ e, depositId: dep.id }, "Worker: Failed to send admin deposit notification");
        });

        // Notify User
        try {
           await bot.sendMessage(
             dep.userId,
             `✅ <b>Deposit Successful</b>\n\n` +
             `💎 <b>Amount:</b>\n<b>${verifiedAmt.toFixed(4)} TON</b>\n\n` +
             `🪙 <b>GO Received:</b>\n<b>+${(verifiedAmt * 1000).toFixed(2)} GO</b>\n\n` +
             `💵 <b>New GO Balance:</b>\n<b>${goAfter.toFixed(2)} GO</b>\n\n` +
             `👛 <b>Transaction Hash:</b>\n<code>${confirmedTxHash}</code>\n\n` +
             `Your real TON deposit has been verified & confirmed on the TON blockchain, and your GO balance was credited.`,
             { parse_mode: "HTML" }
           );
        } catch (e) {
           logger.error({ e }, "Worker: Failed to send user success message");
        }

      } else if (verification.error) {
         if (verification.isDuplicate || verification.error.includes("processed") || verification.error.includes("pre") || verification.error.includes("failed")) {
             // It's a duplicate or explicit failure, mark failed
              await db
               .update(depositsTable)
               .set({
                 status: "failed",
                 reason: verification.error,
               })
               .where(eq(depositsTable.id, dep.id));
         }
      }
    }
  } catch (e) {
    logger.error({ e }, "Error in deposit worker");
  }
}

export function startDepositWorker() {
  setInterval(() => processPendingDeposits().catch(() => {}), ONE_MINUTE);
  logger.info("Deposit worker started, running every minute");
}
