import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import {
  tasksTable,
  userTasksTable,
  taskSubmissionsTable,
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
  minersTable,
  promoCodesTable,
  adminLoginAttemptsTable,
  comboItems,
  AdminPermission,
} from "@workspace/db/schema";
import { eq, count, sql, and, or, ilike, desc, asc, sum, gte } from "drizzle-orm";
import { invalidateTasksCache } from "./tasks";
import { getBot } from "../bot";
import { getChannelPhotoUrl } from "../bot/admin";
import { setBotEnabled, clearBotEnabledCache, isBotEnabled } from "../bot/control";
import { clearAllSubCache } from "../bot/subscription";
import { getSetting, invalidateSetting } from "../lib/settingsCache";
import { getWalletAddress, isTonConfigured } from "../lib/tonSender";
import { executeAutoWithdrawal } from "../lib/withdrawalProcessor";
import { logger } from "../lib/logger";
import { getOrCreateTodayCombo, getTodayDateString } from "./combo";
import {
  requireAdminAuth,
  requireAdminPerm,
  AdminRequest,
} from "../middlewares/requireAdminAuth";
import {
  getAdminAuth,
  isUserAdmin,
  logAdminAudit,
} from "../lib/adminSecurity";
import { startBroadcast, cancelBroadcast, getBroadcastProgress } from "../bot/broadcast";
import { processWithdrawalVote } from "../bot/consensus";

const router = Router();

// Rate limiter for admin routes
const adminLimiter = rateLimit({
  windowMs: 60_000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة على لوحة الإدارة" },
  skip: () => process.env.NODE_ENV !== "production",
});
router.use(adminLimiter);

// ── Protect all admin routes directly ──────────────────────────────────────
router.use(requireAdminAuth);

// ── 1. UNLOCK / STATUS / CHECK ──────────────────────────────────────────────
router.post("/unlock", async (_req: AdminRequest, res: Response) => {
  res.json({ ok: true, unlocked: true });
});

router.get("/check", async (req: AdminRequest, res: Response) => {
  const admin = req.adminUser!;
  res.json({
    isAdmin: true,
    isOwner: true,
    userId: admin.userId,
    username: admin.username,
    permissions: admin.permissions,
  });
});

router.get("/status", async (req: AdminRequest, res: Response) => {
  const admin = req.adminUser!;
  res.json({
    ok: true,
    unlocked: true,
    admin,
  });
});

// ── 3. STATS MODULE ─────────────────────────────────────────────────────────
router.get("/stats", requireAdminPerm("canViewStats"), async (req: AdminRequest, res: Response) => {
  try {
    const now = new Date();
    const active15mAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const active24hAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalUsersRes,
      activeNowRes,
      active24hRes,
      bannedRes,
      autoBannedRes,
      balancesRes,
      tonWithdrawnRes,
      pendingWdRes,
      timezonesRes,
    ] = await Promise.all([
      db.select({ count: count() }).from(usersTable),
      db.select({ count: count() }).from(usersTable).where(gte(usersTable.lastMiningAt, active15mAgo)),
      db.select({ count: count() }).from(usersTable).where(gte(usersTable.lastMiningAt, active24hAgo)),
      db.select({ count: count() }).from(usersTable).where(eq(usersTable.isVisible, false)),
      db.select({ count: count() }).from(bansTable).where(and(eq(bansTable.bannedBy, "system"), eq(bansTable.isActive, true))),
      db.select({ totalGo: sum(usersTable.goBalance), totalGram: sum(usersTable.gramBalance) }).from(usersTable),
      db.select({ totalTon: sum(withdrawalsTable.amount) }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "approved")),
      db.select({ count: count() }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "pending")),
      db.select({ timeZone: deviceFingerprintsTable.timeZone, count: count() })
        .from(deviceFingerprintsTable)
        .where(sql`time_zone IS NOT NULL AND time_zone != '' AND time_zone != 'Unknown'`)
        .groupBy(deviceFingerprintsTable.timeZone)
        .orderBy(desc(count()))
        .limit(8),
    ]);

    const totalUsers = totalUsersRes[0]?.count || 0;
    const countries = timezonesRes.map((tz) => ({
      region: tz.timeZone || "Unknown",
      count: tz.count,
      percentage: totalUsers > 0 ? ((tz.count / totalUsers) * 100).toFixed(1) : "0",
    }));

    res.json({
      totalUsers,
      activeNow: activeNowRes[0]?.count || 0,
      active24h: active24hRes[0]?.count || 0,
      bannedAccounts: bannedRes[0]?.count || 0,
      autoBannedAccounts: autoBannedRes[0]?.count || 0,
      totalGo: parseFloat(balancesRes[0]?.totalGo || "0").toFixed(2),
      totalGram: parseFloat(balancesRes[0]?.totalGram || "0").toFixed(6),
      totalTonWithdrawn: parseFloat(tonWithdrawnRes[0]?.totalTon || "0").toFixed(4),
      pendingWithdrawalsCount: pendingWdRes[0]?.count || 0,
      countries: countries.length > 0 ? countries : null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to load admin stats");
    res.status(500).json({ error: "Failed to compute stats" });
  }
});

// ── 4. TOP USERS & GRAM HOLDERS ─────────────────────────────────────────────
router.get("/top-holders", requireAdminPerm("canViewStats"), async (req: AdminRequest, res: Response) => {
  try {
    const topHolders = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        photoUrl: usersTable.photoUrl,
        gramBalance: usersTable.gramBalance,
        goBalance: usersTable.goBalance,
        tonBalance: usersTable.tonBalance,
        referralCount: usersTable.referralCount,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.isVisible, true))
      .orderBy(desc(usersTable.gramBalance))
      .limit(50);

    res.json(topHolders);
  } catch (err) {
    res.status(500).json({ error: "Failed to load top holders" });
  }
});

router.get("/top-referrers", requireAdminPerm("canViewStats"), async (req: AdminRequest, res: Response) => {
  try {
    const topRefs = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        photoUrl: usersTable.photoUrl,
        referralCount: usersTable.referralCount,
        gramBalance: usersTable.gramBalance,
        goBalance: usersTable.goBalance,
      })
      .from(usersTable)
      .where(eq(usersTable.isVisible, true))
      .orderBy(desc(usersTable.referralCount))
      .limit(50);

    res.json(topRefs);
  } catch (err) {
    res.status(500).json({ error: "Failed to load top referrers" });
  }
});

// ── 5. BROADCAST MODULE ─────────────────────────────────────────────────────
router.get("/broadcast/progress", requireAdminPerm("canBroadcast"), async (req: AdminRequest, res: Response) => {
  const progress = await getBroadcastProgress();
  res.json(progress || { status: "idle", totalUsers: 0, sentCount: 0 });
});

router.post("/broadcast", requireAdminPerm("canBroadcast"), async (req: AdminRequest, res: Response) => {
  const { message, entities, pin } = req.body;
  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "نص الرسالة مطلوب" });
    return;
  }

  const bot = getBot();
  if (!bot) {
    res.status(500).json({ error: "بوت تليجرام غير متصل حالياً" });
    return;
  }

  const result = await startBroadcast(bot, req.adminId!, message.trim(), entities, pin);
  if (!result.success) {
    res.status(400).json({ error: result.message });
    return;
  }

  res.json(result);
});

router.post("/broadcast/cancel", requireAdminPerm("canBroadcast"), async (req: AdminRequest, res: Response) => {
  const cancelled = await cancelBroadcast();
  if (cancelled) {
    await logAdminAudit(req.adminId!, "cancel_broadcast", {});
  }
  res.json({ ok: true, cancelled });
});

// ── 6. MAINTENANCE MODULE ───────────────────────────────────────────────────
router.get("/maintenance", async (_req: AdminRequest, res: Response) => {
  const enabled = await isBotEnabled();
  const customText = await getSetting("maintenance_message");
  res.json({
    maintenanceMode: !enabled,
    botEnabled: enabled,
    message: customText || "البوت تحت الصيانة حالياً",
  });
});

router.post("/maintenance", requireAdminPerm("canManageSettings"), async (req: AdminRequest, res: Response) => {
  const { enabled, message } = req.body;
  const isMaintenance = enabled === true;
  await setBotEnabled(!isMaintenance);
  clearBotEnabledCache();

  if (message) {
    await db
      .insert(botSettingsTable)
      .values({ key: "maintenance_message", value: String(message) })
      .onConflictDoUpdate({
        target: botSettingsTable.key,
        set: { value: String(message) },
      });
  }

  await logAdminAudit(req.adminId!, "update_maintenance_mode", { maintenanceMode: isMaintenance, message });
  res.json({ ok: true, maintenanceMode: isMaintenance });
});

// ── 7. MANUAL TRANSFERS / BALANCE ADJUSTMENT (MNX Send) ────────────────────
router.post("/transfer", requireAdminPerm("canManageWallet"), async (req: AdminRequest, res: Response) => {
  const { targetUserId, amount, currency, action, note } = req.body;
  const targetId = parseInt(String(targetUserId));
  const amountNum = parseFloat(String(amount));

  if (isNaN(targetId) || targetId <= 0 || isNaN(amountNum) || amountNum <= 0) {
    res.status(400).json({ error: "الآيدي والمبلغ يجب أن يكونا صحيحين" });
    return;
  }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!targetUser) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  const field = currency === "GRAM" ? "gramBalance" : currency === "TON" ? "tonBalance" : "goBalance";
  const isCredit = action !== "debit";

  if (isCredit) {
    if (currency === "GRAM") {
      await db.update(usersTable).set({ gramBalance: sql`COALESCE(gram_balance, 0) + ${amountNum}` }).where(eq(usersTable.id, targetId));
    } else if (currency === "TON") {
      await db.update(usersTable).set({ tonBalance: sql`COALESCE(ton_balance, 0) + ${amountNum}` }).where(eq(usersTable.id, targetId));
    } else {
      await db.update(usersTable).set({ goBalance: sql`COALESCE(go_balance, 0) + ${amountNum}`, balance: sql`COALESCE(balance, 0) + ${amountNum}` }).where(eq(usersTable.id, targetId));
    }
  } else {
    if (currency === "GRAM") {
      await db.update(usersTable).set({ gramBalance: sql`GREATEST(0, COALESCE(gram_balance, 0) - ${amountNum})` }).where(eq(usersTable.id, targetId));
    } else if (currency === "TON") {
      await db.update(usersTable).set({ tonBalance: sql`GREATEST(0, COALESCE(ton_balance, 0) - ${amountNum})` }).where(eq(usersTable.id, targetId));
    } else {
      await db.update(usersTable).set({ goBalance: sql`GREATEST(0, COALESCE(go_balance, 0) - ${amountNum})`, balance: sql`GREATEST(0, COALESCE(balance, 0) - ${amountNum})` }).where(eq(usersTable.id, targetId));
    }
  }

  await db.insert(transactionsTable).values({
    userId: targetId,
    type: isCredit ? "admin_credit" : "admin_debit",
    amount: String(amountNum),
    currency: currency || "GO",
    details: { adminId: req.adminId, note, action },
  });

  await logAdminAudit(
    req.adminId!,
    isCredit ? "admin_credit_balance" : "admin_debit_balance",
    { amount: amountNum, currency, note },
    targetId
  );

  const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  res.json({ ok: true, user: updated });
});

// ── 8. DEVICE VERIFY & ANTI-CHEAT ───────────────────────────────────────────
router.get("/device-verify", requireAdminPerm("canManageUsers"), async (_req: AdminRequest, res: Response) => {
  const bans = await db.select().from(bansTable).orderBy(desc(bansTable.bannedAt)).limit(50);
  const fingerprints = await db.select().from(deviceFingerprintsTable).orderBy(desc(deviceFingerprintsTable.lastSeenAt)).limit(50);
  res.json({ bans, fingerprints });
});

router.post("/device-verify/unban", requireAdminPerm("canUnban"), async (req: AdminRequest, res: Response) => {
  const { userId } = req.body;
  const targetId = parseInt(String(userId));
  if (isNaN(targetId) || targetId <= 0) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  await db.update(bansTable).set({ isActive: false }).where(eq(bansTable.userId, targetId));
  await db.update(usersTable).set({ isVisible: true, ipSuspicious: false }).where(eq(usersTable.id, targetId));
  await logAdminAudit(req.adminId!, "unban_device_fingerprint", {}, targetId);

  res.json({ ok: true });
});

// ── 9. WELCOME MESSAGE ──────────────────────────────────────────────────────
router.get("/welcome-message", async (_req: AdminRequest, res: Response) => {
  const welcome = await getSetting("welcome_message");
  res.json({ welcomeMessage: welcome || "" });
});

router.put("/welcome-message", requireAdminPerm("canManageSettings"), async (req: AdminRequest, res: Response) => {
  const { message } = req.body;
  const val = String(message || "").trim();
  await db
    .insert(botSettingsTable)
    .values({ key: "welcome_message", value: val })
    .onConflictDoUpdate({
      target: botSettingsTable.key,
      set: { value: val },
    });

  invalidateSetting("welcome_message");
  await logAdminAudit(req.adminId!, "update_welcome_message", { preview: val.slice(0, 100) });
  res.json({ ok: true, welcomeMessage: val });
});

// ── 10. TASKS & TASK SUBMISSIONS ────────────────────────────────────────────
router.get("/tasks", async (_req: AdminRequest, res: Response) => {
  const tasks = await db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt));
  res.json(tasks);
});

router.post("/tasks", requireAdminPerm("canManageTasks"), async (req: AdminRequest, res: Response) => {
  const { title, description, url, icon, rewardAmount, rewardCurrency, maxClaims, isActive } = req.body;
  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  const [newTask] = await db
    .insert(tasksTable)
    .values({
      title,
      description,
      url,
      icon: icon || "⭐",
      rewardAmount: String(rewardAmount || "5"),
      rewardCurrency: rewardCurrency || "GO",
      maxClaims: maxClaims ? parseInt(String(maxClaims)) : null,
      isActive: isActive !== false,
    })
    .returning();

  invalidateTasksCache();
  await logAdminAudit(req.adminId!, "create_task", { taskId: newTask.id, title });
  res.json(newTask);
});

router.delete("/tasks/:id", requireAdminPerm("canManageTasks"), async (req: AdminRequest, res: Response) => {
  const taskId = parseInt(String(req.params.id));
  await db.delete(tasksTable).where(eq(tasksTable.id, taskId));
  invalidateTasksCache();
  await logAdminAudit(req.adminId!, "delete_task", { taskId });
  res.json({ ok: true });
});

router.get("/tasks/submissions", requireAdminPerm("canManageTasks"), async (_req: AdminRequest, res: Response) => {
  const submissions = await db
    .select({
      id: taskSubmissionsTable.id,
      userId: taskSubmissionsTable.userId,
      taskId: taskSubmissionsTable.taskId,
      proof: taskSubmissionsTable.proof,
      status: taskSubmissionsTable.status,
      createdAt: taskSubmissionsTable.createdAt,
      taskTitle: tasksTable.title,
      rewardAmount: tasksTable.rewardAmount,
      rewardCurrency: tasksTable.rewardCurrency,
      username: usersTable.username,
      firstName: usersTable.firstName,
    })
    .from(taskSubmissionsTable)
    .leftJoin(tasksTable, eq(taskSubmissionsTable.taskId, tasksTable.id))
    .leftJoin(usersTable, eq(taskSubmissionsTable.userId, usersTable.id))
    .where(eq(taskSubmissionsTable.status, "pending"))
    .orderBy(desc(taskSubmissionsTable.createdAt));

  res.json(submissions);
});

router.post("/tasks/submissions/:id/review", requireAdminPerm("canManageTasks"), async (req: AdminRequest, res: Response) => {
  const subId = parseInt(String(req.params.id));
  const { action, reason } = req.body; // 'approve' | 'reject'

  const [submission] = await db
    .select()
    .from(taskSubmissionsTable)
    .where(eq(taskSubmissionsTable.id, subId))
    .limit(1);

  if (!submission) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  if (submission.status !== "pending") {
    res.status(400).json({ error: `Submission already ${submission.status}` });
    return;
  }

  if (action === "approve") {
    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, submission.taskId)).limit(1);
    const amount = task ? parseFloat(task.rewardAmount) : 5;

    await db.update(taskSubmissionsTable).set({
      status: "approved",
      reviewedBy: req.adminId,
      reviewedAt: new Date(),
    }).where(eq(taskSubmissionsTable.id, subId));

    if (task?.rewardCurrency === "Gram") {
      await db.update(usersTable).set({ gramBalance: sql`COALESCE(gram_balance, 0) + ${amount}` }).where(eq(usersTable.id, submission.userId));
    } else {
      await db.update(usersTable).set({ goBalance: sql`COALESCE(go_balance, 0) + ${amount}` }).where(eq(usersTable.id, submission.userId));
    }

    await logAdminAudit(req.adminId!, "approve_task_submission", { subId, taskId: submission.taskId, amount }, submission.userId);
  } else {
    await db.update(taskSubmissionsTable).set({
      status: "rejected",
      reviewedBy: req.adminId,
      reviewedAt: new Date(),
    }).where(eq(taskSubmissionsTable.id, subId));

    await logAdminAudit(req.adminId!, "reject_task_submission", { subId, taskId: submission.taskId, reason }, submission.userId);
  }

  res.json({ ok: true });
});

// ── 11. REFERRAL MILESTONES ─────────────────────────────────────────────────
router.get("/referrals/milestones", async (_req: AdminRequest, res: Response) => {
  const milestones = await db.select().from(milestonesTable).orderBy(asc(milestonesTable.requiredReferrals));
  res.json(milestones);
});

router.post("/referrals/milestones", requireAdminPerm("canManageSettings"), async (req: AdminRequest, res: Response) => {
  const { requiredReferrals, rewardAmount, rewardCurrency, isRepeatable, isActive } = req.body;
  const [created] = await db
    .insert(milestonesTable)
    .values({
      requiredReferrals: parseInt(String(requiredReferrals)),
      rewardAmount: String(rewardAmount),
      rewardCurrency: rewardCurrency || "GO",
      isRepeatable: Boolean(isRepeatable),
      isActive: isActive !== false,
    })
    .returning();

  await logAdminAudit(req.adminId!, "create_milestone", { milestoneId: created.id, requiredReferrals });
  res.json(created);
});

router.delete("/referrals/milestones/:id", requireAdminPerm("canManageSettings"), async (req: AdminRequest, res: Response) => {
  const id = parseInt(String(req.params.id));
  await db.delete(milestonesTable).where(eq(milestonesTable.id, id));
  await logAdminAudit(req.adminId!, "delete_milestone", { milestoneId: id });
  res.json({ ok: true });
});

// ── 12. USERS MANAGEMENT ────────────────────────────────────────────────────
router.get("/users", requireAdminPerm("canManageUsers"), async (req: AdminRequest, res: Response) => {
  const search = req.query.search ? String(req.query.search).trim() : "";
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const limit = Math.min(100, parseInt(String(req.query.limit)) || 30);
  const offset = (page - 1) * limit;

  let query = db.select().from(usersTable).$dynamic();
  if (search) {
    const searchId = parseInt(search);
    if (!isNaN(searchId)) {
      query = query.where(or(eq(usersTable.id, searchId), eq(usersTable.referredBy, searchId)));
    } else {
      const clean = search.replace(/^@/, "");
      query = query.where(or(ilike(usersTable.username, `%${clean}%`), ilike(usersTable.firstName, `%${clean}%`)));
    }
  }

  const users = await query.orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset);
  res.json(users);
});

router.get("/users/:id", requireAdminPerm("canManageUsers"), async (req: AdminRequest, res: Response) => {
  const targetId = parseInt(String(req.params.id));
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

router.post("/users/:id/ban", requireAdminPerm("canBanUsers"), async (req: AdminRequest, res: Response) => {
  const targetId = parseInt(String(req.params.id));
  await db.update(usersTable).set({ isVisible: false }).where(eq(usersTable.id, targetId));
  await logAdminAudit(req.adminId!, "ban_user", {}, targetId);
  res.json({ ok: true });
});

router.post("/users/:id/unban", requireAdminPerm("canUnban"), async (req: AdminRequest, res: Response) => {
  const targetId = parseInt(String(req.params.id));
  await db.update(usersTable).set({ isVisible: true }).where(eq(usersTable.id, targetId));
  await logAdminAudit(req.adminId!, "unban_user", {}, targetId);
  res.json({ ok: true });
});

router.post("/users/:id/toggle-withdraw", requireAdminPerm("canManageUsers"), async (req: AdminRequest, res: Response) => {
  const targetId = parseInt(String(req.params.id));
  const [u] = await db.select({ isWithdrawalBanned: usersTable.isWithdrawalBanned }).from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  const next = !(u?.isWithdrawalBanned ?? false);
  await db.update(usersTable).set({ isWithdrawalBanned: next }).where(eq(usersTable.id, targetId));
  await logAdminAudit(req.adminId!, "toggle_withdrawal_gate", { isWithdrawalBanned: next }, targetId);
  res.json({ ok: true, isWithdrawalBanned: next });
});

// ── 13. MINERS CONFIG ───────────────────────────────────────────────────────
router.get("/miners", async (_req: AdminRequest, res: Response) => {
  const miners = await db.select().from(minersTable).orderBy(desc(minersTable.createdAt));
  res.json(miners);
});

router.post("/miners", requireAdminPerm("canManageMiners"), async (req: AdminRequest, res: Response) => {
  const { name, icon, costGo, dailyYieldGram, durationDays, isActive } = req.body;
  const [miner] = await db
    .insert(minersTable)
    .values({
      name,
      icon: icon || "⛏️",
      costGo: String(costGo || "100"),
      dailyYieldGram: String(dailyYieldGram || "1.0"),
      durationDays: String(durationDays || "30"),
      isActive: String(isActive !== false),
    })
    .returning();

  await logAdminAudit(req.adminId!, "create_miner", { minerId: miner.id, name });
  res.json(miner);
});

router.delete("/miners/:id", requireAdminPerm("canManageMiners"), async (req: AdminRequest, res: Response) => {
  const id = parseInt(String(req.params.id));
  await db.delete(minersTable).where(eq(minersTable.id, id));
  await logAdminAudit(req.adminId!, "delete_miner", { minerId: id });
  res.json({ ok: true });
});

// ── 14. WITHDRAWALS WITH CONSENSUS ──────────────────────────────────────────
router.get("/withdrawals", requireAdminPerm("canManageWithdrawals"), async (req: AdminRequest, res: Response) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  let query = db
    .select({
      id: withdrawalsTable.id,
      userId: withdrawalsTable.userId,
      amount: withdrawalsTable.amount,
      currency: withdrawalsTable.currency,
      walletAddress: withdrawalsTable.walletAddress,
      fee: withdrawalsTable.fee,
      status: withdrawalsTable.status,
      approvals: withdrawalsTable.approvals,
      rejections: withdrawalsTable.rejections,
      requiredApprovals: withdrawalsTable.requiredApprovals,
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

  if (status) {
    query = query.where(eq(withdrawalsTable.status, status));
  }

  const list = await query.orderBy(desc(withdrawalsTable.createdAt)).limit(100);
  res.json(list);
});

router.post("/withdrawals/:id/action", requireAdminPerm("canManageWithdrawals"), async (req: AdminRequest, res: Response) => {
  const wId = parseInt(String(req.params.id));
  const { action, reason } = req.body; // 'approve' | 'reject'

  if (isNaN(wId) || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "Invalid action" });
    return;
  }

  const result = await processWithdrawalVote(req.adminId!, wId, action, reason);
  if (result.status === "error") {
    res.status(404).json({ error: result.message });
    return;
  }

  res.json(result);
});

// ── 15. LIMITS & SETTINGS ───────────────────────────────────────────────────
router.get("/limits", async (_req: AdminRequest, res: Response) => {
  const minWithdraw = await getSetting("min_withdraw") || "0.5";
  const minDeposit = await getSetting("min_deposit") || "0.1";
  const refReward = await getSetting("referral_reward") || "5";
  const maxDailyWd = await getSetting("max_daily_withdraw") || "50";
  res.json({ minWithdraw, minDeposit, refReward, maxDailyWd });
});

router.post("/limits", requireAdminPerm("canManageSettings"), async (req: AdminRequest, res: Response) => {
  const { minWithdraw, minDeposit, refReward, maxDailyWd } = req.body;
  const updates: Record<string, string> = {};

  if (minWithdraw != null) updates.min_withdraw = String(minWithdraw);
  if (minDeposit != null) updates.min_deposit = String(minDeposit);
  if (refReward != null) updates.referral_reward = String(refReward);
  if (maxDailyWd != null) updates.max_daily_withdraw = String(maxDailyWd);

  for (const [key, value] of Object.entries(updates)) {
    await db.insert(botSettingsTable).values({ key, value }).onConflictDoUpdate({
      target: botSettingsTable.key,
      set: { value },
    });
    invalidateSetting(key);
  }

  await logAdminAudit(req.adminId!, "update_limits", updates);
  res.json({ ok: true, updates });
});

// ── 16. REQUIRED CHANNELS ───────────────────────────────────────────────────
router.get("/channels", async (_req: AdminRequest, res: Response) => {
  const raw = await getSetting("required_channels");
  try {
    const list = raw ? JSON.parse(raw) : [];
    res.json(list);
  } catch {
    res.json([]);
  }
});

router.post("/channels", requireAdminPerm("canManageChannels"), async (req: AdminRequest, res: Response) => {
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
  await logAdminAudit(req.adminId!, "save_required_channel", { channel: newEntry });

  res.json({ ok: true, channels: list });
});

router.delete("/channels/:username", requireAdminPerm("canManageChannels"), async (req: AdminRequest, res: Response) => {
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
  await logAdminAudit(req.adminId!, "remove_required_channel", { channel: cleanUser });

  res.json({ ok: true, channels: list });
});

// ── 17. SUB-ADMINS & PERMISSIONS ────────────────────────────────────────────
router.get("/admins", requireAdminPerm("canManageAdmins"), async (_req: AdminRequest, res: Response) => {
  const admins = await db.select().from(adminsTable).orderBy(desc(adminsTable.addedAt));
  res.json(admins);
});

router.post("/admins", requireAdminPerm("canManageAdmins"), async (req: AdminRequest, res: Response) => {
  const { id, username, role, permissions } = req.body;
  const targetId = parseInt(String(id));

  if (isNaN(targetId) || targetId <= 0) {
    res.status(400).json({ error: "Valid Telegram ID required" });
    return;
  }

  const perms = Array.isArray(permissions) ? permissions : [];
  const [newAdmin] = await db
    .insert(adminsTable)
    .values({
      id: targetId,
      username: username ? String(username).replace(/^@/, "") : null,
      role: role || "admin",
      permissions: perms,
    })
    .onConflictDoUpdate({
      target: adminsTable.id,
      set: {
        username: username ? String(username).replace(/^@/, "") : null,
        role: role || "admin",
        permissions: perms,
      },
    })
    .returning();

  await logAdminAudit(req.adminId!, "add_sub_admin", { targetAdminId: targetId, permissions: perms }, targetId);
  res.json(newAdmin);
});

router.delete("/admins/:id", requireAdminPerm("canManageAdmins"), async (req: AdminRequest, res: Response) => {
  const targetId = parseInt(String(req.params.id));
  await db.delete(adminsTable).where(eq(adminsTable.id, targetId));
  await logAdminAudit(req.adminId!, "delete_sub_admin", { targetAdminId: targetId }, targetId);
  res.json({ ok: true });
});

// ── 18. MINING RATE (% GLOBAL LIVE UPDATE) ──────────────────────────────────
router.get("/mining/rate", async (_req: AdminRequest, res: Response) => {
  const rate = await getSetting("global_mining_rate") || "0.001250";
  const num = parseFloat(rate);
  res.json({ rate, percentage: (num * 100).toFixed(3) + "%" });
});

router.post("/mining/rate", requireAdminPerm("canManageSettings"), async (req: AdminRequest, res: Response) => {
  const { rate } = req.body;
  const num = parseFloat(String(rate));

  if (isNaN(num) || num <= 0 || num > 1) {
    res.status(400).json({ error: "النسبة يجب أن تكون رقم بين 0.0001 (0.01%) و 1.0 (100%)" });
    return;
  }

  const str = num.toFixed(6);
  await db
    .insert(botSettingsTable)
    .values({ key: "global_mining_rate", value: str })
    .onConflictDoUpdate({
      target: botSettingsTable.key,
      set: { value: str },
    });

  invalidateSetting("global_mining_rate");
  await logAdminAudit(req.adminId!, "update_mining_rate", { rate: str, percentage: (num * 100).toFixed(3) + "%" });
  res.json({ ok: true, rate: str, percentage: (num * 100).toFixed(3) + "%" });
});

// ── 19. AUDIT & SECURITY LOGS ───────────────────────────────────────────────
router.get("/audit-logs", requireAdminPerm("canViewAuditLogs"), async (req: AdminRequest, res: Response) => {
  const limit = Math.min(100, parseInt(String(req.query.limit)) || 50);
  const logs = await db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(limit);
  res.json(logs);
});

router.get("/security/attempts", requireAdminPerm("canViewAuditLogs"), async (req: AdminRequest, res: Response) => {
  const attempts = await db.select().from(adminLoginAttemptsTable).orderBy(desc(adminLoginAttemptsTable.attemptedAt)).limit(50);
  res.json(attempts);
});

// ── 20. PROMO CODES & RESET ACTIONS ─────────────────────────────────────────
router.get("/promo-codes", requireAdminPerm("canManagePromoCodes"), async (_req: AdminRequest, res: Response) => {
  const codes = await db.select().from(promoCodesTable).orderBy(desc(promoCodesTable.createdAt));
  res.json(codes);
});

router.post("/promo-codes", requireAdminPerm("canManagePromoCodes"), async (req: AdminRequest, res: Response) => {
  const { code, rewardType, rewardAmount, maxUses, expiresAt } = req.body;
  if (!code) {
    res.status(400).json({ error: "Code is required" });
    return;
  }

  const [promo] = await db
    .insert(promoCodesTable)
    .values({
      code: String(code).trim().toUpperCase(),
      rewardType: rewardType || "GRAM",
      rewardAmount: String(rewardAmount || "10"),
      maxUses: String(maxUses || "100"),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    })
    .returning();

  await logAdminAudit(req.adminId!, "create_promo_code", { promoId: promo.id, code: promo.code });
  res.json(promo);
});

router.delete("/promo-codes/:id", requireAdminPerm("canManagePromoCodes"), async (req: AdminRequest, res: Response) => {
  const id = parseInt(String(req.params.id));
  await db.delete(promoCodesTable).where(eq(promoCodesTable.id, id));
  await logAdminAudit(req.adminId!, "delete_promo_code", { promoId: id });
  res.json({ ok: true });
});

export default router;
