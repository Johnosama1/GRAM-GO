import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Neon PostgreSQL database connection (Server-Side only)
// Uses standard DATABASE_URL environment variable on Vercel/Production
const connectionString =
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  "";

const isServerless =
  !!process.env.VERCEL ||
  !!process.env.VERCEL_ENV ||
  process.env.NODE_ENV === "production";

export const pool = new Pool({
  connectionString: connectionString || "postgresql://dummy:dummy@localhost:5432/dummy",
  min: isServerless ? 0 : 1,
  max: isServerless ? 3 : 10,
  idleTimeoutMillis: isServerless ? 10_000 : 30_000,
  connectionTimeoutMillis: 5_000,
  keepAlive: !isServerless,
  keepAliveInitialDelayMillis: 10_000,
  ssl: connectionString.includes("neon.tech") || connectionString.includes("sslmode=require") || isServerless
    ? { rejectUnauthorized: false }
    : undefined,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
