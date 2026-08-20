import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `@factory/db`'s migrations are the single source of truth for `rate_limits`' schema
// (plan D.3) — point straight at that package's migrations folder rather than
// duplicating it, so this test can never drift from the real table shape.
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../db/migrations");

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Documented exception to the "env access only via readMergedEnv" rule: this is test
// code against a disposable database, wired directly from `TEST_DATABASE_URL` — not
// app/script env resolution (same exception packages/db's own integration test takes).
if (!TEST_DATABASE_URL) {
  console.warn(
    "integration tests skipped: set TEST_DATABASE_URL to run packages/core rate-limit integration tests against a real Postgres instance.",
  );
}

describe.skipIf(!TEST_DATABASE_URL)("checkRateLimit (integration)", () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const db = drizzle({ client: pool });

  // Serializes this suite against the other integration suites sharing the disposable
  // database (see the full explanation in packages/db/test/integration/migrations.test.ts
  // — same key there and in packages/llm/test/integration/record.test.ts).
  const INTEGRATION_DB_LOCK_KEY = 4230011;
  const lockClient = new Client({ connectionString: TEST_DATABASE_URL });

  beforeAll(async () => {
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [INTEGRATION_DB_LOCK_KEY]);
  }, 120_000);

  // Self-sufficient (plan D.4): runs the real migrator against `MIGRATIONS_FOLDER`
  // itself rather than assuming an already-migrated database, mirroring
  // packages/db/test/integration/migrations.test.ts.
  beforeEach(async () => {
    await pool.query(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    );
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    // `getDb()` is memoized process-wide (plan: `packages/db`'s `getDb()` caches a
    // single pool) — but this test process only ever imports `@factory/core`'s
    // `checkRateLimit`, which calls `getDb()` internally and gets its OWN pool pointed
    // at `TEST_DATABASE_URL` via that same env var, exactly like the unit-level DB
    // access packages/db/test/integration relies on. Setting it here (rather than
    // importing `readMergedEnv`) keeps this test wired directly to the disposable DB,
    // never to a real `.env`.
    process.env.DATABASE_URL = TEST_DATABASE_URL;
  });

  afterAll(async () => {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [INTEGRATION_DB_LOCK_KEY]);
    await lockClient.end();
    await pool.end();
  });

  it("allows requests under the limit and reports decreasing remaining", async () => {
    const { checkRateLimit } = await import("../../src/rate-limit");
    const name = "integration-under-limit";
    const subject = "user:alice";

    const first = await checkRateLimit({ name, subject, windowSeconds: 60, max: 3 });
    expect(first).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: expect.any(Number) });

    const second = await checkRateLimit({ name, subject, windowSeconds: 60, max: 3 });
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(1);
  });

  it("denies once max is exceeded, within the same window", async () => {
    const { checkRateLimit } = await import("../../src/rate-limit");
    const name = "integration-over-limit";
    const subject = "user:bob";

    for (let i = 0; i < 3; i += 1) {
      const result = await checkRateLimit({ name, subject, windowSeconds: 60, max: 3 });
      expect(result.allowed).toBe(true);
    }

    const fourth = await checkRateLimit({ name, subject, windowSeconds: 60, max: 3 });
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("rolls to a fresh window once windowSeconds elapses, resetting the count", async () => {
    const { checkRateLimit } = await import("../../src/rate-limit");
    const name = "integration-window-roll";
    const subject = "user:carol";
    // A 1-second window keeps the test fast while still exercising a real epoch-math
    // window roll (plan D.9.1 — app-side `floor(now/windowMs)*windowMs`).
    const windowSeconds = 1;

    const first = await checkRateLimit({ name, subject, windowSeconds, max: 1 });
    expect(first.allowed).toBe(true);

    const second = await checkRateLimit({ name, subject, windowSeconds, max: 1 });
    expect(second.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, windowSeconds * 1000 + 200));

    const third = await checkRateLimit({ name, subject, windowSeconds, max: 1 });
    expect(third.allowed).toBe(true);
  }, 10_000);

  it("keeps independent counters per subject and per name", async () => {
    const { checkRateLimit } = await import("../../src/rate-limit");

    const forAlice = await checkRateLimit({
      name: "integration-independent",
      subject: "user:alice-2",
      windowSeconds: 60,
      max: 1,
    });
    const forBob = await checkRateLimit({
      name: "integration-independent",
      subject: "user:bob-2",
      windowSeconds: 60,
      max: 1,
    });
    const differentName = await checkRateLimit({
      name: "integration-independent-other",
      subject: "user:alice-2",
      windowSeconds: 60,
      max: 1,
    });

    expect(forAlice.allowed).toBe(true);
    expect(forBob.allowed).toBe(true);
    expect(differentName.allowed).toBe(true);
  });

  it("N concurrent increments land exactly N (atomic upsert under concurrency)", async () => {
    const { checkRateLimit } = await import("../../src/rate-limit");
    const name = "integration-concurrency";
    const subject = "user:dave";
    const CONCURRENCY = 25;

    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        checkRateLimit({ name, subject, windowSeconds: 60, max: CONCURRENCY }),
      ),
    );

    // Every one of the N concurrent calls must have been allowed (max === N) and, taken
    // together, they must have produced N DISTINCT counter values 1..N — proof the
    // atomic `ON CONFLICT DO UPDATE SET count = count + 1` never lost or duplicated an
    // increment under concurrency.
    expect(results.every((r) => r.allowed)).toBe(true);
    const remainders = results.map((r) => r.remaining).sort((a, b) => a - b);
    expect(remainders).toEqual(Array.from({ length: CONCURRENCY }, (_, i) => i));

    const result = await db.execute<{ count: number }>(
      sql`select count from rate_limits where key = ${`${name}:${subject}`}`,
    );
    expect(Number(result.rows[0]?.count)).toBe(CONCURRENCY);
  });

  it("prunes windows strictly older than the current one", async () => {
    const { checkRateLimit } = await import("../../src/rate-limit");
    const name = "integration-prune";
    const subject = "user:erin";

    // A stale row from a window that has already passed.
    await db.execute(
      sql`insert into rate_limits (key, window_start, count) values (${`${name}:${subject}`}, ${new Date(0)}, 1)`,
    );

    // A fresh call always attempts an opportunistic prune on its own window roll
    // (count === 1 for a brand-new key here) — give the fire-and-forget prune a moment
    // to complete before asserting.
    await checkRateLimit({ name, subject, windowSeconds: 60, max: 5 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stale = await db.execute(
      sql`select 1 from rate_limits where key = ${`${name}:${subject}`} and window_start = ${new Date(0)}`,
    );
    expect(stale.rows.length).toBe(0);
  });

  it("a short-window prune does NOT delete a still-current longer-window row (B1)", async () => {
    const { checkRateLimit } = await import("../../src/rate-limit");
    const subject = "user:heidi";

    // Long-window bucket (1 hour). Its row's `window_start` is the top of the current
    // hour — much earlier than a fresh 1-second window's start, but still very much
    // CURRENT under its own 3600s policy.
    const longWindowName = "integration-b1-long";
    const first = await checkRateLimit({
      name: longWindowName,
      subject,
      windowSeconds: 3600,
      max: 5,
    });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(4);

    // A DIFFERENT, short-window (1s) bucket rolls to a fresh window and triggers the
    // opportunistic prune (count === 1 is the "window roll" signal). Before the B1
    // fix, pruning deleted every row with `window_start` older than THIS call's own
    // (sub-second-old) window start — which includes the long-window row above.
    const shortWindowName = "integration-b1-short";
    await checkRateLimit({ name: shortWindowName, subject, windowSeconds: 1, max: 5 });
    await new Promise((resolve) => setTimeout(resolve, 100)); // let the fire-and-forget prune settle

    // If the long-window row had been wiped, this next call would land on a fresh
    // INSERT (count restarts at 1, remaining 4) instead of incrementing the SAME row
    // (count 2, remaining 3) — so `remaining === 3` is proof the row survived.
    const second = await checkRateLimit({
      name: longWindowName,
      subject,
      windowSeconds: 3600,
      max: 5,
    });
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(3);
  });
});
