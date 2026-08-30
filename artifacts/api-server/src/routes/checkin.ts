import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  dailyCheckinsTable,
  transactionsTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireSession } from "../middlewares/requireSession";
import { verifyAccessMiddleware } from "../middlewares/verifyAccess";

const router = Router();

// Exact required rewards table:
// Day 1 = 2 GO, Day 2 = 3 GO, Day 3 = 4 GO, Day 4 = 5 GO, Day 5 = 6 GO,
// Day 6 = 8 GO, Day 7 = 8 GO, Day 8 = 9 GO, Day 9 = 9 GO, Day 10 = 10 GO
const DAILY_REWARDS_MAP: Record<number, number> = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 8,
  7: 8,
  8: 9,
  9: 9,
  10: 10,
};

function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

function getYesterdayDateString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

// ── GET /api/checkin/status ───────────────────────────────────────────
router.get("/status", requireSession, async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const userId = sessionReq.sessionUserId;
  if (!userId) {
    res.status(401).json({ error: "Session required" });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      dailyStreak: usersTable.dailyStreak,
      lastDailyClaimAt: usersTable.lastDailyClaimAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const todayStr = getTodayDateString();
  const yesterdayStr = getYesterdayDateString();

  const lastClaimDateStr = user.lastDailyClaimAt
    ? new Date(user.lastDailyClaimAt).toISOString().split("T")[0]
    : null;

  const alreadyClaimedToday = lastClaimDateStr === todayStr;

  let currentStreak = user.dailyStreak || 0;
  // If user didn't claim today AND didn't claim yesterday, streak is reset to 0
  if (lastClaimDateStr && lastClaimDateStr !== todayStr && lastClaimDateStr !== yesterdayStr) {
    currentStreak = 0;
  }

  const nextDay = alreadyClaimedToday
    ? currentStreak
    : (currentStreak % 10) + 1;

  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);

  const daysList = Object.entries(DAILY_REWARDS_MAP).map(([dayNumStr, reward]) => {
    const day = Number(dayNumStr);
    let status: "claimed" | "available" | "locked" = "locked";
    if (day < nextDay || (day === nextDay && alreadyClaimedToday)) {
      status = "claimed";
    } else if (day === nextDay && !alreadyClaimedToday) {
      status = "available";
    }
    return {
      day,
      reward,
      currency: "GO",
      status,
    };
  });

  res.json({
    currentStreak,
    nextDay,
    alreadyClaimedToday,
    canClaim: !alreadyClaimedToday,
    todayReward: DAILY_REWARDS_MAP[nextDay] || 2,
    days: daysList,
    nextClaimAt: tomorrow.toISOString(),
    serverTime: new Date().toISOString(),
  });
});

// ── POST /api/checkin/claim ───────────────────────────────────────────
router.post("/claim", requireSession, verifyAccessMiddleware, async (req, res) => {
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

  if (user.isVisible === false) {
    res.status(403).json({ error: "محظور", banned: true });
    return;
  }

  const todayStr = getTodayDateString();
  const yesterdayStr = getYesterdayDateString();

  const lastClaimDateStr = user.lastDailyClaimAt
    ? new Date(user.lastDailyClaimAt).toISOString().split("T")[0]
    : null;

  if (lastClaimDateStr === todayStr) {
    res.status(400).json({ error: "لقد قمت بتسجيل الدخول اليوم بالفعل", alreadyClaimed: true });
    return;
  }

  let streak = user.dailyStreak || 0;
  if (!lastClaimDateStr || lastClaimDateStr === yesterdayStr) {
    streak = (streak % 10) + 1;
  } else {
    // Missed a day -> reset to Day 1
    streak = 1;
  }

  const rewardAmount = DAILY_REWARDS_MAP[streak] || 2;

  // Atomic update
  await db
    .update(usersTable)
    .set({
      dailyStreak: streak,
      lastDailyClaimAt: new Date(),
      goBalance: sql`go_balance + ${rewardAmount}`,
      balance: sql`balance + ${rewardAmount}`,
    })
    .where(eq(usersTable.id, userId));

  await db.insert(dailyCheckinsTable).values({
    userId,
    day: streak,
    rewardAmount: String(rewardAmount),
    claimDate: todayStr,
    claimedAt: new Date(),
  }).catch(() => {});

  await db.insert(transactionsTable).values({
    userId,
    type: "daily_checkin",
    amount: String(rewardAmount),
    currency: "GO",
    details: { day: streak, claimDate: todayStr },
  }).catch(() => {});

  const [updatedUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  res.json({
    ok: true,
    success: true,
    day: streak,
    rewardAmount,
    goBalance: updatedUser.goBalance,
    message: `🎉 تم استلام مكافأة اليوم ${streak} (+${rewardAmount} GO) بنجاح!`,
  });
});

export default router;
