import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  dailyCombosTable,
  userComboAttemptsTable,
  transactionsTable,
  comboItems,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireSession } from "../middlewares/requireSession";
import { verifyAccessMiddleware } from "../middlewares/verifyAccess";
import { checkAndUpdateReferralQualification } from "../lib/referralManager";
import { getBot } from "../bot";
import crypto from "crypto";

const router = Router();

export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

export async function getOrCreateTodayCombo(dateStr: string): Promise<{ item1: number; item2: number; item3: number }> {
  const [existing] = await db
    .select()
    .from(dailyCombosTable)
    .where(eq(dailyCombosTable.comboDate, dateStr))
    .limit(1);

  if (existing) {
    return { item1: existing.item1, item2: existing.item2, item3: existing.item3 };
  }

  // Deterministic daily combination using SHA-256 hash
  const hash = crypto.createHash("sha256").update("combo_salt_" + dateStr).digest("hex");
  const indices = [1, 2, 3, 4, 5];
  for (let i = indices.length - 1; i > 0; i--) {
    const byte = parseInt(hash.slice(i * 4, i * 4 + 4), 16);
    const j = byte % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const [item1, item2, item3] = indices.slice(0, 3).sort((a, b) => a - b);

  try {
    await db.insert(dailyCombosTable).values({
      comboDate: dateStr,
      item1,
      item2,
      item3,
      rewardAmount: "5.000000",
    }).onConflictDoNothing();
  } catch (err) {
    console.error("[DailyCombo] Error creating combo for date:", dateStr, err);
  }

  return { item1, item2, item3 };
}

// ── GET /api/combo/status ─────────────────────────────────────────────
router.get("/status", requireSession, async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const userId = sessionReq.sessionUserId;
  if (!userId) {
    res.status(401).json({ error: "Session required" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");

  const todayStr = getTodayDateString();
  const correctCombo = await getOrCreateTodayCombo(todayStr);

  const [attempt] = await db
    .select()
    .from(userComboAttemptsTable)
    .where(
      and(
        eq(userComboAttemptsTable.userId, userId),
        eq(userComboAttemptsTable.comboDate, todayStr),
      )
    )
    .limit(1);

  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);


  let parsedSelectedItems: number[] = [];
  if (attempt?.selectedItems) {
    if (typeof attempt.selectedItems === "string") {
      try { parsedSelectedItems = JSON.parse(attempt.selectedItems); } catch (e) {}
    } else if (Array.isArray(attempt.selectedItems)) {
      parsedSelectedItems = attempt.selectedItems;
    }
  }

  res.json({
    items: comboItems.map(item => ({
      id: item.id,
      name: item.name,
      image: item.image,
      description: item.description,
    })),
    attempted: !!attempt,
    isSuccess: attempt?.isSuccess ?? false,
    rewardClaimed: attempt?.rewardClaimed ?? false,
    selectedItems: parsedSelectedItems,
    rewardAmount: attempt?.isSuccess && attempt?.rewardAmount ? parseFloat(attempt.rewardAmount) : 5,
    nextComboAt: tomorrow.toISOString(),
    serverTime: new Date().toISOString(),
  });
});

// ── POST /api/combo/check ─────────────────────────────────────────────
router.post("/check", requireSession, verifyAccessMiddleware, async (req, res) => {
  const sessionReq = req as import("../middlewares/requireSession").SessionRequest;
  const userId = sessionReq.sessionUserId;
  if (!userId) {
    res.status(401).json({ error: "Session required" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");

  const { selectedItems } = req.body as { selectedItems?: number[] };

  if (!Array.isArray(selectedItems) || selectedItems.length !== 3) {
    res.status(400).json({ error: "Please select 3 items first." });
    return;
  }

  const validItems = selectedItems.filter(id => typeof id === "number" && id >= 1 && id <= 5);
  const isUnique = new Set(validItems).size === 3;
  if (validItems.length !== 3 || !isUnique) {
    res.status(400).json({ error: "Selected items must be 3 unique valid item IDs (1-5)." });
    return;
  }

  const todayStr = getTodayDateString();

  // Server-side check for active combo
  const correctCombo = await getOrCreateTodayCombo(todayStr);
  const expectedArray = [correctCombo.item1, correctCombo.item2, correctCombo.item3];
  // Order agnostic check. If exact 3 elements exist in the expected list
  const isMatch = validItems.slice().sort().every((id, index) => id === expectedArray.slice().sort()[index]);
  
  // Random reward between 1 and 6 GO coins on success
  const randomReward = isMatch ? Math.floor(Math.random() * 6) + 1 : 0;
  const rewardFixed = isMatch ? randomReward.toFixed(6) : "0.000000";

  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);

  try {
    // Database Transaction for safety & anti-duplicate protection
    const result = await db.transaction(async (tx) => {
      // Re-check existing attempt inside transaction to prevent race conditions
      const [txExistingAttempt] = await tx
        .select()
        .from(userComboAttemptsTable)
        .where(
          and(
            eq(userComboAttemptsTable.userId, userId),
            eq(userComboAttemptsTable.comboDate, todayStr),
          )
        )
        .limit(1);

      if (txExistingAttempt) {
        return {
          alreadyAttempted: true,
          isSuccess: txExistingAttempt.isSuccess,
          reward: parseFloat(txExistingAttempt.rewardAmount || "0"),
        };
      }

      // 2. Insert attempt record
      await tx.insert(userComboAttemptsTable).values({
        userId,
        comboDate: todayStr,
        selectedItems: validItems,
        isSuccess: isMatch,
        rewardClaimed: isMatch,
        rewardAmount: rewardFixed,
      });

      // 3. If correct, update balance and log transaction atomically
      if (isMatch) {
        await tx
          .update(usersTable)
          .set({
            goBalance: sql`COALESCE(go_balance, 0) + ${randomReward}`,
            balance: sql`COALESCE(balance, 0) + ${randomReward}`,
          })
          .where(eq(usersTable.id, userId));

        await tx.insert(transactionsTable).values({
          userId,
          type: "daily_combo",
          amount: rewardFixed,
          currency: "GO",
          details: { comboDate: todayStr, selectedItems: validItems, reward: randomReward },
        }).catch(() => {});
      }

      return {
        alreadyAttempted: false,
        isSuccess: isMatch,
        reward: randomReward,
      };
    });

    if (result.alreadyAttempted) {
      res.status(400).json({
        error: "You have already used your daily combo attempt for today.",
        attempted: true,
        isSuccess: result.isSuccess,
        reward: result.reward,
      });
      return;
    }

    if (isMatch) {
      checkAndUpdateReferralQualification(userId, db, getBot()).catch(() => {});
    }

    res.json({
      ok: true,
      isSuccess: isMatch,
      reward: isMatch ? result.reward : 0,
      selectedItems: validItems,
      nextComboAt: tomorrow.toISOString(),
      message: isMatch
        ? `🎉 Combo Completed! You earned: +${result.reward} GO`
        : "❌ Wrong Combo. You didn't complete today's combo. Come back tomorrow!",
    });
  } catch (err) {
    console.error("[DailyCombo] Transaction error during combo check:", err);
    res.status(500).json({ error: "Failed to process combo attempt. Please try again." });
  }
});

export default router;
