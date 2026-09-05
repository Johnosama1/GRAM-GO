import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, transactionsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireSession, type SessionRequest } from "../middlewares/requireSession";
import { verifyAccessMiddleware } from "../middlewares/verifyAccess";
import crypto from "crypto";

const router = Router();

// In-memory active game session cache (keyed by sessionToken) with 15-minute TTL
interface ActiveGameSession {
  token: string;
  userId: number;
  gameType: "sword_adventure";
  startedAt: number;
  finished: boolean;
}

const activeSessions = new Map<string, ActiveGameSession>();

// Cleanup stale sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of activeSessions.entries()) {
    if (now - session.startedAt > 15 * 60 * 1000) {
      activeSessions.delete(token);
    }
  }
}, 10 * 60 * 1000);

// Rate limiter helper: track last game finish per user to prevent rapid spam
const lastFinishTimes = new Map<number, number>();

// ── POST /api/games/sword-adventure/start ──────────────────────────────
router.post("/sword-adventure/start", requireSession, verifyAccessMiddleware, async (req, res) => {
  const sessionReq = req as SessionRequest;
  const userId = sessionReq.sessionUserId;

  if (!userId) {
    res.status(401).json({ error: "Session required" });
    return;
  }

  // Check user existence and ban status
  const [user] = await db
    .select({ id: usersTable.id, isVisible: usersTable.isVisible })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || user.isVisible === false) {
    res.status(403).json({ error: "Account suspended or not found" });
    return;
  }

  // Cooldown check (minimum 2 seconds between games)
  const lastFinish = lastFinishTimes.get(userId) || 0;
  if (Date.now() - lastFinish < 2000) {
    res.status(429).json({ error: "Please wait a moment before starting a new round" });
    return;
  }

  // Generate cryptographically secure session token
  const token = `sword_${userId}_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
  const session: ActiveGameSession = {
    token,
    userId,
    gameType: "sword_adventure",
    startedAt: Date.now(),
    finished: false,
  };

  activeSessions.set(token, session);

  res.json({
    ok: true,
    sessionToken: token,
    rewardPerEnemy: 0.05,
    maxEnemiesPerRound: 50,
    serverTime: new Date().toISOString(),
  });
});

// ── POST /api/games/sword-adventure/finish ─────────────────────────────
router.post("/sword-adventure/finish", requireSession, verifyAccessMiddleware, async (req, res) => {
  const sessionReq = req as SessionRequest;
  const userId = sessionReq.sessionUserId;

  if (!userId) {
    res.status(401).json({ error: "Session required" });
    return;
  }

  const { sessionToken, enemiesDefeated, durationSeconds } = req.body as {
    sessionToken?: string;
    enemiesDefeated?: number;
    durationSeconds?: number;
  };

  if (!sessionToken || typeof sessionToken !== "string") {
    res.status(400).json({ error: "Invalid session token" });
    return;
  }

  const session = activeSessions.get(sessionToken);
  if (!session) {
    res.status(400).json({ error: "Game session expired or invalid. Please start a new game." });
    return;
  }

  if (session.userId !== userId) {
    res.status(403).json({ error: "Session token does not match user" });
    return;
  }

  if (session.finished) {
    res.status(400).json({ error: "This game session has already been claimed." });
    return;
  }

  const killed = Math.max(0, Math.min(50, Math.floor(Number(enemiesDefeated) || 0)));
  const reportedDuration = Math.max(1, Number(durationSeconds) || 1);
  const actualElapsedSec = Math.max(1, (Date.now() - session.startedAt) / 1000);

  // Anti-cheat validation rules:
  // 1. Minimum duration: At least 0.7 seconds per defeated enemy (human limit)
  if (killed > 0) {
    const minRequiredTime = killed * 0.7;
    if (actualElapsedSec < minRequiredTime) {
      activeSessions.delete(sessionToken);
      res.status(400).json({ error: "Abnormal gameplay speed detected." });
      return;
    }
  }

  // Calculate reward (0.05 GO per enemy)
  const reward = Math.round(killed * 0.05 * 1000) / 1000;
  const rewardStr = reward.toFixed(6);

  // Mark session as finished
  session.finished = true;
  lastFinishTimes.set(userId, Date.now());

  try {
    let updatedGoBalance = "0";

    if (reward > 0) {
      // Atomic transaction: update user balance & create transaction record
      await db.transaction(async (tx) => {
        await tx
          .update(usersTable)
          .set({
            goBalance: sql`COALESCE(go_balance, 0) + ${sql.raw(rewardStr)}`,
            balance: sql`COALESCE(balance, 0) + ${sql.raw(rewardStr)}`,
          })
          .where(eq(usersTable.id, userId));

        await tx.insert(transactionsTable).values({
          userId,
          type: "sword_adventure",
          amount: rewardStr,
          currency: "GO",
          details: {
            enemiesDefeated: killed,
            durationSeconds: Math.round(actualElapsedSec),
            sessionToken,
          },
        }).catch((err) => {
          console.warn("[SwordAdventure] Non-fatal transaction log error:", err);
        });
      });
    }

    // Fetch updated balance
    const [user] = await db
      .select({ goBalance: usersTable.goBalance, balance: usersTable.balance })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    updatedGoBalance = user?.goBalance ?? "0";

    // Clean up session token
    activeSessions.delete(sessionToken);

    res.json({
      ok: true,
      success: true,
      enemiesDefeated: killed,
      reward,
      currency: "GO",
      durationSeconds: Math.round(actualElapsedSec),
      goBalance: updatedGoBalance,
      message: reward > 0 ? `🎉 Victory! You defeated ${killed} enemies and earned +${reward} GO!` : "Good try! Defeat enemies to earn GO.",
    });
  } catch (err) {
    console.error("[SwordAdventure] Error finalizing game reward:", err);
    res.status(500).json({ error: "Failed to credit game reward. Please try again." });
  }
});

export default router;
