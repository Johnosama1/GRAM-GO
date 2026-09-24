import { resolveAppUrl } from "../lib/envUrls";
import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/tonconnect-manifest.json", (req: Request, res: Response) => {
  const appUrl = resolveAppUrl();

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  res.json({
    url: appUrl,
    name: "Gram GO APP",
    iconUrl: `${appUrl}/bot-icon.png`,
  });
});

export default router;
