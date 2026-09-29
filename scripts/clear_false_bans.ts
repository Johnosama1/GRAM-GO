import { db } from "@workspace/db";
import { usersTable, bansTable } from "@workspace/db/schema";
import { eq, inArray, and } from "drizzle-orm";

async function main() {
  console.log("Starting unban process for users falsely flagged by duplicate logic...");

  // Find all active bans with reason "duplicate_account" and bannedBy "system"
  const falseBans = await db
    .select({ userId: bansTable.userId, id: bansTable.id })
    .from(bansTable)
    .where(
      and(
        eq(bansTable.reason, "duplicate_account"),
        eq(bansTable.bannedBy, "system"),
        eq(bansTable.isActive, true)
      )
    );

  console.log(`Found ${falseBans.length} users to unban.`);

  if (falseBans.length === 0) {
    console.log("No false bans to clear.");
    process.exit(0);
  }

  const userIds = falseBans.map(b => b.userId);
  const banIds = falseBans.map(b => b.id);

  // Unban users in usersTable
  const userResult = await db
    .update(usersTable)
    .set({ isVisible: true })
    .where(inArray(usersTable.id, userIds));

  console.log(`Reset isVisible: true for users in usersTable.`);

  // Deactivate bans in bansTable
  const banResult = await db
    .update(bansTable)
    .set({ isActive: false })
    .where(inArray(bansTable.id, banIds));

  console.log(`Set isActive: false for corresponding bans in bansTable.`);

  console.log("Unban process complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error running unban script:", err);
  process.exit(1);
});
