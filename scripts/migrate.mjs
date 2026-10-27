// Applies the SQL migrations in ./drizzle to DATABASE_URL.
// Runs in `vercel-build` before `next build`; a no-op when DATABASE_URL is unset (demo mode).
import path from "node:path";

const url = process.env.DATABASE_URL ?? "";
const migrationsFolder = path.join(process.cwd(), "drizzle");

if (!url) {
  console.log("[migrate] DATABASE_URL not set; skipping (demo mode).");
  process.exit(0);
}

if (url.startsWith("pglite://")) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = url.slice("pglite://".length) || ".data/pglite";
  const client = new PGlite(path.resolve(dir));
  await migrate(drizzle(client), { migrationsFolder });
  await client.close();
} else {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: 1, prepare: false });
  await migrate(drizzle(client), { migrationsFolder });
  await client.end();
}
console.log("[migrate] database is up to date.");
