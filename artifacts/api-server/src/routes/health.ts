import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { milestonesTable } from "@workspace/db/schema";
import { sql, asc, eq } from "drizzle-orm";
import { getSetting } from "../lib/settingsCache";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/config", async (_req, res) => {
  const [
    rawRef,
    rawTask,
    rawMin,
    rawDepositWallet,
    rawMinDeposit,
    rawGramRate,
  ] = await Promise.all([
    getSetting("referral_threshold").catch(() => null),
    getSetting("task_threshold").catch(() => null),
    getSetting("min_withdrawal").catch(() => null),
    getSetting("deposit_wallet_address").catch(() => null),
    getSetting("min_deposit").catch(() => null),
    getSetting("gram_to_go_rate").catch(() => null),
  ]);
  res.json({
    botUsername: process.env.BOT_USERNAME || "GRAMGO1_bot",
    referralThreshold: Math.max(1, parseInt(rawRef ?? "5") || 5),
    taskThreshold: Math.max(1, parseInt(rawTask ?? "5") || 5),
    minWithdrawal: Math.max(0.01, parseFloat(rawMin ?? "0.1") || 0.1),
    depositWalletAddress:
      rawDepositWallet ||
      process.env.WALLET_ADDRESS ||
      "UQD2_1mZ8p4Fk8_e2m8pWq98bWbV57YkXj5Xv_9Xb4vB2B_1",
    minDeposit: Math.max(0.01, parseFloat(rawMinDeposit ?? "0.1") || 0.1),
    gramToGoRate: Math.max(1, parseFloat(rawGramRate ?? "800") || 800),
  });
});

// ── Public milestones endpoint for referrals ────────────────────────────────
router.get("/milestones", async (_req, res) => {
  try {
    const list = await db
      .select()
      .from(milestonesTable)
      .where(eq(milestonesTable.isActive, true))
      .orderBy(asc(milestonesTable.requiredReferrals));

    if (list.length > 0) {
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(list);
      return;
    }
  } catch (err) {
    // If table doesn't exist yet or query fails, fall back to default tiers
  }

  // Fallback default tiers
  const defaultMilestones = [
    {
      id: 1,
      requiredReferrals: 5,
      rewardAmount: "3",
      rewardCurrency: "GO",
      isRepeatable: false,
      isActive: true,
    },
    {
      id: 2,
      requiredReferrals: 10,
      rewardAmount: "10",
      rewardCurrency: "GO",
      isRepeatable: false,
      isActive: true,
    },
    {
      id: 3,
      requiredReferrals: 25,
      rewardAmount: "25",
      rewardCurrency: "GO",
      isRepeatable: false,
      isActive: true,
    },
    {
      id: 4,
      requiredReferrals: 50,
      rewardAmount: "60",
      rewardCurrency: "GO",
      isRepeatable: false,
      isActive: true,
    },
    {
      id: 5,
      requiredReferrals: 100,
      rewardAmount: "150",
      rewardCurrency: "GO",
      isRepeatable: false,
      isActive: true,
    },
  ];

  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(defaultMilestones);
});

// ── Diagnostic endpoint — shows DB + env status (safe, no secrets exposed) ──
router.get("/debug", async (_req, res) => {
  let dbOk = false;
  let dbError = "";
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch (e) {
    dbError = e instanceof Error ? e.message.slice(0, 120) : String(e);
  }

  res.json({
    db: dbOk ? "✅ connected" : `❌ ${dbError}`,
    env: {
      NODE_ENV: process.env.NODE_ENV || "—",
      NEON_DATABASE_URL: process.env.NEON_DATABASE_URL
        ? "✅ set"
        : "❌ missing",
      DATABASE_URL: process.env.DATABASE_URL ? "✅ set" : "❌ missing",
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN
        ? "✅ set"
        : "❌ missing",
      BOT_TOKEN: process.env.BOT_TOKEN ? "✅ set" : "❌ missing",
      SESSION_TOKEN_SECRET: process.env.SESSION_TOKEN_SECRET
        ? "✅ set"
        : "— (using BOT_TOKEN fallback)",
      BOT_WEBHOOK_URL: process.env.BOT_WEBHOOK_URL || "❌ missing",
      MINI_APP_URL: process.env.MINI_APP_URL || "— (using Vercel auto-detect)",
      VERCEL_URL: process.env.VERCEL_URL || "— (not Vercel)",
      VERCEL_PROJECT_PRODUCTION_URL:
        process.env.VERCEL_PROJECT_PRODUCTION_URL || "— (not Vercel)",
    },
  });
});

export default router;
