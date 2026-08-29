import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, botSettingsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireSession } from "../middlewares/requireSession";
import { verifyAccessMiddleware } from "../middlewares/verifyAccess";

const router = Router();

// Helper to calculate mining yield in real-time
export function calculateUserMining(user: {
  goBalance?: string | null;
  balance?: string | null;
  gramBalance?: string | null;
  miningRate?: string | null;
  lastMiningAt?: Date | null;
}) {
  const goBal = Math.max(0, parseFloat(user.goBalance ?? user.balance ?? "0") || 0);
  const gramBal = Math.max(0, parseFloat(user.gramBalance ?? "0") || 0);
  const rate = Math.max(0, parseFloat(user.miningRate ?? "0.0300") || 0.03); // 3%
  
  const lastAt = user.lastMiningAt ? new Date(user.lastMiningAt).getTime() : Date.now();
  const now = Date.now();
  const elapsedSec = Math.max(0, (now - lastAt) / 1000);

  const dailyYield = goBal * rate; // 3% per 24 hours
  const perSecondYield = dailyYield / 86400; // per second
  const unclaimedGram = elapsedSec * perSecondYield;
  const isMining = goBal > 0;

  return {
    goBalance: goBal,
    gramBalance: gramBal,
    miningRate: rate,
    dailyYield,
    perSecondYield,
    unclaimedGram,
    isMining,
    lastMiningAt: user.lastMiningAt || new Date(now),
    elapsedSeconds: elapsedSec,
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
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const calc = calculateUserMining(user);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      isMining: calc.isMining,
      goBalance: calc.goBalance.toFixed(4),
      gramBalance: calc.gramBalance.toFixed(6),
      unclaimedGram: calc.unclaimedGram.toFixed(6),
      miningRate: calc.miningRate,
      dailyYield: calc.dailyYield.toFixed(6),
      perSecondYield: calc.perSecondYield.toFixed(8),
      lastMiningAt: calc.lastMiningAt,
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
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.isVisible === false) {
      res.status(403).json({ error: "محظور", banned: true });
      return;
    }

    const calc = calculateUserMining(user);
    if (calc.unclaimedGram < 0.000001) {
      res.status(400).json({ error: "لا توجد أرباح كافية للتجميع حالياً" });
      return;
    }

    const claimed = calc.unclaimedGram;
    const newGramTotal = calc.gramBalance + claimed;

    await db
      .update(usersTable)
      .set({
        gramBalance: String(newGramTotal.toFixed(6)),
        lastMiningAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    const [updatedUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    res.json({
      success: true,
      claimedAmount: claimed.toFixed(6),
      gramBalance: newGramTotal.toFixed(6),
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
      dailyNetworkYield: (totalGoNum * 0.03).toFixed(4),
      defaultRatePercent: 3.0,
    });
  } catch {
    res.json({
      totalMiners: 0,
      totalGoCirculation: "0.00",
      totalGramMined: "0.0000",
      dailyNetworkYield: "0.0000",
      defaultRatePercent: 3.0,
    });
  }
});

export default router;
