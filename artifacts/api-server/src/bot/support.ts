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
  const username = msg.from?.username ? `@${msg.from.username}` : "بدون يوزر";
  const firstName = msg.from?.first_name || "";
  const lastName = msg.from?.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim() || "مستخدم";
  const text = msg.text || "(ملف / وسائط)";

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
    `🚨 <b>شكوى جديدة</b>\n\n` +
    `👤 المستخدم:\n<b>${esc(fullName)}</b>\n\n` +
    `🔹 Username:\n${esc(username)}\n\n` +
    `🆔 User ID:\n<code>${userId}</code>\n\n` +
    `🎫 Complaint ID:\n#${complaintId}\n\n` +
    `🕐 الوقت:\n${new Date().toLocaleString('en-GB', { timeZone: 'UTC' })} UTC\n\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `💬 رسالة المستخدم:\n\n<i>${esc(text)}</i>\n\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `📌 الحالة:\n🟡 قيد المراجعة`;

  for (const adminId of allAdminIds) {
    try {
      await bot.sendMessage(adminId, adminNotice, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "↩️ الرد على المستخدم",
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
    "👀 تم استلام شكواك وإرسالها إلى فريق الدعم.\n\nسيتم مراجعة رسالتك والرد عليك في أقرب وقت ممكن.\n\nشكرًا لتواصلك مع فريق GRAM GO 💙"
  );
}

export async function handleUserSupportMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> {
  const userId = msg.from!.id;
  const username = msg.from?.username ? `@${msg.from.username}` : "بدون يوزر";
  const fullName = `${msg.from?.first_name || ""} ${msg.from?.last_name || ""}`.trim() || "مستخدم";
  const text = msg.text || "(ملف / وسائط)";

  // Forward to all authorized admins with a one-time Reply button
  const { allAdminIds } = await getAuthorizedAdmins();

  const adminNotice =
    `📩 <b>رسالة دعم / استفسار جديدة</b>\n\n` +
    `👤 من: <b>${esc(fullName)}</b> (${esc(username)})\n` +
    `🆔 الآيدي: <code>${userId}</code>\n\n` +
    `💬 نص الرسالة:\n<i>${esc(text)}</i>`;

  for (const adminId of allAdminIds) {
    try {
      await bot.sendMessage(adminId, adminNotice, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✉️ رد على المستخدم",
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
    "✅ <b>تم استلام رسالتك!</b>\nسيقوم أحد مسؤولي الإدارة بالرد عليك في أقرب وقت.",
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
    await bot.answerCallbackQuery(query.id, { text: "معرّف الشكوى غير صالح", show_alert: true });
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
    await bot.answerCallbackQuery(query.id, { text: "تعذر العثور على صاحب الشكوى", show_alert: true });
    return;
  }

  // 1. Set admin FSM state
  await setAdminState(adminId, "admin_reply_complaint", {
    targetUserId,
    complaintId,
  });

  await bot.answerCallbackQuery(query.id, { text: "اكتب رسالتك الآن..." });

  await bot.sendMessage(
    adminId,
    `💬 <b>اكتب الآن ردك على المستخدم.</b>\n\n` +
      `سيتم إرسال الرسالة التي تكتبها مباشرة إلى المستخدم.\n\n` +
      `🎫 Complaint ID: #${complaintId}\n\n` +
      `<i>(للإلغاء أرسل /cancel)</i>`,
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
      `💬 <b>رد فريق الدعم:</b>\n\n` +
      `${esc(replyText)}\n\n` +
      `🎫 رقم الشكوى: #${complaintId}`;

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

    await bot.sendMessage(adminId, `✅ تم إرسال الرد إلى المستخدم بنجاح.\n\n🎫 Complaint ID: #${complaintId}`, {
      parse_mode: "HTML",
    });

    return true;
  } catch (err) {
    logger.error({ err, targetUserId, complaintId }, "Error delivering admin reply to complaint");
    await bot.sendMessage(adminId, `❌ تعذر إرسال الرسالة إلى المستخدم (قد يكون حظر البوت).`);
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
    await bot.answerCallbackQuery(query.id, { text: "معرّف المستخدم غير صالح", show_alert: true });
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

  await bot.answerCallbackQuery(query.id, { text: "اكتب رسالتك الآن..." });

  await bot.sendMessage(
    adminId,
    `✍️ <b>أنت الآن في وضع الرد على المستخدم</b> (<code>${targetUserId}</code>)\n\n` +
      `أرسل نص الرسالة الآن وسيتم تحويلها للمستخدم مباشرة.\n` +
      `<i>(للإلغاء أرسل /cancel)</i>`,
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
      `💬 <b>رد من إدارة البوت:</b>\n\n` +
      `${esc(replyText)}\n\n` +
      `<i>يمكنك الرد على هذه الرسالة بالضغط على الزر أدناه:</i>`;

    await bot.sendMessage(targetUserId, userMsg, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✉️ رد على الإدارة",
              callback_data: `user_reply_admin_${adminId}`,
            },
          ],
        ],
      },
    });

    await logAdminAudit(adminId, "reply_to_user", { replyPreview: replyText.slice(0, 100) }, targetUserId);
    await clearAdminState(adminId);

    await bot.sendMessage(adminId, `✅ تم إرسال ردك إلى المستخدم <code>${targetUserId}</code> بنجاح.`, {
      parse_mode: "HTML",
    });

    return true;
  } catch (err) {
    logger.error({ err, targetUserId }, "Error delivering admin reply to user");
    await bot.sendMessage(adminId, `❌ تعذر إرسال الرسالة إلى المستخدم (قد يكون حظر البوت).`);
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

  await bot.answerCallbackQuery(query.id, { text: "اكتب رسالتك..." });

  await bot.sendMessage(
    userId,
    `✍️ أرسل رسالتك الآن وسيتم تسليمها لفريق الإدارة مباشرة:`
  );
}
