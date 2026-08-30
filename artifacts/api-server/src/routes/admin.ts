import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import {
  tasksTable,
  userTasksTable,
  usersTable,
  adminsTable,
  botSettingsTable,
  auditLogsTable,
  withdrawalsTable,
  depositsTable,
  contestsTable,
  referralsTable,
  milestonesTable,
  bansTable,
  securityEventsTable,
  deviceFingerprintsTable,
  dailyCombosTable,
  userComboAttemptsTable,
  dailyCheckinsTable,
  transactionsTable,
  comboItems,
} from "@workspace/db/schema";
import { eq, count, sql, and, or, ilike, desc, asc, sum, gte } from "drizzle-orm";
import { invalidateTasksCache } from "./tasks";
import { getBot } from "../bot";
import { getChannelPhotoUrl } from "../bot/admin";
import { setBotEnabled, clearBotEnabledCache } from "../bot/control";
import { clearAllSubCache } from "../bot/subscription";
import { invalidateSetting } from "../lib/settingsCache";
import { logger } from "../lib/logger";

const router = Router();

const OWNER_ID = 6145230334;
const OWNER_USERNAME = (process.env.OWNER_USERNAME || "J_O_H_N8").replace(/^@/, "");

const adminLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة على لوحة الإدارة" },
  skip: () => process.env.NODE_ENV !== "production",
});
router.use(adminLimiter);

export async function getAdminRecord(userId: number) {
  if (!userId || isNaN(userId)) return null;
  if (userId === OWNER_ID) return { role: "owner", isOwner: true, permissions: ["*"] };
  
  const ownerSetting = await db.select().from(botSettingsTable).where(eq(botSettingsTable.key, "owner_telegram_id")).limit(1);
  if (ownerSetting.length > 0 && parseInt(ownerSetting[0].value) === userId) {
    return { role: "owner", isOwner: true, permissions: ["*"] };
  }
  
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.id, userId)).limit(1);
  if (admin) return { role: admin.role, isOwner: false, permissions: admin.permissions || [] };
  
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (user?.username && user.username.replace(/^@/, "").toLowerCase() === OWNER_USERNAME.toLowerCase()) {
    return { role: "owner", isOwner: true, permissions: ["*"] };
  }
  return null;
}

async function logAudit(adminId: number, action: string, details: Record<string, unknown>, targetUserId?: number) {
  try {
    await db.insert(auditLogsTable).values({
      adminId,
      action,
      targetUserId: targetUserId || null,
      details,
    });
  } catch (err) {
    logger.error({ err, action, adminId }, "Failed to write audit log");
  }
}

router.use(async (req: Request, res: Response, next: NextFunction) => {
  const { requireSession } = await import("../middlewares/requireSession");
  requireSession(req, res, async () => {
    const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
    const userId = sessionReq.sessionUserId;
    if (!userId || isNaN(userId) || userId <= 0) {
      res.status(403).json({ error: "Forbidden: No valid session" });
      return;
    }
    const admin = await getAdminRecord(userId);
    if (!admin) {
      res.status(403).json({ error: "Forbidden: Admin access required" });
      return;
    }
    (req as unknown as { adminUser: typeof admin }).adminUser = admin;
    next();
  });
});

router.get("/check", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const admin = await getAdminRecord(sessionReq.sessionUserId || 0);
  res.json({ isAdmin: true, role: admin?.role, isOwner: admin?.isOwner, permissions: admin?.permissions });
});

// SECTION 1: Stats
router.get("/stats", async (_req, res) => {
  try {
    const now = new Date();
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalUsersRes,
      activeNowRes,
      active24hRes,
      bannedUsersRes,
      autoBannedRes,
      balancesSumRes,
      withdrawalsSumRes,
      pendingWithdrawalsRes,
      topTimezonesRes,
    ] = await Promise.all([
      db.select({ count: count() }).from(usersTable),
      db.select({ count: count() }).from(usersTable).where(gte(usersTable.lastMiningAt, fifteenMinAgo)),
      db.select({ count: count() }).from(usersTable).where(gte(usersTable.lastMiningAt, twentyFourHoursAgo)),
      db.select({ count: count() }).from(usersTable).where(eq(usersTable.isVisible, false)),
      db.select({ count: count() }).from(bansTable).where(and(eq(bansTable.bannedBy, "system"), eq(bansTable.isActive, true))),
      db.select({
        totalGo: sum(usersTable.goBalance),
        totalGram: sum(usersTable.gramBalance),
      }).from(usersTable),
      db.select({
        totalTon: sum(withdrawalsTable.amount),
      }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "approved")),
      db.select({ count: count() }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "pending")),
      db.select({
        timeZone: deviceFingerprintsTable.timeZone,
        count: count(),
      })
        .from(deviceFingerprintsTable)
        .groupBy(deviceFingerprintsTable.timeZone)
        .orderBy(desc(count()))
        .limit(5),
    ]);

    const totalUsers = totalUsersRes[0]?.count || 0;
    const activeNow = activeNowRes[0]?.count || 0;
    const active24h = active24hRes[0]?.count || 0;
    const bannedAccounts = bannedUsersRes[0]?.count || 0;
    const autoBannedAccounts = autoBannedRes[0]?.count || 0;
    const totalGo = parseFloat(balancesSumRes[0]?.totalGo || "0").toFixed(2);
    const totalGram = parseFloat(balancesSumRes[0]?.totalGram || "0").toFixed(6);
    const totalTonWithdrawn = parseFloat(withdrawalsSumRes[0]?.totalTon || "0").toFixed(4);
    const pendingWithdrawalsCount = pendingWithdrawalsRes[0]?.count || 0;

    const countries = topTimezonesRes
      .filter((t) => t.timeZone && t.timeZone !== "Unknown")
      .map((t) => ({
        region: t.timeZone || "Unknown",
        count: t.count,
        percentage: totalUsers > 0 ? ((t.count / totalUsers) * 100).toFixed(1) : "0",
      }));

    res.json({
      totalUsers,
      activeNow,
      active24h,
      bannedAccounts,
      autoBannedAccounts,
      totalGo,
      totalGram,
      totalTonWithdrawn,
      pendingWithdrawalsCount,
      countries: countries.length > 0 ? countries : null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to load admin stats");
    res.status(500).json({ error: "Failed to compute stats" });
  }
});

// Broadcast Message
router.post("/broadcast", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const { message, entities, pin } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "Message content is required" });
    return;
  }

  const botInstance = getBot();
  if (!botInstance) {
    res.status(500).json({ error: "Telegram Bot is not initialized" });
    return;
  }

  const allUsers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isVisible, true));
  const total = allUsers.length;

  res.json({ ok: true, queued: true, totalUsers: total, message: "جاري الإرسال إلى " + total + " مستخدم..." });

  (async () => {
    let sentCount = 0;
    let failedCount = 0;
    let blockedCount = 0;

    for (let i = 0; i < allUsers.length; i += 25) {
      const batch = allUsers.slice(i, i + 25);
      await Promise.all(
        batch.map(async (u) => {
          try {
            const sendOpts: Record<string, unknown> = { parse_mode: "HTML" };
            if (entities && Array.isArray(entities)) {
              delete sendOpts.parse_mode;
              sendOpts.entities = entities;
            }
            const sentMsg = await botInstance.sendMessage(u.id, message, sendOpts as import("node-telegram-bot-api").SendMessageOptions);
            if (pin && sentMsg.message_id) {
              await botInstance.pinChatMessage(u.id, sentMsg.message_id, { disable_notification: true }).catch(() => {});
            }
            sentCount++;
          } catch (err: unknown) {
            failedCount++;
            const errMsg = String(err);
            if (errMsg.includes("bot was blocked") || errMsg.includes("user is deactivated")) {
              blockedCount++;
            }
          }
        })
      );
      await new Promise((r) => setTimeout(r, 60));
    }

    await logAudit(adminId, "broadcast", {
      messagePreview: message.slice(0, 100),
      totalUsers: total,
      sentCount,
      failedCount,
      blockedCount,
    });
  })().catch((err) => logger.error({ err }, "Broadcast background error"));
});

// Settings
router.get("/settings", async (_req, res) => {
  const rows = await db.select().from(botSettingsTable);
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

router.put("/settings", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const { key, value } = req.body;

  if (!key || typeof key !== "string" || key.length > 100) {
    res.status(400).json({ error: "Invalid setting key" });
    return;
  }

  const strVal = String(value);

  await db
    .insert(botSettingsTable)
    .values({ key, value: strVal })
    .onConflictDoUpdate({ target: botSettingsTable.key, set: { value: strVal } });

  if (key === "bot_enabled" || key === "maintenance_mode") {
    const isEnabled = key === "maintenance_mode" ? strVal !== "true" : strVal === "true";
    await setBotEnabled(isEnabled);
    clearBotEnabledCache();
  }
  if (key === "required_channels") {
    clearAllSubCache();
  }
  invalidateSetting(key);

  await logAudit(adminId, "update_setting", { key, value: strVal });

  res.json({ ok: true, key, value: strVal });
});

// Admins Management
router.get("/admins", async (_req, res) => {
  const admins = await db.select().from(adminsTable).orderBy(adminsTable.addedAt);
  res.json(admins);
});

router.post("/admins", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const callerAdminId = sessionReq.sessionUserId || 0;
  const { id, username, role, permissions } = req.body;

  const numId = parseInt(id);
  if (isNaN(numId) || numId <= 0) {
    res.status(400).json({ error: "Invalid Telegram ID" });
    return;
  }

  const perms = Array.isArray(permissions) ? permissions : [];
  const adminRole = role === "owner" ? "admin" : (role || "admin");

  const [admin] = await db
    .insert(adminsTable)
    .values({
      id: numId,
      username: username ? username.replace(/^@/, "") : null,
      role: adminRole,
      permissions: perms,
    })
    .onConflictDoUpdate({
      target: adminsTable.id,
      set: {
        username: username ? username.replace(/^@/, "") : null,
        role: adminRole,
        permissions: perms,
      },
    })
    .returning();

  await logAudit(callerAdminId, "add_admin", { targetAdminId: numId, role: adminRole, permissions: perms }, numId);

  res.json(admin);
});

router.put("/admins/:id", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const callerAdminId = sessionReq.sessionUserId || 0;
  const targetId = parseInt(req.params.id);

  if (isNaN(targetId) || targetId <= 0) {
    res.status(400).json({ error: "Invalid admin ID" });
    return;
  }

  if (targetId === OWNER_ID) {
    res.status(403).json({ error: "Cannot modify Owner account" });
    return;
  }

  const { role, permissions } = req.body;
  const perms = Array.isArray(permissions) ? permissions : undefined;
  const updates: Record<string, unknown> = {};
  if (perms) updates.permissions = perms;
  if (role) updates.role = role;

  const [updated] = await db.update(adminsTable).set(updates).where(eq(adminsTable.id, targetId)).returning();
  if (!updated) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }

  await logAudit(callerAdminId, "update_admin", { targetAdminId: targetId, updates }, targetId);
  res.json(updated);
});

router.delete("/admins/:id", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const callerAdminId = sessionReq.sessionUserId || 0;
  const targetId = parseInt(req.params.id);

  if (isNaN(targetId) || targetId <= 0) {
    res.status(400).json({ error: "Invalid admin ID" });
    return;
  }

  if (targetId === OWNER_ID) {
    res.status(403).json({ error: "Cannot remove Owner account" });
    return;
  }

  await db.delete(adminsTable).where(eq(adminsTable.id, targetId));
  await logAudit(callerAdminId, "remove_admin", { targetAdminId: targetId }, targetId);
  res.json({ ok: true, success: true });
});

// Audit Logs
router.get("/audit-logs", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit)) || 50, 100);
  const logs = await db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(limit);
  res.json(logs);
});

// SECTION 2: Mining Rate
router.post("/mining/rate", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const { rate } = req.body;

  const numRate = parseFloat(rate);
  if (isNaN(numRate) || numRate <= 0 || numRate > 1.0) {
    res.status(400).json({ error: "Mining rate must be between 0.001 (0.1%) and 1.00 (100%)" });
    return;
  }

  const strRate = numRate.toFixed(4);
  await db
    .insert(botSettingsTable)
    .values({ key: "global_mining_rate", value: strRate })
    .onConflictDoUpdate({ target: botSettingsTable.key, set: { value: strRate } });

  invalidateSetting("global_mining_rate");
  await logAudit(adminId, "update_mining_rate", { rate: strRate });

  res.json({ ok: true, rate: strRate, percentage: (numRate * 100).toFixed(2) + "%" });
});

// SECTION 3: Finance & Wallet
router.get("/withdrawals", async (_req, res) => {
  const list = await db
    .select({
      id: withdrawalsTable.id,
      userId: withdrawalsTable.userId,
      amount: withdrawalsTable.amount,
      currency: withdrawalsTable.currency,
      walletAddress: withdrawalsTable.walletAddress,
      fee: withdrawalsTable.fee,
      status: withdrawalsTable.status,
      txHash: withdrawalsTable.txHash,
      errorMsg: withdrawalsTable.errorMsg,
      createdAt: withdrawalsTable.createdAt,
      processedAt: withdrawalsTable.processedAt,
      username: usersTable.username,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(withdrawalsTable)
    .leftJoin(usersTable, eq(withdrawalsTable.userId, usersTable.id))
    .orderBy(desc(withdrawalsTable.createdAt))
    .limit(200);

  res.json(list);
});

router.post("/withdrawals/:id/action", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const wId = parseInt(req.params.id);
  const { action, reason } = req.body;

  if (isNaN(wId) || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "Invalid withdrawal action" });
    return;
  }

  const [wd] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, wId)).limit(1);
  if (!wd) {
    res.status(404).json({ error: "Withdrawal request not found" });
    return;
  }

  if (wd.status !== "pending") {
    res.status(400).json({ error: "Withdrawal request already " + wd.status });
    return;
  }

  if (action === "approve") {
    await db
      .update(withdrawalsTable)
      .set({ status: "approved", processedAt: new Date() })
      .where(eq(withdrawalsTable.id, wId));

    const botInstance = getBot();
    if (botInstance) {
      await botInstance
        .sendMessage(
          wd.userId,
          "✅ <b>تمت الموافقة على طلب السحب #" + wId + "</b>\n💰 المبلغ: <b>" + parseFloat(wd.amount).toFixed(4) + " " + wd.currency + "</b>\n📍 العنوان: <code>" + wd.walletAddress + "</code>",
          { parse_mode: "HTML" }
        )
        .catch(() => {});
    }

    await logAudit(adminId, "approve_withdrawal", { withdrawalId: wId, amount: wd.amount, currency: wd.currency }, wd.userId);
  } else {
    await db.transaction(async (tx) => {
      await tx
        .update(withdrawalsTable)
        .set({ status: "rejected", errorMsg: reason || "Rejected by admin", processedAt: new Date() })
        .where(eq(withdrawalsTable.id, wId));

      await tx
        .update(usersTable)
        .set({ tonBalance: sql`ton_balance + ${wd.amount}` })
        .where(eq(usersTable.id, wd.userId));

      await tx.insert(transactionsTable).values({
        userId: wd.userId,
        type: "withdrawal_refund",
        amount: wd.amount,
        currency: wd.currency,
        details: { withdrawalId: wId, reason },
      });
    });

    const botInstance = getBot();
    if (botInstance) {
      await botInstance
        .sendMessage(
          wd.userId,
          "❌ <b>تم رفض طلب السحب #" + wId + "</b>\n💰 تم إعادة <b>" + parseFloat(wd.amount).toFixed(4) + " " + wd.currency + "</b> لرصيدك داخل البوت.\nالسبب: " + (reason || "مراجعة إدارية"),
          { parse_mode: "HTML" }
        )
        .catch(() => {});
    }

    await logAudit(adminId, "reject_withdrawal", { withdrawalId: wId, amount: wd.amount, currency: wd.currency, reason }, wd.userId);
  }

  res.json({ ok: true, success: true });
});

// Deposits
router.get("/deposits", async (_req, res) => {
  const list = await db
    .select({
      id: depositsTable.id,
      userId: depositsTable.userId,
      amount: depositsTable.amount,
      currency: depositsTable.currency,
      walletAddress: depositsTable.walletAddress,
      txHash: depositsTable.txHash,
      status: depositsTable.status,
      reason: depositsTable.reason,
      createdAt: depositsTable.createdAt,
      confirmedAt: depositsTable.confirmedAt,
      username: usersTable.username,
      firstName: usersTable.firstName,
    })
    .from(depositsTable)
    .leftJoin(usersTable, eq(depositsTable.userId, usersTable.id))
    .orderBy(desc(depositsTable.createdAt))
    .limit(200);

  res.json(list);
});

// Reset GO
router.post("/reset-go-balances", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const { confirm } = req.body;

  if (confirm !== "CONFIRM_RESET_ALL_GO") {
    res.status(400).json({ error: "Must confirm with 'CONFIRM_RESET_ALL_GO'" });
    return;
  }

  const [countRes] = await db.select({ count: count() }).from(usersTable);
  const totalUsers = countRes?.count || 0;

  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({
      goBalance: "0.000000",
      balance: "0.000000",
    });

    await tx.insert(auditLogsTable).values({
      adminId,
      action: "reset_all_go_balances",
      details: { affectedUsers: totalUsers },
    });
  });

  res.json({ ok: true, success: true, affectedUsers: totalUsers });
});

// Reset GRAM
router.post("/reset-gram-balances", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const { confirm } = req.body;

  if (confirm !== "CONFIRM_RESET_ALL_GRAM") {
    res.status(400).json({ error: "Must confirm with 'CONFIRM_RESET_ALL_GRAM'" });
    return;
  }

  const [countRes] = await db.select({ count: count() }).from(usersTable);
  const totalUsers = countRes?.count || 0;

  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({
      gramBalance: "0.000000",
    });

    await tx.insert(auditLogsTable).values({
      adminId,
      action: "reset_all_gram_balances",
      details: { affectedUsers: totalUsers },
    });
  });

  res.json({ ok: true, success: true, affectedUsers: totalUsers });
});

// SECTION 4: Tasks & Rewards
router.get("/tasks", async (_req, res) => {
  const tasks = await db.select().from(tasksTable).orderBy(asc(tasksTable.id));
  res.json(tasks);
});

router.post("/tasks", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const { title, description, url, icon, rewardAmount, rewardCurrency, maxClaims, expiresAt } = req.body;

  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "Task title is required" });
    return;
  }

  let channelPhotoUrl: string | null = null;
  const cleanUrl = url?.trim() || null;
  if (cleanUrl) {
    const m = cleanUrl.match(/t\.me\/([A-Za-z0-9_]+)/);
    if (m) {
      try {
        const botInstance = getBot();
        if (botInstance) channelPhotoUrl = await getChannelPhotoUrl(botInstance, m[1]);
      } catch { /* ignore */ }
    }
  }

  const [task] = await db
    .insert(tasksTable)
    .values({
      title: title.trim(),
      description: description?.trim() || null,
      url: cleanUrl,
      icon: (icon?.trim() || "⭐").slice(0, 10),
      channelPhotoUrl,
      rewardAmount: String(parseFloat(rewardAmount) || 5),
      rewardCurrency: rewardCurrency === "Gram" ? "Gram" : "GO",
      maxClaims: maxClaims ? parseInt(maxClaims) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    })
    .returning();

  invalidateTasksCache();
  await logAudit(adminId, "create_task", { taskId: task.id, title: task.title });

  res.json(task);
});

router.put("/tasks/:id", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid task id" });
    return;
  }

  const { title, description, url, icon, rewardAmount, rewardCurrency, maxClaims, isActive, expiresAt } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (url !== undefined) updates.url = url;
  if (icon !== undefined) updates.icon = icon;
  if (rewardAmount !== undefined) updates.rewardAmount = String(parseFloat(rewardAmount) || 5);
  if (rewardCurrency !== undefined) updates.rewardCurrency = rewardCurrency;
  if (maxClaims !== undefined) updates.maxClaims = maxClaims ? parseInt(maxClaims) : null;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;

  const [task] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id)).returning();
  invalidateTasksCache();
  await logAudit(adminId, "update_task", { taskId: id, updates });

  res.json(task);
});

router.delete("/tasks/:id", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid task id" });
    return;
  }

  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  invalidateTasksCache();
  await logAudit(adminId, "delete_task", { taskId: id });

  res.json({ ok: true, success: true });
});

// Contests Management
router.get("/contests", async (_req, res) => {
  const list = await db.select().from(contestsTable).orderBy(desc(contestsTable.createdAt));
  res.json(list);
});

router.post("/contests", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const { title, description, rewardType, totalReward, winnerCount, startDate, endDate } = req.body;

  if (!title || !endDate) {
    res.status(400).json({ error: "Title and End Date are required" });
    return;
  }

  const [contest] = await db
    .insert(contestsTable)
    .values({
      title: title.trim(),
      description: description?.trim() || null,
      rewardType: rewardType === "Gram" ? "Gram" : "GO",
      totalReward: String(parseFloat(totalReward) || 100),
      winnerCount: parseInt(winnerCount) || 3,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: new Date(endDate),
    })
    .returning();

  await logAudit(adminId, "create_contest", { contestId: contest.id, title: contest.title });
  res.json(contest);
});

router.post("/contests/:id/finalize", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const id = parseInt(req.params.id);

  const [contest] = await db.select().from(contestsTable).where(eq(contestsTable.id, id)).limit(1);
  if (!contest) {
    res.status(404).json({ error: "Contest not found" });
    return;
  }

  if (contest.isFinished) {
    res.status(400).json({ error: "Contest has already been finalized" });
    return;
  }

  const topUsers = await db
    .select({ id: usersTable.id, referralCount: usersTable.referralCount })
    .from(usersTable)
    .orderBy(desc(usersTable.referralCount))
    .limit(contest.winnerCount);

  const winnersList: { rank: number; userId: number; prize: string }[] = [];
  const totalPrize = parseFloat(contest.totalReward);
  const prizePerWinner = (totalPrize / Math.max(1, topUsers.length)).toFixed(2);

  await db.transaction(async (tx) => {
    for (let i = 0; i < topUsers.length; i++) {
      const u = topUsers[i];
      winnersList.push({ rank: i + 1, userId: u.id, prize: prizePerWinner });

      if (contest.rewardType === "Gram") {
        await tx.update(usersTable).set({ gramBalance: sql`gram_balance + ${prizePerWinner}` }).where(eq(usersTable.id, u.id));
      } else {
        await tx.update(usersTable).set({ goBalance: sql`go_balance + ${prizePerWinner}`, balance: sql`balance + ${prizePerWinner}` }).where(eq(usersTable.id, u.id));
      }

      await tx.insert(transactionsTable).values({
        userId: u.id,
        type: "contest_prize",
        amount: prizePerWinner,
        currency: contest.rewardType,
        details: { contestId: contest.id, rank: i + 1 },
      });
    }

    await tx
      .update(contestsTable)
      .set({ isFinished: true, isActive: false, winners: winnersList })
      .where(eq(contestsTable.id, id));
  });

  await logAudit(adminId, "finalize_contest", { contestId: id, winnersCount: winnersList.length });
  res.json({ ok: true, contestId: id, winners: winnersList });
});

// Daily Combo Admin Stats
router.get("/combo/stats", async (_req, res) => {
  const todayStr = new Date().toISOString().split("T")[0];
  const [todayCombo] = await db.select().from(dailyCombosTable).where(eq(dailyCombosTable.comboDate, todayStr)).limit(1);

  const [attemptsRes, successRes] = await Promise.all([
    db.select({ count: count() }).from(userComboAttemptsTable).where(eq(userComboAttemptsTable.comboDate, todayStr)),
    db.select({ count: count() }).from(userComboAttemptsTable).where(and(eq(userComboAttemptsTable.comboDate, todayStr), eq(userComboAttemptsTable.isSuccess, true))),
  ]);

  const itemsMap: Record<number, typeof comboItems[number]> = {};
  for (const it of comboItems) itemsMap[it.id] = it;

  res.json({
    todayDate: todayStr,
    combo: todayCombo ? {
      item1: itemsMap[todayCombo.item1] || { id: todayCombo.item1, name: "Item " + todayCombo.item1 },
      item2: itemsMap[todayCombo.item2] || { id: todayCombo.item2, name: "Item " + todayCombo.item2 },
      item3: itemsMap[todayCombo.item3] || { id: todayCombo.item3, name: "Item " + todayCombo.item3 },
      rewardAmount: todayCombo.rewardAmount,
    } : null,
    totalAttemptsToday: attemptsRes[0]?.count || 0,
    successfulSolvesToday: successRes[0]?.count || 0,
    totalRewardsDistributed: ((successRes[0]?.count || 0) * 5) + " GO",
    allItems: comboItems,
  });
});

// Daily Check-in Settings
router.get("/checkin/settings", async (_req, res) => {
  const [row] = await db.select().from(botSettingsTable).where(eq(botSettingsTable.key, "daily_checkin_rewards")).limit(1);
  const defaultRewards: Record<number, number> = {
    1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 8, 7: 8, 8: 9, 9: 9, 10: 10,
  };
  try {
    const rewards = row?.value ? JSON.parse(row.value) : defaultRewards;
    res.json(rewards);
  } catch {
    res.json(defaultRewards);
  }
});

router.put("/checkin/settings", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const { rewards } = req.body;

  if (!rewards || typeof rewards !== "object") {
    res.status(400).json({ error: "Invalid rewards mapping" });
    return;
  }

  const jsonStr = JSON.stringify(rewards);
  await db
    .insert(botSettingsTable)
    .values({ key: "daily_checkin_rewards", value: jsonStr })
    .onConflictDoUpdate({ target: botSettingsTable.key, set: { value: jsonStr } });

  invalidateSetting("daily_checkin_rewards");
  await logAudit(adminId, "update_checkin_rewards", { rewards });

  res.json({ ok: true, rewards });
});

// SECTION 5: Users & Security
router.get("/users", async (req, res) => {
  const search = req.query.search ? String(req.query.search).trim() : "";
  const limit = Math.min(parseInt(String(req.query.limit)) || 50, 100);
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

  let query = db.select().from(usersTable);

  if (search) {
    const num = parseInt(search);
    if (!isNaN(num)) {
      query = query.where(or(eq(usersTable.id, num), eq(usersTable.referredBy, num))) as typeof query;
    } else {
      const clean = search.replace(/^@/, "");
      query = query.where(or(ilike(usersTable.username, `%${clean}%`), ilike(usersTable.firstName, `%${clean}%`))) as typeof query;
    }
  }

  const users = await query.orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset);
  res.json(users);
});

router.get("/users/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [transactions, referrals, withdrawals, userBan] = await Promise.all([
    db.select().from(transactionsTable).where(eq(transactionsTable.userId, id)).orderBy(desc(transactionsTable.createdAt)).limit(20),
    db.select().from(referralsTable).where(eq(referralsTable.referrerId, id)).limit(20),
    db.select().from(withdrawalsTable).where(eq(withdrawalsTable.userId, id)).orderBy(desc(withdrawalsTable.createdAt)).limit(20),
    db.select().from(bansTable).where(and(eq(bansTable.userId, id), eq(bansTable.isActive, true))).limit(1),
  ]);

  res.json({
    user,
    transactions,
    referralsCount: referrals.length,
    withdrawals,
    isBanned: user.isVisible === false || Boolean(userBan && userBan.length > 0),
    banReason: userBan && userBan[0]?.reason ? userBan[0].reason : null,
  });
});

router.post("/users/:id/balance", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const targetId = parseInt(req.params.id);
  const { type, currency, amount, reason } = req.body;

  const numAmt = parseFloat(amount);
  if (isNaN(numAmt) || numAmt <= 0) {
    res.status(400).json({ error: "Amount must be a positive number" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const isGo = currency === "GO";
  const prevBal = parseFloat(isGo ? (user.goBalance || user.balance || "0") : (user.gramBalance || "0"));
  let newBal = prevBal;

  if (type === "add") {
    newBal = prevBal + numAmt;
  } else if (type === "deduct") {
    newBal = Math.max(0, prevBal - numAmt);
  } else if (type === "correct") {
    newBal = Math.max(0, numAmt);
  }

  const diff = newBal - prevBal;
  const strNewBal = isGo ? newBal.toFixed(2) : newBal.toFixed(6);

  await db.transaction(async (tx) => {
    if (isGo) {
      await tx.update(usersTable).set({ goBalance: strNewBal, balance: strNewBal }).where(eq(usersTable.id, targetId));
    } else {
      await tx.update(usersTable).set({ gramBalance: strNewBal }).where(eq(usersTable.id, targetId));
    }

    await tx.insert(transactionsTable).values({
      userId: targetId,
      type: "admin_" + type + "_balance",
      amount: String(Math.abs(diff)),
      currency: isGo ? "GO" : "Gram",
      details: { previousBalance: prevBal, newBalance: newBal, reason, adminId },
    });

    await tx.insert(auditLogsTable).values({
      adminId,
      action: "balance_" + type,
      targetUserId: targetId,
      details: { currency, previousBalance: prevBal, newBalance: newBal, diff, reason },
    });
  });

  res.json({ ok: true, success: true, targetId, previousBalance: prevBal, newBalance: newBal, diff });
});

router.post("/users/:id/message", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const targetId = parseInt(req.params.id);
  const { message, isWarning } = req.body;

  if (!message || !message.trim()) {
    res.status(400).json({ error: "Message text is required" });
    return;
  }

  const botInstance = getBot();
  if (!botInstance) {
    res.status(500).json({ error: "Telegram Bot is not active" });
    return;
  }

  const formattedMsg = isWarning
    ? "⚠️ <b>تحذير رسمي من إدارة GramGo:</b>\n\n" + message
    : "📩 <b>رسالة من الإدارة:</b>\n\n" + message;

  try {
    await botInstance.sendMessage(targetId, formattedMsg, { parse_mode: "HTML" });
    await logAudit(adminId, isWarning ? "send_warning" : "send_message", { targetUserId: targetId, messagePreview: message.slice(0, 80) }, targetId);
    res.json({ ok: true, success: true });
  } catch (err: unknown) {
    res.status(400).json({ error: "Failed to send message via Telegram: " + (err instanceof Error ? err.message : String(err)) });
  }
});

router.post("/users/:id/ban", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const targetId = parseInt(req.params.id);
  const { reason } = req.body;

  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({ isVisible: false }).where(eq(usersTable.id, targetId));
    await tx.insert(bansTable).values({
      userId: targetId,
      reason: reason || "Banned by administrator",
      bannedBy: String(adminId),
      isActive: true,
    });
  });

  await logAudit(adminId, "ban_user", { targetUserId: targetId, reason }, targetId);
  res.json({ ok: true, banned: true });
});

router.post("/users/:id/unban", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const targetId = parseInt(req.params.id);

  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({ isVisible: true }).where(eq(usersTable.id, targetId));
    await tx.update(bansTable).set({ isActive: false }).where(eq(bansTable.userId, targetId));
  });

  await logAudit(adminId, "unban_user", { targetUserId: targetId }, targetId);
  res.json({ ok: true, unbanned: true });
});

router.get("/auto-banned", async (_req, res) => {
  const list = await db
    .select({
      id: bansTable.id,
      userId: bansTable.userId,
      reason: bansTable.reason,
      bannedAt: bansTable.bannedAt,
      bannedBy: bansTable.bannedBy,
      matchedSignals: bansTable.matchedSignals,
      isActive: bansTable.isActive,
      username: usersTable.username,
      firstName: usersTable.firstName,
      ipHash: usersTable.ipHash,
    })
    .from(bansTable)
    .leftJoin(usersTable, eq(bansTable.userId, usersTable.id))
    .where(eq(bansTable.isActive, true))
    .orderBy(desc(bansTable.bannedAt));

  res.json(list);
});

router.get("/milestones", async (_req, res) => {
  const list = await db.select().from(milestonesTable).orderBy(asc(milestonesTable.requiredReferrals));
  res.json(list);
});

router.post("/milestones", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const { requiredReferrals, rewardAmount, rewardCurrency, isRepeatable } = req.body;

  const reqRefs = parseInt(requiredReferrals);
  const amt = parseFloat(rewardAmount);
  if (isNaN(reqRefs) || isNaN(amt) || reqRefs <= 0 || amt <= 0) {
    res.status(400).json({ error: "Invalid referrals count or reward amount" });
    return;
  }

  const [milestone] = await db
    .insert(milestonesTable)
    .values({
      requiredReferrals: reqRefs,
      rewardAmount: String(amt),
      rewardCurrency: rewardCurrency === "Gram" ? "Gram" : "GO",
      isRepeatable: Boolean(isRepeatable),
    })
    .returning();

  await logAudit(adminId, "create_milestone", { milestoneId: milestone.id, requiredReferrals: reqRefs, rewardAmount: amt });
  res.json(milestone);
});

router.delete("/milestones/:id", async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const adminId = sessionReq.sessionUserId || 0;
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid milestone id" });
    return;
  }

  await db.delete(milestonesTable).where(eq(milestonesTable.id, id));
  await logAudit(adminId, "delete_milestone", { milestoneId: id });
  res.json({ ok: true, success: true });
});

router.get("/security/events", async (_req, res) => {
  const events = await db.select().from(securityEventsTable).orderBy(desc(securityEventsTable.createdAt)).limit(50);
  res.json(events);
});

export default router;
