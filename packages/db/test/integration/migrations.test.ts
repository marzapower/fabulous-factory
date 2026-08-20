import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../migrations");

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Documented exception to the "env access only via readMergedEnv" rule: this is test
// code against a disposable database, wired directly from `TEST_DATABASE_URL` — not
// app/script env resolution.
if (!TEST_DATABASE_URL) {
  console.warn(
    "integration tests skipped: set TEST_DATABASE_URL to run packages/db migration integration tests against a real Postgres instance.",
  );
}

describe.skipIf(!TEST_DATABASE_URL)("migrations (integration)", () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });

  afterAll(async () => {
    await pool.end();
  });

  it("creates the four Better Auth tables", async () => {
    // Idempotent-ish reruns: drop and recreate both the `public` schema (where the app
    // tables live) AND the `drizzle` schema (where the migrator's own
    // `__drizzle_migrations` bookkeeping table lives — a separate schema, so dropping
    // only `public` would leave that history in place and the migrator would think the
    // migration already ran, skipping it and leaving `public` empty). `migrate()`
    // recreates the `drizzle` schema itself. Simplest robust approach for a disposable,
    // test-only database — avoids hand-rolling per-table teardown kept in sync with the
    // schema.
    await pool.query(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    );

    const db = drizzle({ client: pool });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const result = await db.execute(sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('user', 'session', 'account', 'verification')
      `);
    const tableNames = new Set(result.rows.map((row) => String(row.table_name)));

    expect(tableNames).toEqual(new Set(["user", "session", "account", "verification"]));
  }, 30_000);
});
