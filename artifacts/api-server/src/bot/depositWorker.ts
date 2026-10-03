import { db } from "@workspace/db";
import { depositsTable, usersTable, botSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { verifyTonDepositTransaction } from "../lib/depositVerifier";
import { addGoBalanceAndClaim } from "../lib/miningUtils";
import { getAuthorizedAdmins } from "../lib/adminSecurity";
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

        // Get user balance for notifications
        let goBal = "0";
        try {
           const newBalance = await db.select({goBalance: usersTable.goBalance}).from(usersTable).where(eq(usersTable.id, dep.userId)).limit(1);
           goBal = newBalance[0]?.goBalance || "0";
        } catch (e) {
           logger.warn({e}, "Worker: Failed to fetch new balance for notifications");
        }

        // Notify Admin
        try {
           const { allAdminIds } = await getAuthorizedAdmins();
           const userFullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
           const esc = (s: string | null | undefined) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
           const userDisplayName = user.username
             ? `@${esc(user.username)}` + (userFullName ? ` (${esc(userFullName)})` : "")
             : esc(userFullName || `User #${user.id}`);

           const explorerUrl = confirmedTxHash && !confirmedTxHash.startsWith("tx_")
             ? `https://tonviewer.com/transaction/${encodeURIComponent(confirmedTxHash)}`
             : null;

           const depositReplyMarkup = explorerUrl
             ? {
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
               }
             : undefined;

           const formattedDate = new Date().toLocaleString("en-US", {
             dateStyle: "medium",
             timeStyle: "short",
           });

           const adminMsg =
             `<tg-emoji emoji-id="6127223820764844602">✅</tg-emoji><b>Deposit Successful (New Deposit)</b>\n\n` +
             `<tg-emoji emoji-id="5260399854500191689">👤</tg-emoji>${userDisplayName}\n\n` +
             `<tg-emoji emoji-id="5422683699130933153">🪪</tg-emoji><code>${user.id}</code>\n\n` +
             `<tg-emoji emoji-id="5945101187186433635">💎</tg-emoji><b>Amount:</b>\n` +
             `<b>${verifiedAmt.toFixed(4)} TON</b>\n\n` +
             `🪙 <b>GO Received:</b>\n` +
             `<b>+${(verifiedAmt * 1000).toFixed(2)} GO</b>\n\n` +
             `<tg-emoji emoji-id="5409048419211682843">💵</tg-emoji><b>User New GO Balance:</b>\n` +
             `<b>${parseFloat(goBal).toFixed(2)} GO</b>\n\n` +
             `<tg-emoji emoji-id="5039557485157942342">👛</tg-emoji><b>Transaction Hash:</b>\n` +
             `<code>${esc(confirmedTxHash)}</code>\n\n` +
             `📅 <b>Date:</b> ${formattedDate}\n` +
             `Status: ✅ <b>VERIFIED REAL TON ON-CHAIN</b>`;

           for (const adminId of allAdminIds) {
             try {
               await bot.sendMessage(adminId, adminMsg, {
                 parse_mode: "HTML",
                 reply_markup: depositReplyMarkup,
                 disable_web_page_preview: true,
               });
             } catch (adminErr) {
               logger.warn({ err: adminErr, adminId }, "Failed to send deposit notification to admin");
             }
           }
        } catch (e) {
           logger.error({e}, "Worker: Failed to construct or send admin notification");
        }

        // Notify User
        try {
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
