import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { desc, eq, sql, and, gt } from "drizzle-orm";

const router = Router();

router.get("/leaderboard", async (req, res) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : null;

    const top = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        photoUrl: usersTable.photoUrl,
        goBalance: sql<number>`CAST(${usersTable.goBalance} AS float)`,
      })
      .from(usersTable)
      .where(and(eq(usersTable.isVisible, true), gt(sql`CAST(${usersTable.goBalance} AS float)`, 0)))
      .orderBy(desc(sql`CAST(${usersTable.goBalance} AS float)`))
      .limit(20);

    const ranked = top.map((u, i) => ({ rank: i + 1, ...u }));

    let myRank: { rank: number; goBalance: number } | null = null;
    if (userId) {
      const userInTop = ranked.find((u) => u.id === userId);
      if (userInTop) {
        myRank = { rank: userInTop.rank, goBalance: userInTop.goBalance };
      } else {
        const [countRow] = await db
          .select({ cnt: sql<number>`count(*)` })
          .from(usersTable)
          .where(
            and(
              eq(usersTable.isVisible, true),
              sql`CAST(go_balance AS float) > (SELECT CAST(go_balance AS float) FROM users WHERE id = ${userId})`
            )
          );
        const [me] = await db
          .select({ goBalance: sql<number>`CAST(${usersTable.goBalance} AS float)` })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        if (me) {
          myRank = { rank: Number(countRow.cnt) + 1, goBalance: me.goBalance };
        }
      }
    }

    res.setHeader("Cache-Control", "public, max-age=10");
    res.json({ top: ranked, myRank });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

export default router;
