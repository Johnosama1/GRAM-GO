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
  AdminPermission,
} from "@workspace/db/schema";
import { eq, count, sql, and, or, ilike, desc, asc, sum, gte } from "drizzle-orm";
import { invalidateTasksCache } from "./tasks";
import { getBot } from "../bot";
import { getChannelPhotoUrl } from "../bot/admin";
import { setBotEnabled, clearBotEnabledCache } from "../bot/control";
import { clearAllSubCache } from "../bot/subscription";
import { getSetting, invalidateSetting } from "../lib/settingsCache";
import { getWalletAddress, isTonConfigured } from "../lib/tonSender";
import { logger } from "../lib/logger";
import { getOrCreateTodayCombo, getTodayDateString } from "./combo";

const router = Router();

const OWNER_ID = 6145230334;
const OWNER_USERNAME = (process.env.OWNER_USERNAME || "J_O_H_N8").replace(/^@/, "");

const adminLimiter = rateLimit({
  windowMs: 60_000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة على لوحة الإدارة" },
  skip: () => process.env.NODE_ENV !== "production",
});
router.use(adminLimiter);

export interface AdminRecord {
  id: number;
  role: string;
  isOwner: boolean;
  permissions: string[];
}

export async function getAdminRecord(userId: number): Promise<AdminRecord | null> {
  if (!userId || isNaN(userId)) return null;
  if (userId === OWNER_ID) return { id: userId, role: "owner", isOwner: true, permissions: ["*"] };

  const ownerSetting = await db.select().from(botSettingsTable).where(eq(botSettingsTable.key, "owner_telegram_id")).limit(1);
  if (ownerSetting.length > 0 && parseInt(ownerSetting[0].value) === userId) {
    return { id: userId, role: "owner", isOwner: true, permissions: ["*"] };
  }

  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.id, userId)).limit(1);
  if (admin) return { id: userId, role: admin.role, isOwner: false, permissions: admin.permissions || [] };

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (user?.username && user.username.replace(/^@/, "").toLowerCase() === OWNER_USERNAME.toLowerCase()) {
    return { id: userId, role: "owner", isOwner: true, permissions: ["*"] };
  }
  return null;
}

export function hasPermission(admin: AdminRecord | undefined, perm: AdminPermission | "*"): boolean {
  if (!admin) return false;
  if (admin.isOwner || admin.permissions?.includes("*")) return true;
  return admin.permissions?.includes(perm);
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

// ── Authentication & Authorization Gate ──────────────────────────────────────
router.use(async (req: Request, res: Response, next: NextFunction) => {
  const { requireSession } = await import("../middlewares/requireSession");
  requireSession(req, res, async () => {
    const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
    const userId = sessionReq.sessionUserId;
    if (!userId || isNaN(userId) || userId <= 0) {
      res.status(401).json({ error: "Unauthorized: No valid session" });
      return;
    }
    const admin = await getAdminRecord(userId);
    if (!admin) {
      res.status(403).json({ error: "Forbidden: Admin access required" });
      return;
    }
    (req as unknown as { adminUser: AdminRecord }).adminUser = admin;
    next();
  });
});

// Check Admin Status
router.get("/check", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  res.json({
    isAdmin: true,
    role: adminUser.role,
    isOwner: adminUser.isOwner,
    permissions: adminUser.permissions,
  });
});

// ============================================================================
// SECTION 1 — الإدارة العامة (GENERAL ADMINISTRATION)
// ============================================================================

// 1. Statistics
router.get("/stats", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canViewStats")) {
    res.status(403).json({ error: "Forbidden: Insufficient permissions to view stats" });
    return;
  }

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
        .where(sql`time_zone IS NOT NULL AND time_zone != '' AND time_zone != 'Unknown'`)
        .groupBy(deviceFingerprintsTable.timeZone)
        .orderBy(desc(count()))
        .limit(8),
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

// 2. Broadcast Message
router.post("/broadcast", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canBroadcast")) {
    res.status(403).json({ error: "Forbidden: No permission to broadcast" });
    return;
  }

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

  res.json({ ok: true, queued: true, totalUsers: total, message: "جاري إرسال الرسالة إلى " + total + " مستخدم..." });

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
            if (entities && Array.isArray(entities) && entities.length > 0) {
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
      await new Promise((r) => setTimeout(r, 65));
    }

    await logAudit(adminUser.id, "broadcast", {
      messagePreview: message.slice(0, 100),
      totalUsers: total,
      sentCount,
      failedCount,
      blockedCount,
    });
  })().catch((err) => logger.error({ err }, "Broadcast background process error"));
});

// 3. Settings & Maintenance Mode
router.get("/settings", async (_req, res) => {
  const rows = await db.select().from(botSettingsTable);
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

router.put("/settings", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageSettings")) {
    res.status(403).json({ error: "Forbidden: No permission to manage settings" });
    return;
  }

  const { key, value } = req.body;
  if (!key || typeof key !== "string" || key.length > 100) {
    res.status(400).json({ error: "Invalid setting key" });
    return;
  }

  const strVal = String(value ?? "");

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

  await logAudit(adminUser.id, "update_setting", { key, value: strVal });

  res.json({ ok: true, key, value: strVal });
});

// 4. Welcome Message (Edit & Preview)
router.get("/welcome-message", async (_req, res) => {
  const val = await getSetting("welcome_message");
  res.json({ welcomeMessage: val || "" });
});

router.put("/welcome-message", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageSettings")) {
    res.status(403).json({ error: "Forbidden: No permission to update welcome message" });
    return;
  }

  const { message } = req.body;
  const strVal = String(message || "").trim();

  await db
    .insert(botSettingsTable)
    .values({ key: "welcome_message", value: strVal })
    .onConflictDoUpdate({ target: botSettingsTable.key, set: { value: strVal } });

  invalidateSetting("welcome_message");
  await logAudit(adminUser.id, "update_welcome_message", { messagePreview: strVal.slice(0, 100) });

  res.json({ ok: true, welcomeMessage: strVal });
});

// 5. Admin / Moderator Management
router.get("/admins", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageAdmins")) {
    res.status(403).json({ error: "Forbidden: No permission to view admin list" });
    return;
  }

  const admins = await db.select().from(adminsTable).orderBy(adminsTable.addedAt);
  res.json(admins);
});

router.post("/admins", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageAdmins")) {
    res.status(403).json({ error: "Forbidden: No permission to add admins" });
    return;
  }

  const { id, username, role, permissions } = req.body;
  const numId = parseInt(id);
  if (isNaN(numId) || numId <= 0) {
    res.status(400).json({ error: "Invalid Telegram ID" });
    return;
  }

  if (numId === OWNER_ID) {
    res.status(400).json({ error: "Owner account cannot be modified via admin create" });
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

  await logAudit(adminUser.id, "add_admin", { targetAdminId: numId, role: adminRole, permissions: perms }, numId);

  res.json(admin);
});

router.put("/admins/:id", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageAdmins")) {
    res.status(403).json({ error: "Forbidden: No permission to update admins" });
    return;
  }

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
  if (perms !== undefined) updates.permissions = perms;
  if (role !== undefined) updates.role = role === "owner" ? "admin" : role;

  const [updated] = await db.update(adminsTable).set(updates).where(eq(adminsTable.id, targetId)).returning();
  if (!updated) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }

  await logAudit(adminUser.id, "update_admin", { targetAdminId: targetId, updates }, targetId);
  res.json(updated);
});

router.delete("/admins/:id", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageAdmins")) {
    res.status(403).json({ error: "Forbidden: No permission to remove admins" });
    return;
  }

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
  await logAudit(adminUser.id, "remove_admin", { targetAdminId: targetId }, targetId);
  res.json({ ok: true, success: true });
});

// 6. Required Channels Management
router.get("/channels", async (_req, res) => {
  const raw = await getSetting("required_channels");
  try {
    const list = raw ? JSON.parse(raw) : [];
    res.json(list);
  } catch {
    res.json([]);
  }
});

router.post("/channels", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageChannels")) {
    res.status(403).json({ error: "Forbidden: No permission to manage channels" });
    return;
  }

  const { username, title, inviteLink, mandatory } = req.body;
  if (!username) {
    res.status(400).json({ error: "Channel username is required" });
    return;
  }

  const cleanUser = String(username).replace(/^@/, "").trim();
  const raw = await getSetting("required_channels");
  let list: Array<{ username: string; title: string; inviteLink: string; mandatory?: boolean }> = [];
  try { list = raw ? JSON.parse(raw) : []; } catch { list = []; }

  const existingIdx = list.findIndex((c) => c.username.toLowerCase() === cleanUser.toLowerCase());
  const newEntry = {
    username: cleanUser,
    title: title || cleanUser,
    inviteLink: inviteLink || `https://t.me/${cleanUser}`,
    mandatory: mandatory !== false,
  };

  if (existingIdx >= 0) {
    list[existingIdx] = newEntry;
  } else {
    list.push(newEntry);
  }

  const jsonStr = JSON.stringify(list);
  await db.insert(botSettingsTable)
    .values({ key: "required_channels", value: jsonStr })
    .onConflictDoUpdate({ target: botSettingsTable.key, set: { value: jsonStr } });

  clearAllSubCache();
  invalidateSetting("required_channels");
  await logAudit(adminUser.id, "save_required_channel", { channel: newEntry });

  res.json({ ok: true, channels: list });
});

router.delete("/channels/:username", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageChannels")) {
    res.status(403).json({ error: "Forbidden: No permission to manage channels" });
    return;
  }

  const cleanUser = String(req.params.username).replace(/^@/, "").trim().toLowerCase();
  const raw = await getSetting("required_channels");
  let list: Array<{ username: string; title: string; inviteLink: string; mandatory?: boolean }> = [];
  try { list = raw ? JSON.parse(raw) : []; } catch { list = []; }

  list = list.filter((c) => c.username.toLowerCase() !== cleanUser);
  const jsonStr = JSON.stringify(list);

  await db.insert(botSettingsTable)
    .values({ key: "required_channels", value: jsonStr })
    .onConflictDoUpdate({ target: botSettingsTable.key, set: { value: jsonStr } });

  clearAllSubCache();
  invalidateSetting("required_channels");
  await logAudit(adminUser.id, "remove_required_channel", { channel: cleanUser });

  res.json({ ok: true, channels: list });
});

// Audit Logs Viewer
router.get("/audit-logs", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit)) || 50, 150);
  const logs = await db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(limit);
  res.json(logs);
});

// ============================================================================
// SECTION 2 — التعدين (MINING RATE)
// ============================================================================

router.post("/mining/rate", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageSettings")) {
    res.status(403).json({ error: "Forbidden: No permission to modify mining rate" });
    return;
  }

  const { rate } = req.body;
  const numRate = parseFloat(rate);
  if (isNaN(numRate) || numRate <= 0 || numRate > 1.0) {
    res.status(400).json({ error: "Mining rate must be a valid positive number between 0.001 (0.1%) and 1.00 (100%)" });
    return;
  }

  const strRate = numRate.toFixed(4);
  await db
    .insert(botSettingsTable)
    .values({ key: "global_mining_rate", value: strRate })
    .onConflictDoUpdate({ target: botSettingsTable.key, set: { value: strRate } });

  invalidateSetting("global_mining_rate");
  await logAudit(adminUser.id, "update_mining_rate", { rate: strRate, percentage: (numRate * 100).toFixed(2) + "%" });

  res.json({ ok: true, rate: strRate, percentage: (numRate * 100).toFixed(2) + "%" });
});

// ============================================================================
// SECTION 3 — المالية والمحفظة (FINANCE & WALLET)
// ============================================================================

// 1. Withdrawals
router.get("/withdrawals", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageWithdrawals")) {
    res.status(403).json({ error: "Forbidden: No permission to view withdrawals" });
    return;
  }

  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search).trim() : undefined;
  const limit = Math.min(parseInt(String(req.query.limit)) || 100, 200);

  let query = db
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
    .$dynamic();

  const conditions = [];
  if (status) {
    conditions.push(eq(withdrawalsTable.status, status));
  }
  if (search) {
    const num = parseInt(search);
    if (!isNaN(num)) {
      conditions.push(or(eq(withdrawalsTable.userId, num), eq(withdrawalsTable.id, num)));
    } else {
      conditions.push(or(ilike(usersTable.username, `%${search.replace(/^@/, "")}%`), ilike(withdrawalsTable.walletAddress, `%${search}%`)));
    }
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const list = await query.orderBy(desc(withdrawalsTable.createdAt)).limit(limit);
  res.json(list);
});

router.post("/withdrawals/:id/action", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageWithdrawals")) {
    res.status(403).json({ error: "Forbidden: No permission to manage withdrawals" });
    return;
  }

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

    await logAudit(adminUser.id, "approve_withdrawal", { withdrawalId: wId, amount: wd.amount, currency: wd.currency }, wd.userId);
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

    await logAudit(adminUser.id, "reject_withdrawal", { withdrawalId: wId, amount: wd.amount, currency: wd.currency, reason }, wd.userId);
  }

  res.json({ ok: true, success: true });
});

// 2. Deposits
router.get("/deposits", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageDeposits")) {
    res.status(403).json({ error: "Forbidden: No permission to view deposits" });
    return;
  }

  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search).trim() : undefined;
  const limit = Math.min(parseInt(String(req.query.limit)) || 100, 200);

  let query = db
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
      lastName: usersTable.lastName,
    })
    .from(depositsTable)
    .leftJoin(usersTable, eq(depositsTable.userId, usersTable.id))
    .$dynamic();

  const conditions = [];
  if (status) {
    conditions.push(eq(depositsTable.status, status));
  }
  if (search) {
    const num = parseInt(search);
    if (!isNaN(num)) {
      conditions.push(eq(depositsTable.userId, num));
    } else {
      conditions.push(or(ilike(usersTable.username, `%${search.replace(/^@/, "")}%`), ilike(depositsTable.txHash, `%${search}%`)));
    }
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const list = await query.orderBy(desc(depositsTable.createdAt)).limit(limit);
  res.json(list);
});

// 3. Deposit Wallet Address
router.put("/deposit-wallet", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageWallet")) {
    res.status(403).json({ error: "Forbidden: No permission to manage wallet" });
    return;
  }

  const { address } = req.body;
  if (!address || typeof address !== "string" || address.trim().length < 10) {
    res.status(400).json({ error: "Invalid deposit wallet address" });
    return;
  }

  const cleanAddr = address.trim();
  await db
    .insert(botSettingsTable)
    .values({ key: "deposit_wallet_address", value: cleanAddr })
    .onConflictDoUpdate({ target: botSettingsTable.key, set: { value: cleanAddr } });

  invalidateSetting("deposit_wallet_address");
  await logAudit(adminUser.id, "update_deposit_wallet_address", { address: cleanAddr });

  res.json({ ok: true, address: cleanAddr });
});

// 4. Financial Limits
router.get("/limits", async (_req, res) => {
  const [minWd, maxWd, dailyWd, minDep, maxDep, dailyDep] = await Promise.all([
    getSetting("min_withdrawal"),
    getSetting("max_withdrawal"),
    getSetting("daily_withdrawal_limit"),
    getSetting("min_deposit"),
    getSetting("max_deposit"),
    getSetting("daily_deposit_limit"),
  ]);

  res.json({
    minWithdrawal: minWd || "0.2",
    maxWithdrawal: maxWd || "10000",
    dailyWithdrawalLimit: dailyWd || "1000",
    minDeposit: minDep || "0.1",
    maxDeposit: maxDep || "50000",
    dailyDepositLimit: dailyDep || "10000",
  });
});

router.put("/limits", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageSettings")) {
    res.status(403).json({ error: "Forbidden: No permission to manage limits" });
    return;
  }

  const { minWithdrawal, maxWithdrawal, dailyWithdrawalLimit, minDeposit, maxDeposit, dailyDepositLimit } = req.body;
  const updates: Record<string, string> = {
    min_withdrawal: String(minWithdrawal || "0.2"),
    max_withdrawal: String(maxWithdrawal || "10000"),
    daily_withdrawal_limit: String(dailyWithdrawalLimit || "1000"),
    min_deposit: String(minDeposit || "0.1"),
    max_deposit: String(maxDeposit || "50000"),
    daily_deposit_limit: String(dailyDepositLimit || "10000"),
  };

  for (const [k, v] of Object.entries(updates)) {
    await db.insert(botSettingsTable).values({ key: k, value: v }).onConflictDoUpdate({ target: botSettingsTable.key, set: { value: v } });
    invalidateSetting(k);
  }

  await logAudit(adminUser.id, "update_financial_limits", updates);
  res.json({ ok: true, limits: updates });
});

// 5. Reset GO Balances
router.post("/reset-go-balances", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!adminUser.isOwner) {
    res.status(403).json({ error: "Forbidden: Only Owner can reset all GO balances" });
    return;
  }

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
      adminId: adminUser.id,
      action: "reset_all_go_balances",
      details: { affectedUsers: totalUsers },
    });
  });

  res.json({ ok: true, success: true, affectedUsers: totalUsers });
});

// 6. Reset GRAM Balances
router.post("/reset-gram-balances", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!adminUser.isOwner) {
    res.status(403).json({ error: "Forbidden: Only Owner can reset all GRAM balances" });
    return;
  }

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
      adminId: adminUser.id,
      action: "reset_all_gram_balances",
      details: { affectedUsers: totalUsers },
    });
  });

  res.json({ ok: true, success: true, affectedUsers: totalUsers });
});

// ============================================================================
// SECTION 4 — المهام والمكافآت (TASKS & REWARDS)
// ============================================================================

// 1. Tasks
router.get("/tasks", async (_req, res) => {
  const tasks = await db.select().from(tasksTable).orderBy(asc(tasksTable.id));
  res.json(tasks);
});

router.post("/tasks", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageTasks")) {
    res.status(403).json({ error: "Forbidden: No permission to create tasks" });
    return;
  }

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
  await logAudit(adminUser.id, "create_task", { taskId: task.id, title: task.title });

  res.json(task);
});

router.put("/tasks/:id", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageTasks")) {
    res.status(403).json({ error: "Forbidden: No permission to update tasks" });
    return;
  }

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
  await logAudit(adminUser.id, "update_task", { taskId: id, updates });

  res.json(task);
});

router.delete("/tasks/:id", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageTasks")) {
    res.status(403).json({ error: "Forbidden: No permission to delete tasks" });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid task id" });
    return;
  }

  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  invalidateTasksCache();
  await logAudit(adminUser.id, "delete_task", { taskId: id });

  res.json({ ok: true, success: true });
});

// 2. Contests
router.get("/contests", async (_req, res) => {
  const list = await db.select().from(contestsTable).orderBy(desc(contestsTable.createdAt));
  res.json(list);
});

router.post("/contests", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageTasks")) {
    res.status(403).json({ error: "Forbidden: No permission to create contests" });
    return;
  }

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

  await logAudit(adminUser.id, "create_contest", { contestId: contest.id, title: contest.title });
  res.json(contest);
});

router.post("/contests/:id/finalize", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageTasks")) {
    res.status(403).json({ error: "Forbidden: No permission to finalize contests" });
    return;
  }

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
    .where(eq(usersTable.isVisible, true))
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

  await logAudit(adminUser.id, "finalize_contest", { contestId: id, winnersCount: winnersList.length });
  res.json({ ok: true, contestId: id, winners: winnersList });
});

// 3. Daily Combo Admin
router.get("/combo/stats", async (_req, res) => {
  const todayStr = getTodayDateString();
  const todayCombo = await getOrCreateTodayCombo(todayStr);

  const [attemptsRes, successRes, recentAttemptsRows] = await Promise.all([
    db.select({ count: count() }).from(userComboAttemptsTable).where(eq(userComboAttemptsTable.comboDate, todayStr)),
    db.select({ count: count() }).from(userComboAttemptsTable).where(and(eq(userComboAttemptsTable.comboDate, todayStr), eq(userComboAttemptsTable.isSuccess, true))),
    db
      .select({
        id: userComboAttemptsTable.id,
        userId: userComboAttemptsTable.userId,
        selectedItems: userComboAttemptsTable.selectedItems,
        isSuccess: userComboAttemptsTable.isSuccess,
        rewardAmount: userComboAttemptsTable.rewardAmount,
        createdAt: userComboAttemptsTable.createdAt,
        username: usersTable.username,
        firstName: usersTable.firstName,
      })
      .from(userComboAttemptsTable)
      .leftJoin(usersTable, eq(userComboAttemptsTable.userId, usersTable.id))
      .where(eq(userComboAttemptsTable.comboDate, todayStr))
      .orderBy(desc(userComboAttemptsTable.id))
      .limit(20),
  ]);

  const itemsMap: Record<number, typeof comboItems[number]> = {};
  for (const it of comboItems) itemsMap[it.id] = it;

  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);

  res.json({
    todayDate: todayStr,
    startsAt: todayStr + "T00:00:00.000Z",
    expiresAt: tomorrow.toISOString(),
    combo: todayCombo ? {
      item1: itemsMap[todayCombo.item1] || { id: todayCombo.item1, name: "Item " + todayCombo.item1, image: "/combo/combo_1.png", description: "" },
      item2: itemsMap[todayCombo.item2] || { id: todayCombo.item2, name: "Item " + todayCombo.item2, image: "/combo/combo_2.png", description: "" },
      item3: itemsMap[todayCombo.item3] || { id: todayCombo.item3, name: "Item " + todayCombo.item3, image: "/combo/combo_3.png", description: "" },
      rewardAmount: "5.000000",
    } : null,
    totalAttemptsToday: attemptsRes[0]?.count || 0,
    successfulSolvesToday: successRes[0]?.count || 0,
    totalRewardsDistributed: ((successRes[0]?.count || 0) * 5) + " GO",
    allItems: comboItems,
    recentAttempts: recentAttemptsRows.map(r => ({
      id: r.id,
      userId: r.userId,
      username: r.username,
      firstName: r.firstName,
      selectedItems: r.selectedItems || [],
      isSuccess: r.isSuccess,
      rewardAmount: r.rewardAmount,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

// 4. Daily Check-in Settings
router.get("/checkin/settings", async (_req, res) => {
  const row = await getSetting("daily_checkin_rewards");
  const defaultRewards: Record<number, number> = {
    1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 8, 7: 8, 8: 9, 9: 9, 10: 10,
  };
  try {
    const rewards = row ? JSON.parse(row) : defaultRewards;
    res.json(rewards);
  } catch {
    res.json(defaultRewards);
  }
});

router.put("/checkin/settings", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageCheckin")) {
    res.status(403).json({ error: "Forbidden: No permission to update check-in rewards" });
    return;
  }

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
  await logAudit(adminUser.id, "update_checkin_rewards", { rewards });

  res.json({ ok: true, rewards });
});

// ============================================================================
// SECTION 5 — المستخدمين والأمان (USERS & SECURITY)
// ============================================================================

// 1. User Management & Search
router.get("/users", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageUsers")) {
    res.status(403).json({ error: "Forbidden: No permission to view users" });
    return;
  }

  const search = req.query.search ? String(req.query.search).trim() : "";
  const limit = Math.min(parseInt(String(req.query.limit)) || 50, 100);
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

  let query = db.select().from(usersTable).$dynamic();

  if (search) {
    const num = parseInt(search);
    if (!isNaN(num)) {
      query = query.where(or(eq(usersTable.id, num), eq(usersTable.referredBy, num)));
    } else {
      const clean = search.replace(/^@/, "");
      query = query.where(or(ilike(usersTable.username, `%${clean}%`), ilike(usersTable.firstName, `%${clean}%`)));
    }
  }

  const users = await query.orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset);
  res.json(users);
});

router.get("/users/:id", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageUsers")) {
    res.status(403).json({ error: "Forbidden: No permission to view user details" });
    return;
  }

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

  const [transactions, referrals, withdrawals, deposits, fingerprints, completedTasks, userBan] = await Promise.all([
    db.select().from(transactionsTable).where(eq(transactionsTable.userId, id)).orderBy(desc(transactionsTable.createdAt)).limit(25),
    db.select().from(referralsTable).where(eq(referralsTable.referrerId, id)).limit(25),
    db.select().from(withdrawalsTable).where(eq(withdrawalsTable.userId, id)).orderBy(desc(withdrawalsTable.createdAt)).limit(25),
    db.select().from(depositsTable).where(eq(depositsTable.userId, id)).orderBy(desc(depositsTable.createdAt)).limit(25),
    db.select().from(deviceFingerprintsTable).where(eq(deviceFingerprintsTable.userId, id)).orderBy(desc(deviceFingerprintsTable.lastSeenAt)).limit(10),
    db.select().from(userTasksTable).where(eq(userTasksTable.userId, id)),
    db.select().from(bansTable).where(and(eq(bansTable.userId, id), eq(bansTable.isActive, true))).limit(1),
  ]);

  let inviter = null;
  if (user.referredBy) {
    const [inv] = await db.select({ id: usersTable.id, username: usersTable.username, firstName: usersTable.firstName }).from(usersTable).where(eq(usersTable.id, user.referredBy)).limit(1);
    if (inv) inviter = inv;
  }

  const totalDeposited = deposits
    .filter(d => d.status === "confirmed")
    .reduce((acc, d) => acc + (parseFloat(d.amount) || 0), 0)
    .toFixed(4);

  const totalWithdrawn = withdrawals
    .filter(w => w.status === "approved")
    .reduce((acc, w) => acc + (parseFloat(w.amount) || 0), 0)
    .toFixed(4);

  res.json({
    user,
    inviter,
    transactions,
    referralsCount: referrals.length,
    referrals,
    withdrawals,
    deposits,
    fingerprints,
    tasksCompletedCount: completedTasks.length,
    totalDeposited,
    totalWithdrawn,
    isBanned: user.isVisible === false || Boolean(userBan && userBan.length > 0),
    isWithdrawalBanned: user.isWithdrawalBanned,
    banReason: userBan && userBan[0]?.reason ? userBan[0].reason : null,
  });
});


// Balance Addition / Deduction / Correction
router.post("/users/:id/balance", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageUsers")) {
    res.status(403).json({ error: "Forbidden: No permission to adjust balances" });
    return;
  }

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
      details: { previousBalance: prevBal, newBalance: newBal, reason, adminId: adminUser.id },
    });

    await tx.insert(auditLogsTable).values({
      adminId: adminUser.id,
      action: "balance_" + type,
      targetUserId: targetId,
      details: { currency, previousBalance: prevBal, newBalance: newBal, diff, reason },
    });
  });

  res.json({ ok: true, success: true, targetId, previousBalance: prevBal, newBalance: newBal, diff });
});

// Send Message / Warning
router.post("/users/:id/message", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canWarn") && !hasPermission(adminUser, "canManageUsers")) {
    res.status(403).json({ error: "Forbidden: No permission to message users" });
    return;
  }

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
    await logAudit(adminUser.id, isWarning ? "send_warning" : "send_message", { targetUserId: targetId, messagePreview: message.slice(0, 80) }, targetId);
    res.json({ ok: true, success: true });
  } catch (err: unknown) {
    res.status(400).json({ error: "Failed to send message via Telegram: " + (err instanceof Error ? err.message : String(err)) });
  }
});

// Ban & Unban User
router.post("/users/:id/ban", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canBanUsers")) {
    res.status(403).json({ error: "Forbidden: No permission to ban users" });
    return;
  }

  const targetId = parseInt(req.params.id);
  const { reason } = req.body;

  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({ isVisible: false }).where(eq(usersTable.id, targetId));
    await tx.insert(bansTable).values({
      userId: targetId,
      reason: reason || "Banned by administrator",
      bannedBy: String(adminUser.id),
      isActive: true,
    });
  });

  await logAudit(adminUser.id, "ban_user", { targetUserId: targetId, reason }, targetId);
  res.json({ ok: true, banned: true });
});

router.post("/users/:id/unban", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canUnban")) {
    res.status(403).json({ error: "Forbidden: No permission to unban users" });
    return;
  }

  const targetId = parseInt(req.params.id);

  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({ isVisible: true }).where(eq(usersTable.id, targetId));
    await tx.update(bansTable).set({ isActive: false }).where(eq(bansTable.userId, targetId));
  });

  await logAudit(adminUser.id, "unban_user", { targetUserId: targetId }, targetId);
  res.json({ ok: true, unbanned: true });
});

// IP Ban (Ban all accounts associated with the user's IP / fingerprint)
router.post("/users/:id/ip-ban", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canBanUsers")) {
    res.status(403).json({ error: "Forbidden: No permission to ban users" });
    return;
  }

  const targetId = parseInt(req.params.id);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const ipHash = user.ipHash;
  if (!ipHash) {
    // Fallback: ban this user only
    await db.update(usersTable).set({ isVisible: false }).where(eq(usersTable.id, targetId));
    await db.insert(bansTable).values({
      userId: targetId,
      reason: "Banned by administrator (single account, no IP record)",
      bannedBy: String(adminUser.id),
      isActive: true,
    });
    await logAudit(adminUser.id, "ip_ban_single", { targetUserId: targetId }, targetId);
    res.json({ ok: true, ipHash: null, affectedUsers: 1 });
    return;
  }

  // Find all users with this ipHash
  const matchingUsers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.ipHash, ipHash));
  const ids = matchingUsers.map(u => u.id);

  if (ids.length > 0) {
    await db.transaction(async (tx) => {
      for (const uid of ids) {
        await tx.update(usersTable).set({ isVisible: false, ipSuspicious: true }).where(eq(usersTable.id, uid));
        await tx.insert(bansTable).values({
          userId: uid,
          reason: `IP Cluster Ban (IP Hash: ${ipHash.slice(0, 8)}...)`,
          bannedBy: String(adminUser.id),
          isActive: true,
        });
      }
    });
  }

  await logAudit(adminUser.id, "ip_cluster_ban", { targetUserId: targetId, ipHash, affectedUsers: ids.length });
  res.json({ ok: true, ipHash, affectedUsers: ids.length });
});

// IP Unban (Unban all accounts associated with the user's IP / fingerprint)
router.post("/users/:id/ip-unban", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canUnban")) {
    res.status(403).json({ error: "Forbidden: No permission to unban users" });
    return;
  }

  const targetId = parseInt(req.params.id);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const ipHash = user.ipHash;
  if (!ipHash) {
    // Fallback: unban this user only
    await db.update(usersTable).set({ isVisible: true }).where(eq(usersTable.id, targetId));
    await db.update(bansTable).set({ isActive: false }).where(eq(bansTable.userId, targetId));
    await logAudit(adminUser.id, "ip_unban_single", { targetUserId: targetId }, targetId);
    res.json({ ok: true, ipHash: null, affectedUsers: 1 });
    return;
  }

  const matchingUsers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.ipHash, ipHash));
  const ids = matchingUsers.map(u => u.id);

  if (ids.length > 0) {
    await db.transaction(async (tx) => {
      for (const uid of ids) {
        await tx.update(usersTable).set({ isVisible: true, ipSuspicious: false }).where(eq(usersTable.id, uid));
        await tx.update(bansTable).set({ isActive: false }).where(eq(bansTable.userId, uid));
      }
    });
  }

  await logAudit(adminUser.id, "ip_cluster_unban", { targetUserId: targetId, ipHash, affectedUsers: ids.length });
  res.json({ ok: true, ipHash, affectedUsers: ids.length });
});

// Withdrawal Ban & Unban
router.post("/users/:id/withdrawal-ban", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageWithdrawals")) {
    res.status(403).json({ error: "Forbidden: No permission to ban withdrawals" });
    return;
  }

  const targetId = parseInt(req.params.id);
  await db.update(usersTable).set({ isWithdrawalBanned: true }).where(eq(usersTable.id, targetId));
  await logAudit(adminUser.id, "ban_withdrawals", { targetUserId: targetId }, targetId);
  res.json({ ok: true, isWithdrawalBanned: true });
});

router.post("/users/:id/withdrawal-unban", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageWithdrawals")) {
    res.status(403).json({ error: "Forbidden: No permission to unban withdrawals" });
    return;
  }

  const targetId = parseInt(req.params.id);
  await db.update(usersTable).set({ isWithdrawalBanned: false }).where(eq(usersTable.id, targetId));
  await logAudit(adminUser.id, "unban_withdrawals", { targetUserId: targetId }, targetId);
  res.json({ ok: true, isWithdrawalBanned: false });
});

// Delete Account (Safe deletion preserving historical transaction records)
router.delete("/users/:id", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!adminUser.isOwner) {
    res.status(403).json({ error: "Forbidden: Only Owner can delete user accounts" });
    return;
  }

  const targetId = parseInt(req.params.id);
  if (isNaN(targetId) || targetId === OWNER_ID) {
    res.status(400).json({ error: "Invalid target ID" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({
      isVisible: false,
      goBalance: "0.000000",
      gramBalance: "0.000000",
      tonBalance: "0.000000",
      balance: "0.000000",
    }).where(eq(usersTable.id, targetId));

    await tx.insert(bansTable).values({
      userId: targetId,
      reason: "Account deleted by administrator",
      bannedBy: String(adminUser.id),
      isActive: true,
    });
  });

  await logAudit(adminUser.id, "delete_user_account", { targetUserId: targetId }, targetId);
  res.json({ ok: true, success: true, targetId });
});

// 2. Auto Banned Accounts
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

// 3. Referral & Milestone Settings
router.get("/referral-settings", async (_req, res) => {
  const [baseReward, depositPct, threshold] = await Promise.all([
    getSetting("referral_reward_amount"),
    getSetting("referral_deposit_percent"),
    getSetting("referral_threshold"),
  ]);

  res.json({
    referralRewardAmount: baseReward || "3",
    referralDepositPercent: depositPct || "10",
    referralThreshold: threshold || "5",
  });
});

router.put("/referral-settings", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageSettings")) {
    res.status(403).json({ error: "Forbidden: No permission to update referral settings" });
    return;
  }

  const { referralRewardAmount, referralDepositPercent, referralThreshold } = req.body;
  const updates: Record<string, string> = {
    referral_reward_amount: String(referralRewardAmount || "3"),
    referral_deposit_percent: String(referralDepositPercent || "10"),
    referral_threshold: String(referralThreshold || "5"),
  };

  for (const [k, v] of Object.entries(updates)) {
    await db.insert(botSettingsTable).values({ key: k, value: v }).onConflictDoUpdate({ target: botSettingsTable.key, set: { value: v } });
    invalidateSetting(k);
  }

  await logAudit(adminUser.id, "update_referral_settings", updates);
  res.json({ ok: true, settings: updates });
});

router.get("/milestones", async (_req, res) => {
  const list = await db.select().from(milestonesTable).orderBy(asc(milestonesTable.requiredReferrals));
  res.json(list);
});

router.post("/milestones", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageSettings")) {
    res.status(403).json({ error: "Forbidden: No permission to create milestones" });
    return;
  }

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

  await logAudit(adminUser.id, "create_milestone", { milestoneId: milestone.id, requiredReferrals: reqRefs, rewardAmount: amt });
  res.json(milestone);
});

router.delete("/milestones/:id", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!hasPermission(adminUser, "canManageSettings")) {
    res.status(403).json({ error: "Forbidden: No permission to delete milestones" });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid milestone id" });
    return;
  }

  await db.delete(milestonesTable).where(eq(milestonesTable.id, id));
  await logAudit(adminUser.id, "delete_milestone", { milestoneId: id });
  res.json({ ok: true, success: true });
});

// 4. Security Events
router.get("/security/events", async (_req, res) => {
  const events = await db.select().from(securityEventsTable).orderBy(desc(securityEventsTable.createdAt)).limit(50);
  res.json(events);
});

// 5. Payment Wallet Keys & API Keys (Masked Info & Key Updates)
router.get("/wallet-keys", async (_req, res) => {
  const configured = await isTonConfigured();
  const address = await getWalletAddress().catch(() => null);

  const maskedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-6)}`
    : "Not Configured";

  const dbMnemonic = await getSetting("ton_wallet_mnemonic");
  const dbApiKey = await getSetting("ton_api_key");

  res.json({
    tonWalletConfigured: configured,
    maskedWalletAddress: maskedAddress,
    hasTelegramBotToken: Boolean(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN),
    hasNeonDatabaseUrl: Boolean(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL),
    hasCustomMnemonic: Boolean(dbMnemonic),
    hasCustomApiKey: Boolean(dbApiKey),
    securityStatus: "SECURE_MASKED",
  });
});

router.put("/wallet-keys", async (req, res) => {
  const adminUser = (req as unknown as { adminUser: AdminRecord }).adminUser;
  if (!adminUser.isOwner && !hasPermission(adminUser, "canManageWallet") && !hasPermission(adminUser, "canManageApiSettings")) {
    res.status(403).json({ error: "Forbidden: No permission to update wallet keys" });
    return;
  }

  const { mnemonic, apiKey, endpoint } = req.body;
  const updates: Record<string, string> = {};

  if (mnemonic !== undefined) {
    const cleanMnemonic = String(mnemonic).trim();
    if (cleanMnemonic) {
      const words = cleanMnemonic.split(/\s+/);
      if (words.length < 12) {
        res.status(400).json({ error: "Invalid mnemonic phrase (must be 12 or 24 words)" });
        return;
      }
      updates["ton_wallet_mnemonic"] = cleanMnemonic;
    }
  }

  if (apiKey !== undefined) {
    updates["ton_api_key"] = String(apiKey).trim();
  }

  if (endpoint !== undefined) {
    updates["ton_endpoint"] = String(endpoint).trim();
  }

  for (const [k, v] of Object.entries(updates)) {
    await db.insert(botSettingsTable).values({ key: k, value: v }).onConflictDoUpdate({ target: botSettingsTable.key, set: { value: v } });
    invalidateSetting(k);
  }

  await logAudit(adminUser.id, "update_wallet_keys", {
    keysUpdated: Object.keys(updates),
    hasMnemonic: Boolean(updates["ton_wallet_mnemonic"]),
    hasApiKey: Boolean(updates["ton_api_key"]),
  });

  res.json({ ok: true, message: "تم تحديث مفاتيح المحفظة والـ API بنجاح ✅" });
});

export default router;

