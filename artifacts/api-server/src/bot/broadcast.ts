import TelegramBot from "node-telegram-bot-api";
import { db } from "@workspace/db";
import { usersTable, botSettingsTable } from "@workspace/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { logAdminAudit } from "../lib/adminSecurity";

export interface BroadcastProgress {
  status: "idle" | "running" | "paused" | "completed" | "cancelled";
  message: string;
  entities?: TelegramBot.MessageEntity[];
  pin?: boolean;
  copyFromChatId?: number;
  copyFromMessageId?: number;
  mediaType?: string;
  fileId?: string;
  lastUserId: number;
  totalUsers: number;
  sentCount: number;
  failedCount: number;
  blockedCount: number;
  adminId: number;
  startedAt: string;
  updatedAt: string;
}

let isBroadcasting = false;

export async function getBroadcastProgress(): Promise<BroadcastProgress | null> {
  try {
    const [row] = await db
      .select()
      .from(botSettingsTable)
      .where(eq(botSettingsTable.key, "broadcast_progress"))
      .limit(1);

    if (row && row.value) {
      return JSON.parse(row.value) as BroadcastProgress;
    }
  } catch (err) {
    logger.error({ err }, "Error reading broadcast progress");
  }
  return null;
}

export async function saveBroadcastProgress(progress: BroadcastProgress): Promise<void> {
  try {
    const value = JSON.stringify(progress);
    await db
      .insert(botSettingsTable)
      .values({ key: "broadcast_progress", value })
      .onConflictDoUpdate({
        target: botSettingsTable.key,
        set: { value },
      });
  } catch (err) {
    logger.error({ err }, "Error saving broadcast progress");
  }
}

export async function startBroadcast(
  bot: TelegramBot,
  adminId: number,
  message: string,
  entities?: TelegramBot.MessageEntity[],
  pin = false,
  copyFromChatId?: number,
  copyFromMessageId?: number,
  mediaType?: string,
  fileId?: string
): Promise<{ success: boolean; totalUsers: number; message: string }> {
  if (isBroadcasting) {
    return { success: false, totalUsers: 0, message: "A group broadcast is already running" };
  }

  const activeUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isVisible, true))
    .orderBy(usersTable.id);

  const totalUsers = activeUsers.length;
  if (totalUsers === 0) {
    return { success: false, totalUsers: 0, message: "There are no active users to send the message to" };
  }

  const progress: BroadcastProgress = {
    status: "running",
    message: message || "Broadcast Message",
    entities,
    pin,
    copyFromChatId,
    copyFromMessageId,
    mediaType,
    fileId,
    lastUserId: 0,
    totalUsers,
    sentCount: 0,
    failedCount: 0,
    blockedCount: 0,
    adminId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveBroadcastProgress(progress);

  // Run in background
  runBroadcastLoop(bot, activeUsers.map((u) => u.id), progress).catch((err) => {
    logger.error({ err }, "Unhandled error in broadcast loop");
  });

  return {
    success: true,
    totalUsers,
    message: `Mass broadcast to ${totalUsers} user started...`,
  };
}

export async function resumeBroadcast(bot: TelegramBot): Promise<boolean> {
  if (isBroadcasting) return false;

  const progress = await getBroadcastProgress();
  if (!progress || progress.status !== "running") return false;

  // Find remaining users
  const remainingUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.isVisible, true), gt(usersTable.id, progress.lastUserId)))
    .orderBy(usersTable.id);

  if (remainingUsers.length === 0) {
    progress.status = "completed";
    progress.updatedAt = new Date().toISOString();
    await saveBroadcastProgress(progress);
    return false;
  }

  logger.info({ remaining: remainingUsers.length, lastUserId: progress.lastUserId }, "Resuming broadcast");
  runBroadcastLoop(bot, remainingUsers.map((u) => u.id), progress).catch((err) => {
    logger.error({ err }, "Error in resumed broadcast loop");
  });

  return true;
}

export async function cancelBroadcast(): Promise<boolean> {
  const progress = await getBroadcastProgress();
  if (!progress || progress.status !== "running") return false;

  progress.status = "cancelled";
  progress.updatedAt = new Date().toISOString();
  await saveBroadcastProgress(progress);
  isBroadcasting = false;
  return true;
}

async function runBroadcastLoop(
  bot: TelegramBot,
  userIds: number[],
  progress: BroadcastProgress
): Promise<void> {
  isBroadcasting = true;
  const BATCH_SIZE = 25;
  const BATCH_DELAY_MS = 80;

  try {
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      // Check if cancelled externally
      const current = await getBroadcastProgress();
      if (current && current.status === "cancelled") {
        logger.info("Broadcast was cancelled");
        break;
      }

      const batch = userIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (uid) => {
          try {
            let sentMsgId: number | undefined;

            // Reconstruction logic to preserve custom emojis
            const sendOpts: any = {};
            if (progress.entities && progress.entities.length > 0) {
              if (progress.mediaType) {
                sendOpts.caption_entities = progress.entities;
              } else {
                sendOpts.entities = progress.entities;
              }
            }
            if (progress.mediaType && progress.fileId) {
              sendOpts.caption = progress.message;
              let sentMsg;
              if (progress.mediaType === "photo") {
                sentMsg = await bot.sendPhoto(uid, progress.fileId, sendOpts);
              } else if (progress.mediaType === "video") {
                sentMsg = await bot.sendVideo(uid, progress.fileId, sendOpts);
              } else if (progress.mediaType === "animation") {
                sentMsg = await bot.sendAnimation(uid, progress.fileId, sendOpts);
              } else if (progress.mediaType === "document") {
                sentMsg = await bot.sendDocument(uid, progress.fileId, sendOpts);
              } else if (progress.mediaType === "audio") {
                sentMsg = await bot.sendAudio(uid, progress.fileId, sendOpts);
              } else if (progress.mediaType === "voice") {
                sentMsg = await bot.sendVoice(uid, progress.fileId, sendOpts);
              } else if (progress.copyFromChatId && progress.copyFromMessageId) {
                sentMsg = await bot.copyMessage(uid, progress.copyFromChatId, progress.copyFromMessageId);
              }
              sentMsgId = sentMsg?.message_id;
            } else if (progress.message || (progress.entities && progress.entities.length > 0)) {
              const sentMsg = await bot.sendMessage(uid, progress.message || " ", sendOpts);
              sentMsgId = sentMsg?.message_id;
            } else if (progress.copyFromChatId && progress.copyFromMessageId) {
              const res = await bot.copyMessage(uid, progress.copyFromChatId, progress.copyFromMessageId);
              sentMsgId = res.message_id;
            }

            if (progress.pin && sentMsgId) {
              await bot.pinChatMessage(uid, sentMsgId, { disable_notification: true }).catch(() => {});
            }

            progress.sentCount++;
          } catch (err: unknown) {
            progress.failedCount++;
            const errMsg = String(err);
            if (errMsg.includes("bot was blocked") || errMsg.includes("user is deactivated")) {
              progress.blockedCount++;
            }
          }
        })
      );

      progress.lastUserId = batch[batch.length - 1];
      progress.updatedAt = new Date().toISOString();

      // Save progress snapshot periodically
      if (i % 100 === 0 || i + BATCH_SIZE >= userIds.length) {
        await saveBroadcastProgress(progress);
      }

      await new Promise((res) => setTimeout(res, BATCH_DELAY_MS));
    }

    progress.status = "completed";
    progress.updatedAt = new Date().toISOString();
    await saveBroadcastProgress(progress);

    // Audit log
    await logAdminAudit(
      progress.adminId,
      "broadcast_completed",
      {
        total: progress.totalUsers,
        sent: progress.sentCount,
        failed: progress.failedCount,
        blocked: progress.blockedCount,
        messagePreview: progress.message.slice(0, 100),
      }
    );

    // Notify admin
    await bot.sendMessage(
      progress.adminId,
      `✅ <b>Group broadcast complete!</b>\n\n` +
        `📊 Total: <b>${progress.totalUsers}</b>\n` +
        `📨 Sent: <b>${progress.sentCount}</b>\n` +
        `❌ Failed / Blocked: <b>${progress.failedCount}</b> (of whom ${progress.blockedCount} blocked the bot)`,
      { parse_mode: "HTML" }
    ).catch(() => {});

  } catch (err) {
    logger.error({ err }, "Critical error in broadcast loop");
  } finally {
    isBroadcasting = false;
  }
}
