#!/usr/bin/env tsx
/**
 * Runs pending Drizzle migrations against `DATABASE_URL`.
 *
 * Builds its own `Pool` here — never imports `../src/index.ts`, whose first line is
 * `import "server-only"` (that poison throws outside the `react-server` condition and
 * would kill this script under plain `tsx`).
 *
 * Two modes:
 *   - plain (default): used by `pnpm db:migrate` and CI. Hard-fails (non-zero exit) on
 *     any error — missing `DATABASE_URL`, unreachable DB, or a migration error.
 *   - `--predev`: used by `apps/web`'s `dev` script ahead of `next dev`. ALWAYS exits 0,
 *     so `pnpm dev` never fails to start:
 *       - `FACTORY_SKIP_MIGRATIONS=1` → skip entirely, print why.
 *       - `DATABASE_URL` missing/unset → warn with a hint, continue without migrating.
 *       - DB unreachable → warn with a hint (e.g. "is Postgres running?"), continue.
 *       - DB reachable → run pending migrations normally.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readMergedEnv } from "@factory/config/node";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolved relative to this file, NOT `process.cwd()` — `pnpm db:migrate` and the
// `apps/web` predev hook both invoke this script via `tsx` from different working
// directories, so a cwd-relative path would be fragile.
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../migrations");

const isPredev = process.argv.includes("--predev");

async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    const db = drizzle({ client: pool });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  // Read the registered vars through the shared merged view (.env merged under the real
  // environment) so FACTORY_SKIP_MIGRATIONS works from the .env file too, like every
  // other registered variable.
  const env = readMergedEnv();

  if (isPredev && env.FACTORY_SKIP_MIGRATIONS === "1") {
    console.log("[db:migrate] FACTORY_SKIP_MIGRATIONS=1 — skipping predev migrations.");
    return;
  }

  const connectionString = env.DATABASE_URL;

  if (!connectionString) {
    const message =
      "[db:migrate] DATABASE_URL is not set — see .env.example. Set it in your environment or .env file.";
    if (isPredev) {
      console.warn(`${message} Continuing without running migrations.`);
      return;
    }
    throw new Error(message);
  }

  try {
    console.log("[db:migrate] Running pending migrations...");
    await runMigrations(connectionString);
    console.log("[db:migrate] Done.");
  } catch (error) {
    if (isPredev) {
      console.warn(
        "[db:migrate] Could not run migrations — is Postgres running and DATABASE_URL correct?",
      );
      console.warn(`[db:migrate] ${error instanceof Error ? error.message : String(error)}`);
      console.warn("[db:migrate] Continuing to start `pnpm dev` anyway.");
      return;
    }
    throw error;
  }
}

main()
  .then(() => {
    // --predev always exits 0, even on a handled warning path above (no throw reaches
    // here in that case). Plain mode reaching here means success too.
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error("[db:migrate] Migration failed:");
    console.error(error);
    // Plain mode: hard-fail. --predev mode: every failure path above is caught and
    // returns normally, so this catch only fires for a truly unexpected throw — still
    // exit 0 to honor the "pnpm dev always starts" contract.
    process.exitCode = isPredev ? 0 : 1;
  });
