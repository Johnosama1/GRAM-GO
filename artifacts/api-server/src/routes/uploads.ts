import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { uploadsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

export interface CachedUpload {
  id: number;
  filename: string;
  mimeType: string;
  data: string;
  size: number;
}

// In-memory cache for high-speed serving and resilient offline/serverless fallback
export const uploadsMemoryCache = new Map<number, CachedUpload>();
let _nextFallbackId = 1000;

export function getNextFallbackId(): number {
  return ++_nextFallbackId;
}

// ── GET /api/uploads/:id — Public route to serve uploaded images ──────
router.get("/:id", async (req: Request, res: Response) => {
  const uploadId = parseInt(String(req.params.id));
  if (isNaN(uploadId) || uploadId <= 0) {
    res.status(400).json({ error: "Invalid upload ID" });
    return;
  }

  try {
    let upload = uploadsMemoryCache.get(uploadId);

    if (!upload) {
      try {
        const [dbRow] = await db
          .select()
          .from(uploadsTable)
          .where(eq(uploadsTable.id, uploadId))
          .limit(1);

        if (dbRow) {
          upload = {
            id: dbRow.id,
            filename: dbRow.filename,
            mimeType: dbRow.mimeType,
            data: dbRow.data,
            size: dbRow.size,
          };
          uploadsMemoryCache.set(uploadId, upload);
        }
      } catch (dbErr) {
        logger.warn({ dbErr, uploadId }, "DB fetch failed for upload, checking cache");
      }
    }

    if (!upload) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    // Extract raw base64 data (strip data URL scheme prefix if present)
    let cleanBase64 = upload.data;
    if (cleanBase64.includes(",")) {
      cleanBase64 = cleanBase64.split(",")[1];
    }

    const buf = Buffer.from(cleanBase64, "base64");
    res.setHeader("Content-Type", upload.mimeType || "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Length", buf.length);
    res.send(buf);
  } catch (err) {
    logger.error({ err, uploadId }, "Error retrieving upload");
    res.status(500).json({ error: "Failed to load image" });
  }
});

export default router;
