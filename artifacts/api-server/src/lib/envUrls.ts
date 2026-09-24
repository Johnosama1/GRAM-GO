export function resolveAppUrl(): string {
  // 1. Explicit overrides
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }
  if (process.env.MINI_APP_URL) {
    return process.env.MINI_APP_URL.replace(/\/$/, "");
  }

  // 2. Vercel System Environment Variables (Stable Production URL)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  // 3. Vercel deployment specific URL (Fallback when system env vars aren't fully configured)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // 4. Replit Dev / Production domains
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) {
    return `https://${replitDomain}`;
  }

  // Safe fallback to bot link if no domain can be derived automatically
  return "https://t.me/GramGO1_bot/app";
}

export function resolveMiniAppUrl(): string {
  const url = resolveAppUrl();
  return url.endsWith("/") ? url : `${url}/`;
}

export function resolveWebhookUrl(): string | null {
  // 1. Explicit override (recommended for production if dynamic resolution fails)
  if (process.env.BOT_WEBHOOK_URL) {
    return process.env.BOT_WEBHOOK_URL;
  }

  // 2. Derive from the automatically resolved App URL
  const appUrl = resolveAppUrl();
  if (appUrl && appUrl.startsWith("https://") && !appUrl.includes("t.me/")) {
    return `${appUrl}/api/webhook`;
  }

  return null;
}
