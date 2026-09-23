import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { getSetting } from "./settingsCache";
import { calculateUserMining } from "../routes/mining";

export async function addGoBalanceAndClaim(dbClient: any, userId: number, goDelta: number) {
  const [user] = await dbClient.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return null;

  const globalRateStr = await getSetting("global_mining_rate").catch(() => null);
  const globalRate = globalRateStr ? parseFloat(globalRateStr) : 0.03;

  const calc = calculateUserMining(user, globalRate, false);
  const unclaimed = calc.unclaimedGram > 0 ? calc.unclaimedGram : 0;

  const currentGo = parseFloat(user.goBalance || user.balance || "0");
  const newGo = Math.max(0, currentGo + goDelta);

  const [updated] = await dbClient.update(usersTable).set({
    gramBalance: sql`COALESCE(gram_balance, 0) + ${unclaimed}`,
    goBalance: String(newGo),
    balance: String(newGo),
    lastMiningAt: new Date()
  }).where(eq(usersTable.id, userId)).returning();

  return updated;
}

export async function setGoBalanceAndClaim(dbClient: any, userId: number, newGo: number) {
  const [user] = await dbClient.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return null;

  const globalRateStr = await getSetting("global_mining_rate").catch(() => null);
  const globalRate = globalRateStr ? parseFloat(globalRateStr) : 0.03;

  const calc = calculateUserMining(user, globalRate, false);
  const unclaimed = calc.unclaimedGram > 0 ? calc.unclaimedGram : 0;

  const [updated] = await dbClient.update(usersTable).set({
    gramBalance: sql`COALESCE(gram_balance, 0) + ${unclaimed}`,
    goBalance: String(Math.max(0, newGo)),
    balance: String(Math.max(0, newGo)),
    lastMiningAt: new Date()
  }).where(eq(usersTable.id, userId)).returning();

  return updated;
}
