import { db } from "@workspace/db";
import { depositsTable, usersTable, botSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { verifyTonDepositTransaction } from "../lib/depositVerifier";
import { addGoBalanceAndClaim } from "../lib/miningUtils";
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
           await addGoBalanceAndClaim(tx, dep.userId, goAmount);
        });

        // Notify User
        try {
           const newBalance = await db.select({goBalance: usersTable.goBalance}).from(usersTable).where(eq(usersTable.id, dep.userId)).limit(1);
           const goBal = newBalance[0]?.goBalance || "0";
           await bot.sendMessage(
             dep.userId,
             `✅ <b>Deposit Successful</b>\n\n` +
             `💎 <b>Amount:</b>\n<b>${verifiedAmt.toFixed(4)} TON</b>\n\n` +
             `🪙 <b>GO Received:</b>\n<b>+${(verifiedAmt * 1000).toFixed(2)} GO</b>\n\n` +
             `💵 <b>New GO Balance:</b>\n<b>${parseFloat(goBal).toFixed(2)} GO</b>\n\n` +
             `👛 <b>Transaction Hash:</b>\n<code>${confirmedTxHash}</code>\n\n` +
             `Your real TON deposit has been verified & confirmed on the TON blockchain, and your GO balance was credited.`,
             { parse_mode: "HTML" }
           );
        } catch (e) {
           logger.error({e}, "Worker: Failed to send user success message");
        }

      } else if (verification.error) {
         if (verification.isDuplicate || verification.error.includes("processed") || verification.error.includes("مسبقاً") || verification.error.includes("failed")) {
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
