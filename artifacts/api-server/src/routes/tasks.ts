import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, userTasksTable, usersTable } from "@workspace/db/schema";
import { addGoBalanceAndClaim } from "../lib/miningUtils";
import { eq, and, sql, ilike } from "drizzle-orm";
import { promoCodesTable, userPromoCodesTable, botSettingsTable, adRewardEventsTable } from "@workspace/db/schema";
import { getBot } from "../bot";
import { checkChannelMembership } from "../bot/admin";
import { recordChannelReward } from "../bot/subscription";
import { verifyAccessMiddleware } from "../middlewares/verifyAccess";
import { requireSession } from "../middlewares/requireSession";

const router = Router();

// ── In-memory cache for active tasks list ───────────────────────────
let _tasksCache: { data: unknown; ts: number } | null = null;
const TASKS_TTL = 30_000; // 30 seconds

export function invalidateTasksCache() {
  _tasksCache = null;
}

function extractChannelUsername(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/t\.me\/([A-Za-z0-9_]+)/);
  return m ? m[1] : null;
}

router.get("/", async (_req, res) => {
  const now = Date.now();

  if (_tasksCache && now - _tasksCache.ts < TASKS_TTL) {
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(_tasksCache.data);
    return;
  }

  const nowDate = new Date();
  const tasks = await db.select().from(tasksTable).where(eq(tasksTable.isActive, true));
  const active = tasks.filter((t) => !t.expiresAt || t.expiresAt > nowDate);

  _tasksCache = { data: active, ts: now };
  res.setHeader("Cache-Control", "public, max-age=30");
  res.json(active);
});

router.post("/:taskId/complete", requireSession, verifyAccessMiddleware, async (req, res) => {
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

  if (task.expiresAt && task.expiresAt < new Date()) {
    res.status(400).json({ error: "Task expired" });
    return;
  }

  const existing = await db
    .select()
    .from(userTasksTable)
    .where(and(eq(userTasksTable.userId, userId), eq(userTasksTable.taskId, taskId)))
    .limit(1);

  if (existing.length > 0) {
    res.status(400).json({ error: "Already completed" });
    return;
  }

  // Task specific validations
  if (task.category === "referral") {
    const [userRefCheck] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const userReferralsCount = userRefCheck?.referralCount || 0;
    const reqReferrals = task.requiredReferrals || 0;
    if (userReferralsCount < reqReferrals) {
      res.status(400).json({ error: "لم تصل لعدد الإحالات المطلوب" });
      return;
    }
  }

  // Channel membership verification
  const channelUsername = task.channelUsername || extractChannelUsername(task.url);
  const isChannelTask = !!channelUsername && task.category === "channel";

  if (isChannelTask) {
    try {
      const botInstance = getBot();
      if (botInstance) {
        const isMember = await checkChannelMembership(botInstance, userId, channelUsername);
        if (!isMember) {
          res.status(400).json({ error: `يجب الانضمام للقناة أولاً: @${channelUsername}` });
          return;
        }
      }
    } catch {
      // If bot check fails, allow completion
    }
  }

  await db.insert(userTasksTable).values({ userId, taskId });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (user) {
    const newTasksCompleted = (user.tasksCompleted || 0) + 1;

    const rewardAmountNum = parseFloat(task.rewardAmount || "0") || 0;

    if (task.rewardCurrency === "Gram") {
      await addGoBalanceAndClaim(db, userId, 0); // harvest continuous mining first
      await db.update(usersTable).set({
        gramBalance: sql`gram_balance + ${rewardAmountNum}`,
        tasksCompleted: newTasksCompleted,
      }).where(eq(usersTable.id, userId));
    } else {
      await addGoBalanceAndClaim(db, userId, rewardAmountNum);
      await db.update(usersTable).set({
        tasksCompleted: newTasksCompleted,
      }).where(eq(usersTable.id, userId));
    }

    if (isChannelTask) {
      await recordChannelReward(userId, 1);
    }
  }

  const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  res.json({ success: true, user: updated });
});

router.get("/:userId/completed", async (req, res) => {
  const userId = parseInt(req.params.userId);
  res.setHeader("Cache-Control", "private, max-age=10");
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
    res.status(400).json({ error: "الرجاء إدخال كود صحيح" });
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
        throw new Error("الكود غير صحيح أو غير موجود");
      }

      if (promo.isActive !== "true") {
        throw new Error("هذا الكود غير نشط حالياً");
      }

      if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
        throw new Error("هذا الكود منتهي الصلاحية");
      }

      // 2. Claim the code (this will throw if already claimed due to unique constraint)
      try {
        await tx.insert(userPromoCodesTable).values({
          userId,
          promoCodeId: promo.id,
        });
      } catch (insertError: any) {
        if (insertError.code === "23505" || insertError.message.includes("unique constraint")) {
          throw new Error("لقد قمت باستخدام هذا الكود مسبقاً");
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
        throw new Error("تم الوصول للحد الأقصى لاستخدام هذا الكود");
      }

      // 5. Grant Reward
      const amount = parseFloat(promo.rewardAmount || "0");
      let message = "";
      if (promo.rewardType === "GO") {
        await addGoBalanceAndClaim(tx, userId, amount);
        message = `تم تفعيل الكود بنجاح وحصلت على ${amount} GO`;
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
        message = `تم تفعيل الكود بنجاح وحصلت على ${amount} Gram`;
      }

      return { success: true, message, amount, currency: promo.rewardType };
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || "حدث خطأ أثناء تفعيل الكود" });
  }
});

export default router;
