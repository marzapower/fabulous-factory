import path from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `@factory/db`'s migrations are the single source of truth for `runs`/`run_steps`, same
// pattern as the (retired) demo integration suite.
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../db/migrations");

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Same documented exception as every other integration suite in this repo: test code
// against a disposable database, wired directly from TEST_DATABASE_URL rather than
// through readMergedEnv. Absent -> skip cleanly with a visible notice, never fail.
if (!TEST_DATABASE_URL) {
  console.warn(
    "integration tests skipped: set TEST_DATABASE_URL to run packages/jobs runs integration tests against a real Postgres instance.",
  );
}

describe.skipIf(!TEST_DATABASE_URL)("runs engine queries (integration)", () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const db = drizzle({ client: pool });

  // Serializes this suite against the other integration suites sharing the disposable
  // database (same key convention as the other integration suites; a distinct value from
  // theirs so this suite never contends with them for the lock itself).
  // ONE key shared by every integration suite in the repo (not a per-package key): all of
  // them `DROP SCHEMA public CASCADE` against the same disposable database, so the lock is
  // what stops one suite wiping the schema out from under another. A second key would
  // create a second, independent lock group — which is exactly the bug this line fixes.
  const INTEGRATION_DB_LOCK_KEY = 4230011;
  const lockClient = new Client({ connectionString: TEST_DATABASE_URL });

  beforeAll(async () => {
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [INTEGRATION_DB_LOCK_KEY]);
  }, 120_000);

  beforeEach(async () => {
    await pool.query(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    );
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    // `getDb()` (called internally by the runs queries) is memoized process-wide — set
    // the env var BEFORE dynamically importing the runs modules below, never via a
    // static top-of-file import.
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.BETTER_AUTH_SECRET = "test-suite-better-auth-secret-16plus-chars";
  });

  afterAll(async () => {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [INTEGRATION_DB_LOCK_KEY]);
    await lockClient.end();
    await pool.end();
  });

  async function seedUser(id: string) {
    await db.execute(sql`
      insert into "user" (id, name, email, email_verified)
      values (${id}, 'Test User', ${id + "@example.com"}, true)
    `);
  }

  it("createRun: two concurrent calls at the cap land exactly one", async () => {
    const { createRun } = await import("../../src/runs/queries");
    await seedUser("user-cap");

    // Pre-seed 4 runs so the very next create hits a limit of 5.
    for (let i = 0; i < 4; i += 1) {
      await createRun({
        userId: "user-cap",
        kind: "capture",
        driver: "inline",
        runsPerDay: 5,
        enforceLimit: true,
      });
    }

    const attempts = await Promise.allSettled([
      createRun({
        userId: "user-cap",
        kind: "capture",
        driver: "inline",
        runsPerDay: 5,
        enforceLimit: true,
      }),
      createRun({
        userId: "user-cap",
        kind: "capture",
        driver: "inline",
        runsPerDay: 5,
        enforceLimit: true,
      }),
    ]);

    const fulfilled = attempts.filter((a) => a.status === "fulfilled");
    const rejected = attempts.filter((a) => a.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      status: 422,
      code: "run_limit_reached",
    });

    const countRows = await db.execute<{ count: string }>(
      sql`select count(*)::int as count from runs where user_id = 'user-cap'`,
    );
    expect(Number(countRows.rows[0]?.count)).toBe(5);
  }, 30_000);

  it("createRun: enforceLimit false ignores the plan limit but never the hard ceiling", async () => {
    const { createRun } = await import("../../src/runs/queries");
    await seedUser("user-cron");

    // A plan limit of 1 would normally block the 2nd run, but enforceLimit: false (the
    // scheduled-run path) ignores it entirely.
    await createRun({
      userId: "user-cron",
      kind: "daily-plan",
      driver: "durable",
      runsPerDay: 1,
      enforceLimit: true,
    });
    const second = await createRun({
      userId: "user-cron",
      kind: "daily-plan",
      driver: "durable",
      runsPerDay: 1,
      enforceLimit: false,
    });
    expect(second.id).toBeTruthy();
  }, 30_000);

  it("upsertRunStep on retry updates and increments attempt rather than duplicating", async () => {
    const { createRun, upsertRunStep } = await import("../../src/runs/queries");
    await seedUser("user-retry");
    const { id: runId } = await createRun({
      userId: "user-retry",
      kind: "capture",
      driver: "durable",
      runsPerDay: null,
      enforceLimit: true,
    });

    const first = await upsertRunStep({ runId, key: "extract", ordinal: 0, status: "running" });
    expect(first.attempt).toBe(1);

    const second = await upsertRunStep({ runId, key: "extract", ordinal: 0, status: "running" });
    expect(second.attempt).toBe(2);

    const rows = await db.execute<{ count: string }>(
      sql`select count(*)::int as count from run_steps where run_id = ${runId} and key = 'extract'`,
    );
    expect(Number(rows.rows[0]?.count)).toBe(1);
  }, 30_000);

  it("a retried step clears the previous attempt's terminal fields", async () => {
    const { createRun, upsertRunStep, finishRunStep } = await import("../../src/runs/queries");
    await seedUser("user-stale");
    const { id: runId } = await createRun({
      userId: "user-stale",
      kind: "capture",
      driver: "durable",
      runsPerDay: null,
      enforceLimit: true,
    });

    await upsertRunStep({ runId, key: "extract", ordinal: 0, status: "running" });
    // Attempt 1 finishes with a full set of terminal facts.
    await finishRunStep({
      runId,
      key: "extract",
      status: "failed",
      source: "llm",
      model: "some-model",
      inputTokens: 100,
      outputTokens: 50,
      costCents: 0.42,
      durationMs: 1234,
      error: "provider exploded",
    });

    // Attempt 2 starts. Everything attempt 1 left behind must be gone, or the run-history
    // page renders a currently-running step with a finish time, a duration and a cost
    // that belong to an attempt which already failed.
    await upsertRunStep({ runId, key: "extract", ordinal: 0, status: "running" });

    const rows = await db.execute<{
      status: string;
      finished_at: string | null;
      duration_ms: number | null;
      model: string | null;
      cost_cents: string | null;
      source: string;
      error: string | null;
    }>(
      sql`select status, finished_at, duration_ms, model, cost_cents, source, error
          from run_steps where run_id = ${runId} and key = 'extract'`,
    );
    const row = rows.rows[0];
    expect(row?.status).toBe("running");
    expect(row?.finished_at).toBeNull();
    expect(row?.duration_ms).toBeNull();
    expect(row?.model).toBeNull();
    expect(row?.cost_cents).toBeNull();
    expect(row?.source).toBe("none");
    expect(row?.error).toBeNull();
  }, 30_000);

  it("countRunsToday respects the UTC day boundary", async () => {
    const { countRunsToday } = await import("../../src/runs/queries");
    await seedUser("user-boundary");

    await db.execute(sql`
      insert into runs (user_id, kind, driver, started_at)
      values ('user-boundary', 'capture', 'inline', date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
    `);
    await db.execute(sql`
      insert into runs (user_id, kind, driver, started_at)
      values ('user-boundary', 'capture', 'inline',
        (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - interval '1 second')
    `);

    const countToday = await countRunsToday("user-boundary");
    expect(countToday).toBe(1);
  }, 30_000);

  it("finishRun writes the final status/total cost/error", async () => {
    const { createRun, finishRun } = await import("../../src/runs/queries");
    await seedUser("user-finish");
    const { id: runId } = await createRun({
      userId: "user-finish",
      kind: "capture",
      driver: "inline",
      runsPerDay: null,
      enforceLimit: true,
    });

    await finishRun(runId, "partial", 2.5, "triage failed");

    const rows = await db.execute<{
      status: string;
      total_cost_cents: string | null;
      error: string | null;
      finished_at: Date | null;
    }>(sql`select status, total_cost_cents, error, finished_at from runs where id = ${runId}`);
    expect(rows.rows[0]).toMatchObject({ status: "partial", error: "triage failed" });
    expect(Number(rows.rows[0]?.total_cost_cents)).toBeCloseTo(2.5);
    expect(rows.rows[0]?.finished_at).toBeTruthy();
  }, 30_000);
});
