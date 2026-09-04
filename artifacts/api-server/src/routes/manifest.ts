import { Router, type Request, type Response } from "express";

const router = Router();

function resolveAppUrl(req: Request): string {
  // 1. Replit dev — always correct public hostname
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }

  // 2. Production stable alias URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  // 3. Per-deployment URL fallback
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // 4. Explicit override (production / custom domain)
  if (process.env.MINI_APP_URL) {
    try {
      const parsed = new URL(process.env.MINI_APP_URL);
      parsed.port = ""; // strip internal dev port
      return parsed.origin;
    } catch {
      return process.env.MINI_APP_URL.replace(/\/$/, "");
    }
  }

  // 5. Derive from request headers
  const host = req.get("x-forwarded-host") || req.get("host");
  if (host) {
    const proto = req.get("x-forwarded-proto") || req.protocol || "https";
    return `${proto}://${host}`;
  }

  // 6. Default to Replit domain or default URL
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  return replitDomain ? `https://${replitDomain}` : "https://gram-go-ivory.vercel.app";
}

router.get("/tonconnect-manifest.json", (req: Request, res: Response) => {
  const appUrl = resolveAppUrl(req);

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
