import { Router, type Request, type Response } from "express";
import TelegramBot from "node-telegram-bot-api";
import https from "https";
import http from "http";

import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();
const getBot = () => new TelegramBot(process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "", { polling: false });

const cache: Record<string, { data: Buffer; contentType: string; ts: number }> = {};
const TTL = 60 * 60 * 1000;

async function fetchBuffer(url: string): Promise<{ data: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({
        data: Buffer.concat(chunks),
        contentType: res.headers["content-type"] || "image/jpeg",
      }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

router.get("/avatar/:username", async (req: Request, res: Response) => {
  const usernameParam = String(req.params.username).replace(/^@/, "").trim();
  const now = Date.now();

  if (cache[usernameParam] && now - cache[usernameParam].ts < TTL) {
    res.setHeader("Content-Type", cache[usernameParam].contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(cache[usernameParam].data); return;
  }

  try {
    let userId = parseInt(usernameParam);
    if (isNaN(userId)) {
      const [u] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.username, usernameParam))
        .limit(1);
      if (u) userId = u.id;
    }
    if (!userId || isNaN(userId)) { res.status(404).json({ error: "unknown user" }); return; }

    const botInst = getBot();
    const photos = await botInst.getUserProfilePhotos(userId, { limit: 1 });
    if (!photos.total_count || !photos.photos[0]?.length) {
      res.status(404).json({ error: "no photo" }); return;
    }

    // Pick the largest size
    const sizes = photos.photos[0];
    const best = sizes[sizes.length - 1];
    const link = await botInst.getFileLink(best.file_id);
    const { data, contentType } = await fetchBuffer(link);

    cache[usernameParam] = { data, contentType, ts: now };
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(data);
  } catch (err) {
    res.status(404).json({ error: "not found" });
  }
});

export default router;
