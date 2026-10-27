import "server-only";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Database connection.
 *
 *   DATABASE_URL unset            → demo mode (browser-only workspace, no backend)
 *   DATABASE_URL=pglite://<dir>   → embedded Postgres (PGlite) for local development and tests
 *   DATABASE_URL=postgres://…     → any hosted Postgres (Neon, Supabase, RDS…)
 *
 * PGlite databases migrate themselves on first use; hosted Postgres is
 * migrated by `npm run db:migrate` (run automatically by `vercel-build`).
 */

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

export const databaseUrl = () => process.env.DATABASE_URL ?? "";
export const dbEnabled = () => !!databaseUrl();

const MIGRATIONS = path.join(process.cwd(), "drizzle");

interface Holder {
  db?: Promise<DB>;
}
// Survives dev-server hot reloads so PGlite is opened once.
const holder = ((globalThis as { __pressflowDb?: Holder }).__pressflowDb ??= {});

async function open(): Promise<DB> {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (url.startsWith("pglite://")) {
    const dir = url.slice("pglite://".length) || ".data/pglite";
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const client = dir === "memory" ? new PGlite() : new PGlite(path.resolve(dir));
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as DB;
  }
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  // Serverless functions: small pool; `prepare: false` keeps PgBouncer-style poolers happy.
  const client = postgres(url, { max: Number(process.env.DATABASE_POOL ?? 3), prepare: false, idle_timeout: 20 });
  return drizzle(client, { schema }) as unknown as DB;
}

export function db(): Promise<DB> {
  holder.db ??= open().catch((e) => {
    holder.db = undefined;
    throw e;
  });
  return holder.db;
}

export { schema };
