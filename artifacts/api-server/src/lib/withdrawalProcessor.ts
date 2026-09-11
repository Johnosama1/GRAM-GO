import { db } from "@workspace/db";
import { withdrawalsTable, usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { sendTon, isTonConfigured } from "./tonSender";
import { logger } from "./logger";

// Lazily import bot to avoid circular deps
function getBot() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../bot").getBot?.();
}

// HTML escape helper
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export { isTonConfigured };

export interface AutoWithdrawalResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export async function executeAutoWithdrawal(
  withdrawalId: number,
  adminChatId?: number,
): Promise<AutoWithdrawalResult> {
  const bot = getBot();

  // Fetch withdrawal record from DB — single source of truth
  const [wd] = await db
    .select()
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.id, withdrawalId))
    .limit(1);
  if (!wd) {
    return { success: false, error: "Withdrawal not found" };
  }

  const { userId, walletAddress, amount } = wd;

  try {
    await db
      .update(withdrawalsTable)
      .set({ status: "processing" })
      .where(eq(withdrawalsTable.id, withdrawalId));

    const result = await sendTon(walletAddress, amount);

    await db
      .update(withdrawalsTable)
      .set({
        status: "completed",
        txHash: result.txRef,
        processedAt: new Date(),
      })
      .where(eq(withdrawalsTable.id, withdrawalId));

    const estimatedFee = wd?.fee ? parseFloat(wd.fee).toFixed(4) : "0.05";
    const txRefStr = result.txRef || "";
    const explorerUrl = txRefStr && txRefStr.length >= 20
      ? (txRefStr.length === 64 || /^[0-9a-fA-F]+$/.test(txRefStr)
          ? `https://tonviewer.com/transaction/${encodeURIComponent(txRefStr)}`
          : `https://tonviewer.com/${encodeURIComponent(walletAddress)}`)
      : `https://tonviewer.com/${encodeURIComponent(walletAddress)}`;

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    const userFullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
    const userDisplayName = user?.username
      ? `@${esc(user.username)}` + (userFullName ? ` (${esc(userFullName)})` : "")
      : esc(userFullName || `User #${userId}`);
    const newGramBalance = parseFloat(String(user?.gramBalance ?? "0")).toFixed(4);
    const wdCurrency = wd.currency || "Gram";
    const amtStr = parseFloat(amount).toFixed(4);

    const explorerReplyMarkup = explorerUrl
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

    if (bot) {
      // Notify user with the exact same style as deposit message
      try {
        const userMsg =
          `<tg-emoji emoji-id="6127223820764844602">✅</tg-emoji><b>Withdrawal Successful</b>\n\n` +
          `<tg-emoji emoji-id="5260399854500191689">👤</tg-emoji>${userDisplayName}\n\n` +
          `<tg-emoji emoji-id="5422683699130933153">🪪</tg-emoji><code>${userId}</code>\n\n` +
          `<tg-emoji emoji-id="5945101187186433635">💎</tg-emoji><b>Amount:</b>\n` +
          `<b>${amtStr} ${wdCurrency}</b>\n\n` +
          `<tg-emoji emoji-id="5409048419211682843">💵</tg-emoji><b>New Balance:</b>\n` +
          `<b>${newGramBalance} ${wdCurrency}</b>\n\n` +
          `<tg-emoji emoji-id="5039557485157942342">👛</tg-emoji><b>Transaction Hash:</b>\n` +
          `<code>${esc(txRefStr || walletAddress)}</code>`;

        await bot.sendMessage(userId, userMsg, {
          parse_mode: "HTML",
          reply_markup: explorerReplyMarkup,
          disable_web_page_preview: true,
        });
      } catch {
        /* ignore */
      }

      // Notify admin
      if (adminChatId) {
        try {
          const formattedDate = new Date().toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          });

          const adminMsg =
            `<tg-emoji emoji-id="6127223820764844602">✅</tg-emoji><b>Withdrawal Executed On-Chain</b>\n\n` +
            `<tg-emoji emoji-id="5260399854500191689">👤</tg-emoji>${userDisplayName}\n\n` +
            `<tg-emoji emoji-id="5422683699130933153">🪪</tg-emoji><code>${userId}</code>\n\n` +
            `<tg-emoji emoji-id="5945101187186433635">💎</tg-emoji><b>Amount Sent:</b>\n` +
            `<b>${amtStr} TON</b>\n\n` +
            `⚡ <b>Fee:</b> <b>${estimatedFee} TON</b>\n\n` +
            `<tg-emoji emoji-id="5409048419211682843">💵</tg-emoji><b>User Remaining Balance:</b>\n` +
            `<b>${newGramBalance} ${wdCurrency}</b>\n\n` +
            `<tg-emoji emoji-id="5039557485157942342">👛</tg-emoji><b>Transaction Hash:</b>\n` +
            `<code>${esc(txRefStr || walletAddress)}</code>\n\n` +
            `📍 <b>Destination:</b> <code>${esc(walletAddress)}</code>\n` +
            `📅 <b>Date:</b> ${formattedDate}\n` +
            `Status: ✅ <b>CONFIRMED ON-CHAIN</b>`;

          await bot.sendMessage(adminChatId, adminMsg, {
            parse_mode: "HTML",
            reply_markup: explorerReplyMarkup,
            disable_web_page_preview: true,
          });
        } catch {
          /* ignore */
        }
      }
    }

    return { success: true, txHash: result.txRef };
  } catch (err) {
    logger.error({ err, withdrawalId }, "TON transfer failed");

    const errMsg = err instanceof Error ? err.message : String(err);

    // Refund deducted balance back to user's gramBalance
    await db
      .update(usersTable)
      .set({ gramBalance: sql`gram_balance + ${amount}` })
      .where(eq(usersTable.id, userId));

    await db
      .update(withdrawalsTable)
      .set({ status: "failed", errorMsg: errMsg })
      .where(eq(withdrawalsTable.id, withdrawalId));

    if (bot) {
      try {
        await bot.sendMessage(
          userId,
          `❌ فشل إرسال ${parseFloat(amount).toFixed(4)} Gram.\n` +
            `تم إعادة المبلغ لرصيدك. حاول مرة أخرى لاحقاً.`,
        );
      } catch {
        /* ignore */
      }

      if (adminChatId) {
        try {
          const isNotFunded =
            errMsg.includes("not funded") || errMsg.includes("Hot wallet");
          const addrMatch = errMsg.match(/Send TON to: (\S+)/);
          const addrHint = addrMatch
            ? `\n\n💳 اشحن المحفظة:\n<code>${esc(addrMatch[1])}</code>`
            : "";
          await bot.sendMessage(
            adminChatId,
            `❌ <b>فشل إرسال ${parseFloat(amount).toFixed(4)} TON</b>\n` +
              (isNotFunded
                ? `⚠️ <b>محفظة البوت الساخنة فارغة!</b>${addrHint}\n\nأرسل TON لهذا العنوان ثم أعد الموافقة على طلب السحب.`
                : `السبب: ${esc(errMsg)}`),
            { parse_mode: "HTML" },
          );
        } catch {
          /* ignore */
        }
      }
    }

    return { success: false, error: errMsg };
  }
}
