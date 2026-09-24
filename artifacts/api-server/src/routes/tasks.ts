import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, userTasksTable, usersTable } from "@workspace/db/schema";
import { addGoBalanceAndClaim } from "../lib/miningUtils";
import { eq, and, sql, ilike } from "drizzle-orm";
import { promoCodesTable, userPromoCodesTable } from "@workspace/db/schema";
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

  // Channel membership verification
  const channelUsername = extractChannelUsername(task.url);
  const isChannelTask = !!channelUsername;

  if (channelUsername) {
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

    // Process mining rewards first before updating GO balance
    await addGoBalanceAndClaim(db, userId, 5);

    await db
      .update(usersTable)
      .set({
        tasksCompleted: newTasksCompleted,
      })
      .where(eq(usersTable.id, userId));

    if (isChannelTask) {
      await recordChannelReward(userId, 1);
    }
  }

  const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  res.json({ success: true, user: updated, rewardedGo: 5 });
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

      const max = parseInt(promo.maxUses || "0");
      const current = parseInt(promo.currentUses || "0");
      if (max > 0 && current >= max) {
        throw new Error("تم الوصول للحد الأقصى لاستخدام هذا الكود");
      }

      // 2. Check if user already claimed
      const [alreadyClaimed] = await tx
        .select()
        .from(userPromoCodesTable)
        .where(
          and(
            eq(userPromoCodesTable.userId, userId),
            eq(userPromoCodesTable.promoCodeId, promo.id)
          )
        )
        .limit(1);

      if (alreadyClaimed) {
        throw new Error("لقد قمت باستخدام هذا الكود مسبقاً");
      }

      // 3. Claim the code
      await tx.insert(userPromoCodesTable).values({
        userId,
        promoCodeId: promo.id,
      });

      // 4. Update usage count
      await tx
        .update(promoCodesTable)
        .set({ currentUses: String(current + 1) })
        .where(eq(promoCodesTable.id, promo.id));

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
