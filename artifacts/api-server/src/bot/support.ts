import TelegramBot from "node-telegram-bot-api";
import { db } from "@workspace/db";
import { usersTable, complaintsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getAuthorizedAdmins, logAdminAudit } from "../lib/adminSecurity";
import { setAdminState, clearAdminState } from "./fsm";
import { logger } from "../lib/logger";

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Handle incoming feedback/support message from a regular user
 */
export async function handleComplaintSubmission(
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> {
  const userId = msg.from!.id;
  const username = msg.from?.username ? `@${msg.from.username}` : "Without user";
  const firstName = msg.from?.first_name || "";
  const lastName = msg.from?.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim() || "user";
  const text = msg.text || "(file/media)";

  // Save to DB
  let complaintId = 0;
  try {
    const [inserted] = await db
      .insert(complaintsTable)
      .values({
        userId,
        username: msg.from?.username || null,
        firstName: firstName || null,
        lastName: lastName || null,
        text,
        status: "pending",
      })
      .returning({ id: complaintsTable.id });
    if (inserted) {
      complaintId = inserted.id;
    }
  } catch (err) {
    logger.error({ err, userId }, "Failed to save complaint to DB");
    // Fallback if db insert fails but we still want to forward
    complaintId = Math.floor(Math.random() * 1000000);
  }

  // Attempt to add 👀 reaction directly to the user's message
  try {
    await bot.setMessageReaction(msg.chat.id, msg.message_id, {
      reaction: [{ type: "emoji", emoji: "👀" }],
      is_big: true,
    });
  } catch (err) {
    logger.error({ err, userId }, "Failed to set 👀 reaction on complaint message");
    // Continue gracefully even if reaction fails
  }

  // Forward to all authorized admins
  const { allAdminIds } = await getAuthorizedAdmins();

  const adminNotice =
    `🚨 <b>New Complaint</b>\n\n` +
    `👤 User:\n<b>${esc(fullName)}</b>\n\n` +
    `🔹 Username:\n${esc(username)}\n\n` +
    `🆔 User ID:\n<code>${userId}</code>\n\n` +
    `🎫 Complaint ID:\n#${complaintId}\n\n` +
    `🕐 Time:\n${new Date().toLocaleString('en-GB', { timeZone: 'UTC' })} UTC\n\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `💬 User Message:\n\n<i>${esc(text)}</i>\n\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `📌 Status:\n🟡 Pending`;

  for (const adminId of allAdminIds) {
    try {
      await bot.sendMessage(adminId, adminNotice, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "↩️ Reply to User",
                callback_data: `admin_reply_complaint_${complaintId}`,
              },
            ],
          ],
        },
      });
    } catch (err) {
      // Admin might have blocked bot or not started it yet
    }
  }

  await clearAdminState(userId);
  await bot.sendMessage(
    msg.chat.id,
    "👀 Your complaint has been received and sent to the support team.\n\nYour message will be reviewed and we will respond to you as soon as possible.\n\nThank you for contacting the GRAM GO team 💙"
  );
}

export async function handleUserSupportMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> {
  const userId = msg.from!.id;
  const username = msg.from?.username ? `@${msg.from.username}` : "Without user";
  const fullName = `${msg.from?.first_name || ""} ${msg.from?.last_name || ""}`.trim() || "user";
  const text = msg.text || "(file/media)";

  // Forward to all authorized admins with a one-time Reply button
  const { allAdminIds } = await getAuthorizedAdmins();

  const adminNotice =
    `📩 <b>New Support Message / Inquiry</b>\n\n` +
    `👤 From: <b>${esc(fullName)}</b> (${esc(username)})\n` +
    `🆔 User ID: <code>${userId}</code>\n\n` +
    `💬 Message Text:\n<i>${esc(text)}</i>`;

  for (const adminId of allAdminIds) {
    try {
      await bot.sendMessage(adminId, adminNotice, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✉️ Reply to User",
                callback_data: `sup_reply_${userId}_${msg.message_id}`,
              },
            ],
          ],
        },
      });
    } catch (err) {
      // Admin might have blocked bot or not started it yet
    }
  }

  await bot.sendMessage(
    msg.chat.id,
    "✅ <b>Your message has been received!</b>\nAn admin will reply to you as soon as possible.",
    { parse_mode: "HTML" }
  );
}

/**
 * Handle Admin clicking "Reply" on a user message
 */
/**
 * Handle Admin clicking "Reply" on a complaint
 */
export async function handleAdminReplyComplaintClick(
  bot: TelegramBot,
  query: TelegramBot.CallbackQuery
): Promise<void> {
  const adminId = query.from.id;
  const data = query.data || "";
  // format: admin_reply_complaint_<complaintId>
  const parts = data.split("_");
  const complaintId = parseInt(parts[3] || "0");

  if (isNaN(complaintId) || complaintId <= 0) {
    await bot.answerCallbackQuery(query.id, { text: "Invalid complaint ID", show_alert: true });
    return;
  }

  // Fetch the target user ID from DB
  let targetUserId = 0;
  try {
    const [complaint] = await db
      .select({ userId: complaintsTable.userId })
      .from(complaintsTable)
      .where(eq(complaintsTable.id, complaintId))
      .limit(1);

    if (complaint) {
      targetUserId = complaint.userId;
    }
  } catch (err) {
    logger.error({ err, complaintId }, "Failed to fetch complaint from DB");
  }

  if (!targetUserId) {
    await bot.answerCallbackQuery(query.id, { text: "Could not find the user for this complaint", show_alert: true });
    return;
  }

  // 1. Set admin FSM state
  await setAdminState(adminId, "admin_reply_complaint", {
    targetUserId,
    complaintId,
  });

  await bot.answerCallbackQuery(query.id, { text: "Please write your message now..." });

  await bot.sendMessage(
    adminId,
    `💬 <b>Please write your reply to the user now.</b>\n\n` +
      `The message you write will be sent directly to the user.\n\n` +
      `🎫 Complaint ID: #${complaintId}\n\n` +
      `<i>(Send /cancel to abort)</i>`,
    { parse_mode: "HTML" }
  );
}

/**
 * Send admin reply to a specific complaint
 */
export async function deliverAdminReplyToComplaint(
  bot: TelegramBot,
  adminId: number,
  targetUserId: number,
  complaintId: number,
  replyText: string
): Promise<boolean> {
  try {
    const userMsg =
      `💬 <b>Support Team Response:</b>\n\n` +
      `${esc(replyText)}`;

    await bot.sendMessage(targetUserId, userMsg, {
      parse_mode: "HTML",
    });

    // Update DB
    try {
      await db
        .update(complaintsTable)
        .set({
          status: "replied",
          adminReply: replyText,
          repliedAt: new Date(),
        })
        .where(eq(complaintsTable.id, complaintId));
    } catch (err) {
      logger.error({ err, complaintId }, "Failed to update complaint status in DB");
    }

    await clearAdminState(adminId);
    await logAdminAudit(adminId, "reply_to_complaint", { replyPreview: replyText.slice(0, 100), complaintId }, targetUserId);

    await bot.sendMessage(adminId, `✅ The response was sent to the user successfully.\n\n🎫 Complaint ID: #${complaintId}`, {
      parse_mode: "HTML",
    });

    return true;
  } catch (err) {
    logger.error({ err, targetUserId, complaintId }, "Error delivering admin reply to complaint");
    await bot.sendMessage(adminId, `❌ The message could not be sent to the user (the bot may have been blocked).`);
    await clearAdminState(adminId);
    return false;
  }
}

export async function handleAdminReplyClick(
  bot: TelegramBot,
  query: TelegramBot.CallbackQuery
): Promise<void> {
  const adminId = query.from.id;
  const data = query.data || "";
  // format: sup_reply_<userId>_<msgId>
  const parts = data.split("_");
  const targetUserId = parseInt(parts[2]);
  const originalMsgId = parseInt(parts[3] || "0");

  if (isNaN(targetUserId) || targetUserId <= 0) {
    await bot.answerCallbackQuery(query.id, { text: "Invalid user ID", show_alert: true });
    return;
  }

  // 1. Immediately remove the inline button from this message to prevent duplicate replies
  if (query.message) {
    try {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: query.message.chat.id, message_id: query.message.message_id }
      );
    } catch {
      // Ignore if edit fails
    }
  }

  // 2. Set admin FSM state
  await setAdminState(adminId, "admin_replying_to_user", {
    targetUserId,
    originalMsgId,
  });

  await bot.answerCallbackQuery(query.id, { text: "Please write your message now..." });

  await bot.sendMessage(
    adminId,
    `✍️ <b>You are now replying to user</b> (<code>${targetUserId}</code>)\n\n` +
      `Send your message now and it will be forwarded directly to the user.\n` +
      `<i>(Send /cancel to abort)</i>`,
    { parse_mode: "HTML" }
  );
}

/**
 * Send admin reply to the user with a dynamic one-time Reply button
 */
export async function deliverAdminReplyToUser(
  bot: TelegramBot,
  adminId: number,
  targetUserId: number,
  replyText: string
): Promise<boolean> {
  try {
    const userMsg =
      `💬 <b>Reply from Support:</b>\n\n` +
      `${esc(replyText)}\n\n` +
      `<i>You can reply to this message by clicking the button below:</i>`;

    await bot.sendMessage(targetUserId, userMsg, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "↩️ Reply",
              callback_data: `user_reply_admin_${adminId}`,
            },
          ],
        ],
      },
    });

    await logAdminAudit(adminId, "reply_to_user", { replyPreview: replyText.slice(0, 100) }, targetUserId);
    await clearAdminState(adminId);

    await bot.sendMessage(adminId, `✅ Reply sent to user <code>${targetUserId}</code> successfully.`, {
      parse_mode: "HTML",
    });

    return true;
  } catch (err) {
    logger.error({ err, targetUserId }, "Error delivering admin reply to user");
    await bot.sendMessage(adminId, `❌ Could not send message to user (they might have blocked the bot).`);
    await clearAdminState(adminId);
    return false;
  }
}

/**
 * Handle user clicking "Reply to Admin"
 */
export async function handleUserReplyClick(
  bot: TelegramBot,
  query: TelegramBot.CallbackQuery
): Promise<void> {
  const userId = query.from.id;

  // 1. Remove the button immediately from user's message
  if (query.message) {
    try {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: query.message.chat.id, message_id: query.message.message_id }
      );
    } catch {
      // Ignore
    }
  }

  // 2. Set user state
  await setAdminState(userId, "user_replying_to_admin", {});

  await bot.answerCallbackQuery(query.id, { text: "✍️ Please write your message..." });

  await bot.sendMessage(
    userId,
    `✍️ Please write your message...`
  );
}

/**
 * Handle user clicking "Reply" to a specific complaint message
 */
export async function handleUserReplyComplaintClick(
  bot: TelegramBot,
  query: TelegramBot.CallbackQuery
): Promise<void> {
  const userId = query.from.id;
  const data = query.data || "";
  const parts = data.split("_");
  const complaintId = parseInt(parts[3] || "0");

  if (query.message) {
    try {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: query.message.chat.id, message_id: query.message.message_id }
      );
    } catch {}
  }

  await setAdminState(userId, "user_replying_to_complaint", { complaintId });
  await bot.answerCallbackQuery(query.id, { text: "✍️ Please write your message..." });
  await bot.sendMessage(userId, "✍️ Please write your message...");
}

export async function handleUserReplyToComplaintMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  complaintId: number
): Promise<void> {
  const userId = msg.from!.id;
  const username = msg.from?.username ? `@${msg.from.username}` : "Without user";
  const fullName = `${msg.from?.first_name || ""} ${msg.from?.last_name || ""}`.trim() || "user";
  const text = msg.text || "(file/media)";

  try {
    await bot.setMessageReaction(msg.chat.id, msg.message_id, {
      reaction: [{ type: "emoji", emoji: "👀" }],
      is_big: true,
    });
  } catch (err) {}

  const { allAdminIds } = await getAuthorizedAdmins();

  const adminNotice =
    `📩 <b>User Reply to Complaint</b>\n\n` +
    `👤 From: <b>${esc(fullName)}</b> (${esc(username)})\n` +
    `🆔 User ID: <code>${userId}</code>\n` +
    `🎫 Complaint ID: #${complaintId}\n\n` +
    `💬 Message Text:\n<i>${esc(text)}</i>`;

  for (const adminId of allAdminIds) {
    try {
      await bot.sendMessage(adminId, adminNotice, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "↩️ Reply to User",
                callback_data: `admin_reply_complaint_${complaintId}`,
              },
            ],
          ],
        },
      });
    } catch (err) {}
  }

  await bot.sendMessage(
    msg.chat.id,
    "✅ <b>Your reply has been sent!</b>\nAn admin will review it as soon as possible.",
    { parse_mode: "HTML" }
  );
}
