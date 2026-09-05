import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, botSettingsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
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
  globalMiningRate?: number
) {
  const goBal = Math.max(0, parseFloat(user.goBalance ?? user.balance ?? "0") || 0);
  const defaultRate = globalMiningRate ?? 0.00125; // 0.125% daily rate
  const rate = Math.max(0, parseFloat(String(globalMiningRate ?? user.miningRate ?? "0.001250")) || defaultRate);
  
  const lastAt = user.lastMiningAt ? new Date(user.lastMiningAt).getTime() : Date.now();
  const now = Date.now();
  const rawElapsedSec = Math.max(0, (now - lastAt) / 1000);
  const cycleDurationSec = 86400; // 24 hours
  const elapsedSec = Math.min(rawElapsedSec, cycleDurationSec);
  const remainingSec = Math.max(0, cycleDurationSec - rawElapsedSec);

  const dailyYield = goBal * rate; // Daily GO yield
  const perSecondYield = dailyYield / cycleDurationSec; // GO per second
  const unclaimedGo = elapsedSec * perSecondYield;
  const isMining = goBal > 0;

  return {
    goBalance: goBal,
    miningRate: rate,
    dailyYield,
    perSecondYield,
    unclaimedGo,
    unclaimedGram: unclaimedGo, // for backwards-compatibility
    isMining,
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
    const rawRate = await getSetting("global_mining_rate").catch(() => null);
    const globalRate = rawRate ? parseFloat(rawRate) : 0.00125;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const calc = calculateUserMining(user, globalRate);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      isMining: calc.isMining,
      goBalance: calc.goBalance.toFixed(4),
      unclaimedGo: calc.unclaimedGo.toFixed(6),
      unclaimedGram: calc.unclaimedGo.toFixed(6),
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
    const rawRate = await getSetting("global_mining_rate").catch(() => null);
    const globalRate = rawRate ? parseFloat(rawRate) : 0.00125;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.isVisible === false) {
      res.status(403).json({ error: "محظور", banned: true });
      return;
    }

    const calc = calculateUserMining(user, globalRate);
    if (calc.unclaimedGo < 0.000001) {
      res.status(400).json({ error: "لا توجد أرباح كافية للتجميع حالياً" });
      return;
    }

    const claimed = calc.unclaimedGo;
    const claimedStr = claimed.toFixed(6);

    // Atomically credit GO to user's unified goBalance & balance
    await db
      .update(usersTable)
      .set({
        goBalance: sql`COALESCE(go_balance, 0) + ${sql.raw(claimedStr)}`,
        balance: sql`COALESCE(balance, 0) + ${sql.raw(claimedStr)}`,
        lastMiningAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    const [updatedUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    res.json({
      success: true,
      claimedAmount: claimedStr,
      goBalance: updatedUser.goBalance,
      remainingSeconds: 86400,
      user: {
        ...updatedUser,
        isVerified: updatedUser.ipVerifiedAt != null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to claim mining rewards" });
  }
});

// ── GET /api/mining/stats ───────────────────────────────────────────────────
router.get("/stats", async (_req, res) => {
  try {
    const rawRate = await getSetting("global_mining_rate").catch(() => null);
    const globalRate = rawRate ? parseFloat(rawRate) : 0.00125;

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
