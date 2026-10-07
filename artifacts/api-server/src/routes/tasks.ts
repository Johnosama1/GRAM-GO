import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, userTasksTable, usersTable } from "@workspace/db/schema";
import { addGoBalanceAndClaim } from "../lib/miningUtils";
import { eq, and, sql, ilike } from "drizzle-orm";
import { promoCodesTable, userPromoCodesTable, botSettingsTable, adRewardEventsTable } from "@workspace/db/schema";
import { verifyUserChannelMembership } from "../lib/telegramChannel";
import { verifyAccessMiddleware } from "../middlewares/verifyAccess";
import { requireSession } from "../middlewares/requireSession";
import { checkAndUpdateReferralQualification } from "../lib/referralManager";
import { getBot } from "../bot";
import { recordChannelReward } from "../bot/subscription";

const router = Router();

// ── In-memory cache for active tasks list ───────────────────────────
let _tasksCache: { data: unknown; ts: number } | null = null;

export function invalidateTasksCache() {
  _tasksCache = null;
}

function extractChannelUsername(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/t\.me\/([A-Za-z0-9_+-]+)/);
  return m ? m[1].replace(/^@/, "") : null;
}

router.get("/", async (req, res) => {
  const nowDate = new Date();
  const userId = req.query.userId ? parseInt(String(req.query.userId)) : undefined;

  let userCompletedIds = new Set<number>();
  if (userId && !isNaN(userId) && userId > 0) {
    try {
      const userCompleted = await db
        .select({ taskId: userTasksTable.taskId })
        .from(userTasksTable)
        .where(eq(userTasksTable.userId, userId));
      userCompletedIds = new Set(userCompleted.map((c) => c.taskId));
    } catch {
      // ignore
    }
  }

  // Always query database directly with aggregated claimed count
  const tasksWithClaims = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      url: tasksTable.url,
      icon: tasksTable.icon,
      channelPhotoUrl: tasksTable.channelPhotoUrl,
      rewardAmount: tasksTable.rewardAmount,
      rewardCurrency: tasksTable.rewardCurrency,
      maxClaims: tasksTable.maxClaims,
      isActive: tasksTable.isActive,
      category: tasksTable.category,
      channelUsername: tasksTable.channelUsername,
      channelChatId: tasksTable.channelChatId,
      botUsername: tasksTable.botUsername,
      botLink: tasksTable.botLink,
      requiredReferrals: tasksTable.requiredReferrals,
      verificationType: tasksTable.verificationType,
      expiresAt: tasksTable.expiresAt,
      createdAt: tasksTable.createdAt,
      claimedCount: sql<number>`COALESCE(COUNT(${userTasksTable.id})::int, 0)`,
    })
    .from(tasksTable)
    .leftJoin(userTasksTable, eq(tasksTable.id, userTasksTable.taskId))
    .where(eq(tasksTable.isActive, true))
    .groupBy(tasksTable.id)
    .orderBy(sql`${tasksTable.createdAt} DESC`);

  // Filter out expired tasks and finite tasks that reached seats limit (unless already completed by the requesting user)
  const active = tasksWithClaims.filter((t) => {
    if (t.expiresAt && new Date(t.expiresAt) <= nowDate) return false;
    if (t.maxClaims !== null && t.maxClaims !== undefined && t.maxClaims > 0) {
      if (t.claimedCount >= t.maxClaims && !userCompletedIds.has(t.id)) return false;
    }
    return true;
  });

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.json(active);
});

router.post("/:taskId/complete", requireSession, async (req, res) => {
  invalidateTasksCache();

  const taskId = parseInt(String(req.params.taskId));
  if (isNaN(taskId) || taskId <= 0) {
    res.status(400).json({ error: "Invalid taskId" });
    return;
  }

  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const userId = parseInt(String(req.body.userId));
  if (isNaN(userId) || userId <= 0) {
    res.status(400).json({ error: "Missing or invalid userId" });
    return;
  }
  if (sessionReq.sessionUserId !== undefined && sessionReq.sessionUserId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, taskId))
    .limit(1);

  if (!task || !task.isActive) {
    res.status(404).json({ error: "Task not found or inactive" });
    return;
  }

  if (task.expiresAt && new Date(task.expiresAt) < new Date()) {
    res.status(400).json({ error: "Task expired" });
    return;
  }

  // Task specific validations: Referral
  if (task.category === "referral") {
    const [userRefCheck] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const userReferralsCount = userRefCheck?.referralCount || 0;
    const reqReferrals = task.requiredReferrals || 0;
    if (userReferralsCount < reqReferrals) {
      res.status(400).json({ error: "Required referral count not reached" });
      return;
    }
  }

  // Channel/Chat membership server-side verification using Telegram Bot API getChatMember
  const isChannelTask = task.category === "channel" || !!task.channelChatId || !!task.channelUsername;
  const channelIdentifier = task.channelChatId || (task.channelUsername ? `@${task.channelUsername.replace(/^@/, "")}` : null) || extractChannelUsername(task.url);

  if (isChannelTask && channelIdentifier) {
    const memResult = await verifyUserChannelMembership(userId, channelIdentifier);
    if (!memResult.isMember) {
      if (
        memResult.status === "left" ||
        memResult.status === "kicked" ||
        memResult.error?.includes("join the channel") ||
        memResult.error?.includes("الانضمام")
      ) {
        res.status(400).json({
          error: "يرجى الانضمام إلى القناة أولاً ثم الضغط على استلام المكافأة",
        });
        return;
      }
      // If the channel is an external sponsor channel where the bot is not admin and verificationType is not strictly configured with channelChatId
      if (task.verificationType !== "telegram_channel" && !task.channelChatId && (memResult.error?.includes("administrator") || memResult.error?.includes("not found"))) {
        // Fallback pass-through for non-admin sponsor channels
      } else {
        res.status(400).json({
          error: memResult.error || "يرجى الانضمام إلى القناة أولاً ثم الضغط على استلام المكافأة",
        });
        return;
      }
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Check if this user already completed (idempotent guard)
      const existing = await tx
        .select()
        .from(userTasksTable)
        .where(and(eq(userTasksTable.userId, userId), eq(userTasksTable.taskId, taskId)))
        .limit(1);

      if (existing.length > 0) {
        const [existingUser] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        return { user: existingUser, alreadyCompleted: true };
      }

      // 2. Lock the task row to serialize concurrent completions
      const [lockedTask] = await tx
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.id, taskId))
        .for("update")
        .limit(1);

      if (!lockedTask || !lockedTask.isActive) {
        throw new Error("Task not found or inactive");
      }

      if (lockedTask.expiresAt && new Date(lockedTask.expiresAt) < new Date()) {
        throw new Error("Task expired");
      }

      // 3. Atomically check finite maxClaims limit
      if (lockedTask.maxClaims !== null && lockedTask.maxClaims !== undefined && lockedTask.maxClaims > 0) {
        const claimsCountRes = await tx
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(userTasksTable)
          .where(eq(userTasksTable.taskId, taskId));

        const currentClaims = claimsCountRes[0]?.count || 0;
        if (currentClaims >= lockedTask.maxClaims) {
          throw new Error("Task seats limit reached");
        }
      }

      // 4. Record completion
      await tx.insert(userTasksTable).values({ userId, taskId });

      // 5. Grant reward
      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (user) {
        const newTasksCompleted = (user.tasksCompleted || 0) + 1;
        const rewardAmountNum = parseFloat(lockedTask.rewardAmount || "0") || 0;

        if (lockedTask.rewardCurrency === "Gram") {
          await addGoBalanceAndClaim(tx, userId, 0); // harvest continuous mining first
          await tx.update(usersTable).set({
            gramBalance: sql`gram_balance + ${rewardAmountNum}`,
            tasksCompleted: newTasksCompleted,
          }).where(eq(usersTable.id, userId));
        } else {
          await addGoBalanceAndClaim(tx, userId, rewardAmountNum);
          await tx.update(usersTable).set({
            tasksCompleted: newTasksCompleted,
          }).where(eq(usersTable.id, userId));
        }

        if (isChannelTask) {
          await recordChannelReward(userId, 1);
        }
      }
      const [updatedUser] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      return { user: updatedUser, alreadyCompleted: false };
    });

    if (!result.alreadyCompleted) {
      checkAndUpdateReferralQualification(userId, db, getBot()).catch(() => {});
    }

    res.json({ success: true, user: result.user, alreadyCompleted: result.alreadyCompleted });
  } catch (err: any) {
    if (err.message === "Already completed") {
      res.status(400).json({ error: "Already completed" });
    } else if (err.message === "Task seats limit reached") {
      res.status(400).json({ error: "The available slots for this task have been filled" });
    } else {
      res.status(500).json({ error: err.message || "Failed to process task completion" });
    }
  }
});

router.get("/:userId/completed", async (req, res) => {
  const userId = parseInt(req.params.userId);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  const completed = await db
    .select()
    .from(userTasksTable)
    .where(eq(userTasksTable.userId, userId));
  res.json(completed.map((c) => c.taskId));
});



// ── POST /api/tasks/promo/redeem ───────────────────────────
// ── GET /api/tasks/ads/status ───────────────────────────
router.get("/ads/status", requireSession, async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const userId = sessionReq.sessionUserId;
  if (!userId) {
    res.status(401).json({ error: "Session required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Get config
  let dailyLimit = 10;
  const [limitSetting] = await db.select().from(botSettingsTable).where(eq(botSettingsTable.key, "ads_daily_limit")).limit(1);
  if (limitSetting && !isNaN(parseInt(limitSetting.value))) {
    dailyLimit = parseInt(limitSetting.value);
  }

  let rewardAmount = 0.5;
  const [rewardSetting] = await db.select().from(botSettingsTable).where(eq(botSettingsTable.key, "ads_reward_amount")).limit(1);
  if (rewardSetting && !isNaN(parseFloat(rewardSetting.value))) {
    rewardAmount = parseFloat(rewardSetting.value);
  }

  const now = new Date();
  let currentWatched = user.dailyAdsWatched || 0;
  if (user.lastAdWatchedAt) {
    const lastWatchedDate = new Date(user.lastAdWatchedAt);
    if (
      lastWatchedDate.getUTCFullYear() !== now.getUTCFullYear() ||
      lastWatchedDate.getUTCMonth() !== now.getUTCMonth() ||
      lastWatchedDate.getUTCDate() !== now.getUTCDate()
    ) {
      currentWatched = 0; // reset for a new day
    }
  }

  const nextReset = new Date();
  nextReset.setUTCHours(24, 0, 0, 0); // Next UTC midnight

  res.json({
    watchedToday: currentWatched,
    dailyLimit,
    rewardAmount,
    nextResetTime: nextReset.toISOString(),
  });
});

// ── POST /api/tasks/ads/watch ───────────────────────────
router.post("/ads/watch", requireSession, verifyAccessMiddleware, async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const userId = sessionReq.sessionUserId;
  if (!userId) {
    res.status(401).json({ error: "Session required" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (!user) {
        throw new Error("User not found");
      }

      // Get config
      let dailyLimit = 10;
      const [limitSetting] = await tx.select().from(botSettingsTable).where(eq(botSettingsTable.key, "ads_daily_limit")).limit(1);
      if (limitSetting && !isNaN(parseInt(limitSetting.value))) {
        dailyLimit = parseInt(limitSetting.value);
      }

      let rewardAmount = 0.5;
      const [rewardSetting] = await tx.select().from(botSettingsTable).where(eq(botSettingsTable.key, "ads_reward_amount")).limit(1);
      if (rewardSetting && !isNaN(parseFloat(rewardSetting.value))) {
        rewardAmount = parseFloat(rewardSetting.value);
      }

      const now = new Date();
      let currentWatched = user.dailyAdsWatched || 0;

      if (user.lastAdWatchedAt) {
        const lastWatchedDate = new Date(user.lastAdWatchedAt);
        if (
          lastWatchedDate.getUTCFullYear() !== now.getUTCFullYear() ||
          lastWatchedDate.getUTCMonth() !== now.getUTCMonth() ||
          lastWatchedDate.getUTCDate() !== now.getUTCDate()
        ) {
          currentWatched = 0; // reset for a new day
        }
      }

      if (currentWatched >= dailyLimit) {
        throw new Error("Daily ad limit reached");
      }

      const newWatched = currentWatched + 1;

      // Ensure idempotency for this exact UTC day explicitly by saving a ledger record
      const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

      await tx.insert(adRewardEventsTable).values({
        userId,
        provider: "adsgram",
        rewardAmount: String(rewardAmount),
        adDateUtc: todayStr,
      });

      // Update user
      await tx
        .update(usersTable)
        .set({
          dailyAdsWatched: newWatched,
          lastAdWatchedAt: now,
        })
        .where(eq(usersTable.id, userId));

      // Grant GO reward using atomic claim helper
      await addGoBalanceAndClaim(tx, userId, rewardAmount);

      const nextReset = new Date();
      nextReset.setUTCHours(24, 0, 0, 0); // Next UTC midnight
      return { success: true, watchedToday: newWatched, dailyLimit, rewardAmount, nextResetTime: nextReset.toISOString() };
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to process ad completion" });
  }
});

router.post("/promo/redeem", requireSession, verifyAccessMiddleware, async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const userId = sessionReq.sessionUserId;
  if (!userId) {
    res.status(401).json({ error: "Session required" });
    return;
  }

  const { code } = req.body;
  if (!code || typeof code !== "string" || code.trim() === "") {
    res.status(400).json({ error: "Please enter a valid code" });
    return;
  }

  const cleanCode = code.trim();

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Find the promo code
      const [promo] = await tx
        .select()
        .from(promoCodesTable)
        .where(ilike(promoCodesTable.code, cleanCode))
        .limit(1);

      if (!promo) {
        throw new Error("Invalid or non-existent code");
      }

      if (promo.isActive !== "true") {
        throw new Error("This code is currently inactive");
      }

      if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
        throw new Error("This code has expired");
      }

      // 2. Claim the code (this will throw if already claimed due to unique constraint)
      try {
        await tx.insert(userPromoCodesTable).values({
          userId,
          promoCodeId: promo.id,
        });
      } catch (insertError: any) {
        if (insertError.code === "23505" || insertError.message.includes("unique constraint")) {
          throw new Error("You have already redeemed this code");
        }
        throw insertError;
      }

      // 3. Atomic Update usage count with concurrency check
      const maxUsesNum = parseInt(promo.maxUses || "0");
      let condition = eq(promoCodesTable.id, promo.id);

      if (maxUsesNum > 0) {
        condition = and(
          eq(promoCodesTable.id, promo.id),
          sql`CAST(current_uses AS integer) < CAST(max_uses AS integer)`
        ) as typeof condition;
      }

      const updateResult = await tx
        .update(promoCodesTable)
        .set({ currentUses: sql`(CAST(current_uses AS integer) + 1)::text` })
        .where(condition)
        .returning();

      if (updateResult.length === 0) {
        throw new Error("Maximum uses reached for this code");
      }

      // 5. Grant Reward
      const amount = parseFloat(promo.rewardAmount || "0");
      let message = "";
      if (promo.rewardType === "GO") {
        await addGoBalanceAndClaim(tx, userId, amount);
        message = `Code redeemed successfully! You received ${amount} GO`;
      } else {
        // Gram or TON
        const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        if (user) {
          const unclaimed = 0; // We can accrue mining here but we'll just use addGoBalanceAndClaim with 0 GO for safety to claim pending
          await addGoBalanceAndClaim(tx, userId, 0);
          await tx
            .update(usersTable)
            .set({ gramBalance: sql`COALESCE(gram_balance, 0) + ${amount}` })
            .where(eq(usersTable.id, userId));
        }
        message = `Code redeemed successfully! You received ${amount} Gram`;
      }

      return { success: true, message, amount, currency: promo.rewardType };
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || "An error occurred while redeeming the code" });
  }
});

export default router;
