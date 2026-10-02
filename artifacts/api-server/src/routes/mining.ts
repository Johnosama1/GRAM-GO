import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, botSettingsTable } from "@workspace/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { requireSession } from "../middlewares/requireSession";
import { verifyAccessMiddleware } from "../middlewares/verifyAccess";

const router = Router();

import { getSetting } from "../lib/settingsCache";

// Helper to calculate mining yield in real-time
export function calculateUserMining(
  user: {
    goBalance?: string | null;
    balance?: string | null;
    gramBalance?: string | null;
    miningRate?: string | null;
    lastMiningAt?: Date | null;
  },
  globalMiningRate?: number,
  startMinerVisible: boolean = true
) {
  const goBal = Math.max(0, parseFloat(user.goBalance ?? user.balance ?? "0") || 0);
  const gramBal = Math.max(0, parseFloat(user.gramBalance ?? "0") || 0);
  const defaultRate = globalMiningRate ?? 0.03; // 3% daily rate
  const rate = Math.max(0, parseFloat(String(globalMiningRate ?? user.miningRate ?? "0.03")) || defaultRate);
  
  const lastAt = user.lastMiningAt ? new Date(user.lastMiningAt).getTime() : Date.now();
  const now = Date.now();
  const rawElapsedSec = Math.max(0, (now - lastAt) / 1000);
  const cycleDurationSec = 86400; // 24 hours

  const elapsedSec = rawElapsedSec; // Continuous accrual over 24h limit
  const remainingSec = Math.max(0, cycleDurationSec - rawElapsedSec); // keep this for compatibility if frontend still reads it

  // User GO power generates Gram yield: e.g. 1000 GO * 0.03 = 30 GO / 24h => 0.030000 Gram / 24h
  const dailyYieldGo = goBal * rate; // GO per 24h
  const dailyYield = dailyYieldGo / 1000; // Gram per 24h
  const perSecondYield = dailyYield / cycleDurationSec; // Gram per second
  const unclaimedGram = elapsedSec * perSecondYield;
  const isMining = goBal > 0;
  const isCycleCompleted = false; // Continuous mining, cycle never effectively completes in a way that stops mining

  return {
    goBalance: goBal,
    gramBalance: gramBal,
    miningRate: rate,
    dailyYield,
    perSecondYield,
    unclaimedGram,
    unclaimedGo: unclaimedGram, // for backwards-compatibility
    isMining,
    isCycleCompleted,
    lastMiningAt: user.lastMiningAt || new Date(now),
    elapsedSeconds: elapsedSec,
    remainingSeconds: remainingSec,
    cycleDurationSeconds: cycleDurationSec,
  };
}

// ── GET /api/mining/status ──────────────────────────────────────────────────
router.get("/status", requireSession, async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const userId = sessionReq.sessionUserId;
  if (!userId) {
    res.status(401).json({ error: "Session required" });
    return;
  }

  try {
    const [rawRate, startMinerVisibleStr] = await Promise.all([
      getSetting("global_mining_rate").catch(() => null),
      getSetting("start_miner_visible").catch(() => null)
    ]);
    const globalRate = rawRate ? parseFloat(rawRate) : 0.03;
    const startMinerVisible = startMinerVisibleStr !== "false";

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const calc = calculateUserMining(user, globalRate, startMinerVisible);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      isMining: calc.isMining,
      isCycleCompleted: calc.isCycleCompleted,
      goBalance: calc.goBalance.toFixed(4),
      gramBalance: calc.gramBalance.toFixed(6),
      unclaimedGram: calc.unclaimedGram.toFixed(6),
      unclaimedGo: calc.unclaimedGram.toFixed(6),
      miningRate: calc.miningRate,
      dailyYield: calc.dailyYield.toFixed(6),
      perSecondYield: calc.perSecondYield.toFixed(8),
      lastMiningAt: calc.lastMiningAt,
      remainingSeconds: Math.floor(calc.remainingSeconds),
      cycleDurationSeconds: calc.cycleDurationSeconds,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to calculate mining status" });
  }
});

// ── POST /api/mining/claim ──────────────────────────────────────────────────
router.post("/claim", requireSession, verifyAccessMiddleware, async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const userId = sessionReq.sessionUserId;
  if (!userId) {
    res.status(401).json({ error: "Session required" });
    return;
  }

  try {
    const [rawRate, startMinerVisibleStr] = await Promise.all([
      getSetting("global_mining_rate").catch(() => null),
      getSetting("start_miner_visible").catch(() => null)
    ]);
    const globalRate = rawRate ? parseFloat(rawRate) : 0.03;
    const startMinerVisible = startMinerVisibleStr !== "false";

    const result = await db.transaction(async (tx) => {
      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) {
        throw new Error("User not found");
      }
      if (user.isVisible === false) {
        throw new Error("محظور");
      }

      const calc = calculateUserMining(user, globalRate, startMinerVisible);
      if (calc.unclaimedGram < 0.000001) {
        throw new Error("لا توجد أرباح كافية للتجميع حالياً");
      }

      const claimed = calc.unclaimedGram;
      const claimedStr = claimed.toFixed(6);
      const exactLastMiningAt = user.lastMiningAt;

      // Atomically credit Gram to user's gramBalance using optimistic locking
      // The WHERE clause checks lastMiningAt to avoid race condition where two requests
      // read the same lastMiningAt and claim the same period twice.
      let updateCondition = eq(usersTable.id, userId);
      if (exactLastMiningAt) {
         updateCondition = and(eq(usersTable.id, userId), eq(usersTable.lastMiningAt, exactLastMiningAt)) as any;
      } else {
         updateCondition = and(eq(usersTable.id, userId), sql`last_mining_at IS NULL`) as any;
      }

      const updateResult = await tx
        .update(usersTable)
        .set({
          gramBalance: sql`COALESCE(gram_balance, 0) + ${sql.raw(claimedStr)}`,
          lastMiningAt: new Date(),
        })
        .where(updateCondition)
        .returning();

      if (updateResult.length === 0) {
        throw new Error("Conflict: already claimed");
      }

      return { claimedStr, updatedUser: updateResult[0] };
    });

    res.json({
      success: true,
      claimedAmount: result.claimedStr,
      gramBalance: result.updatedUser.gramBalance,
      goBalance: result.updatedUser.goBalance,
      remainingSeconds: 86400,
      user: {
        ...result.updatedUser,
        isVerified: result.updatedUser.ipVerifiedAt != null,
      },
    });
  } catch (err: any) {
    if (err.message === "User not found") {
      res.status(404).json({ error: "User not found" });
    } else if (err.message === "محظور") {
      res.status(403).json({ error: "محظور", banned: true });
    } else if (err.message === "لا توجد أرباح كافية للتجميع حالياً" || err.message === "Conflict: already claimed") {
      res.status(400).json({ error: "لا توجد أرباح كافية للتجميع حالياً" });
    } else {
      res.status(500).json({ error: "Failed to claim mining rewards" });
    }
  }
});

// ── GET /api/mining/stats ───────────────────────────────────────────────────
router.get("/stats", async (_req, res) => {
  try {
    const rawRate = await getSetting("global_mining_rate").catch(() => null);
    const globalRate = rawRate ? parseFloat(rawRate) : 0.03;

    const [usersStats] = await db.select({
      totalUsers: sql<number>`count(*)`,
      totalGo: sql<string>`coalesce(sum(coalesce(go_balance, balance)), 0)`,
      totalGram: sql<string>`coalesce(sum(gram_balance), 0)`,
    }).from(usersTable);

    const totalGoNum = parseFloat(usersStats?.totalGo || "0");
    const totalGramNum = parseFloat(usersStats?.totalGram || "0");

    res.json({
      totalMiners: Number(usersStats?.totalUsers || 0),
      totalGoCirculation: totalGoNum.toFixed(2),
      totalGramMined: totalGramNum.toFixed(4),
      dailyNetworkYield: (totalGoNum * globalRate).toFixed(4),
      defaultRatePercent: parseFloat((globalRate * 100).toFixed(3)),
    });
  } catch {
    res.json({
      totalMiners: 0,
      totalGoCirculation: "0.00",
      totalGramMined: "0.0000",
      dailyNetworkYield: "0.0000",
      defaultRatePercent: 0.125,
    });
  }
});

export default router;
