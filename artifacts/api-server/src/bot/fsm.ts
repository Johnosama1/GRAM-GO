import { db } from "@workspace/db";
import { fsmStatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface FsmStateData {
  step: string;
  metadata?: Record<string, unknown>;
}

// In-memory cache backed by DB for zero latency and persistent state across restarts
const memoryState = new Map<number, FsmStateData>();

export async function setAdminState(userId: number, step: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const data: FsmStateData = { step, metadata };
  memoryState.set(userId, data);

  try {
    await db
      .insert(fsmStatesTable)
      .values({
        userId,
        state: step,
        metadata,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: fsmStatesTable.userId,
        set: {
          state: step,
          metadata,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    logger.error({ err, userId, step }, "Error persisting FSM state to DB");
  }
}

export async function getAdminState(userId: number): Promise<FsmStateData | null> {
  if (memoryState.has(userId)) {
    return memoryState.get(userId)!;
  }

  try {
    const [row] = await db
      .select()
      .from(fsmStatesTable)
      .where(eq(fsmStatesTable.userId, userId))
      .limit(1);

    if (row && row.state) {
      const data: FsmStateData = {
        step: row.state,
        metadata: (row.metadata as Record<string, unknown>) || {},
      };
      memoryState.set(userId, data);
      return data;
    }
  } catch (err) {
    logger.error({ err, userId }, "Error fetching FSM state from DB");
  }

  return null;
}

export async function clearAdminState(userId: number): Promise<void> {
  memoryState.delete(userId);
  try {
    await db.delete(fsmStatesTable).where(eq(fsmStatesTable.userId, userId));
  } catch (err) {
    logger.error({ err, userId }, "Error clearing FSM state from DB");
  }
}
