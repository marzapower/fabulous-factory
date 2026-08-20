import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Client, Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `@factory/db`'s migrations are the single source of truth for `llm_calls`' schema (plan
// F.3) — point straight at that package's migrations folder, mirroring
// packages/core/test/integration/rate-limit.test.ts (F.10.6, the pinned mechanism).
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../db/migrations");

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Same documented exception as packages/core's integration test: test code against a
// disposable database, wired directly from TEST_DATABASE_URL rather than through
// readMergedEnv.
if (!TEST_DATABASE_URL) {
  console.warn(
    "integration tests skipped: set TEST_DATABASE_URL to run packages/llm record integration tests against a real Postgres instance.",
  );
}

describe.skipIf(!TEST_DATABASE_URL)("recordLlmCall (integration)", () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const db = drizzle({ client: pool });

  // Serializes this suite against the other integration suites sharing the disposable
  // database (see the full explanation in packages/db/test/integration/migrations.test.ts
  // — same key there and in packages/core/test/integration/rate-limit.test.ts).
  const INTEGRATION_DB_LOCK_KEY = 4230011;
  const lockClient = new Client({ connectionString: TEST_DATABASE_URL });

  beforeAll(async () => {
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [INTEGRATION_DB_LOCK_KEY]);
  }, 120_000);

  // Self-sufficient: runs the real migrator against MIGRATIONS_FOLDER itself rather than
  // assuming an already-migrated database.
  beforeEach(async () => {
    await pool.query(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    );
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    // `getDb()` (called internally by `recordLlmCall`) is memoized process-wide — set the
    // env var BEFORE dynamically importing `../../src/record` below (F.10.6), never via a
    // static top-of-file import, or the module would freeze onto whatever `DATABASE_URL`
    // happened to be set (or unset) at process start.
    process.env.DATABASE_URL = TEST_DATABASE_URL;
  });

  afterAll(async () => {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [INTEGRATION_DB_LOCK_KEY]);
    await lockClient.end();
    await pool.end();
  });

  it("inserts a success row and reads back every accounting column", async () => {
    const { recordLlmCall } = await import("../../src/record");

    await recordLlmCall({
      promptId: "greeting",
      profile: "direct",
      model: "claude-haiku-4-5",
      quality: "balanced",
      inputTokens: 300,
      outputTokens: 150,
      costCents: 0.105,
      costSource: "estimated",
      latencyMs: 842,
      ok: true,
      errorCode: null,
    });

    const result = await db.execute<{
      prompt_id: string | null;
      profile: string;
      model: string;
      quality: string;
      input_tokens: number | null;
      output_tokens: number | null;
      cost_cents: string | number | null;
      cost_source: string;
      latency_ms: number;
      ok: boolean;
      error_code: string | null;
    }>(sql`select * from llm_calls where prompt_id = ${"greeting"}`);

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    expect(row.profile).toBe("direct");
    expect(row.model).toBe("claude-haiku-4-5");
    expect(row.quality).toBe("balanced");
    expect(row.input_tokens).toBe(300);
    expect(row.output_tokens).toBe(150);
    expect(Number(row.cost_cents)).toBeCloseTo(0.105, 6);
    expect(row.cost_source).toBe("estimated");
    expect(row.latency_ms).toBe(842);
    expect(row.ok).toBe(true);
    expect(row.error_code).toBeNull();
  });

  it("inserts a failure row with NULL usage/cost and the error code set", async () => {
    const { recordLlmCall } = await import("../../src/record");

    await recordLlmCall({
      promptId: null,
      profile: "openrouter",
      model: "anthropic/claude-haiku-4.5",
      quality: "cheap",
      inputTokens: null,
      outputTokens: null,
      costCents: null,
      costSource: "unknown",
      latencyMs: 57,
      ok: false,
      errorCode: "APICallError",
    });

    const result = await db.execute<{
      prompt_id: string | null;
      profile: string;
      input_tokens: number | null;
      output_tokens: number | null;
      cost_cents: string | number | null;
      cost_source: string;
      ok: boolean;
      error_code: string | null;
    }>(sql`select * from llm_calls where model = ${"anthropic/claude-haiku-4.5"}`);

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    expect(row.prompt_id).toBeNull();
    expect(row.profile).toBe("openrouter");
    expect(row.input_tokens).toBeNull();
    expect(row.output_tokens).toBeNull();
    expect(row.cost_cents).toBeNull();
    expect(row.cost_source).toBe("unknown");
    expect(row.ok).toBe(false);
    expect(row.error_code).toBe("APICallError");
  });
});

// Fail-open assertion (F.2.8), declared here rather than as a live DB scenario: `getDb()`
// is memoized per process, and the suite above already commits this process's `getDb()`
// to a real, reachable `TEST_DATABASE_URL` — pointing `DATABASE_URL` at an unreachable
// host in the SAME process wouldn't exercise a fresh connection attempt, it would just
// reuse (or fight over) the already-memoized pool. Per the plan's own fallback clause,
// this is instead a `vi.doMock` unit test of `@factory/db`, isolated via
// `vi.resetModules()` so it never touches the real driver and never depends on
// TEST_DATABASE_URL — it always runs, DB or no DB.
describe("recordLlmCall — fail-open on insert failure (unit)", () => {
  afterEach(() => {
    vi.doUnmock("@factory/db");
    vi.resetModules();
  });

  it("swallows an insert failure, logs it, and never throws to the caller", async () => {
    const insertError = new Error("connection refused");
    const valuesMock = vi.fn().mockRejectedValue(insertError);
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
    const getDbMock = vi.fn().mockReturnValue({ insert: insertMock });

    vi.resetModules();
    vi.doMock("@factory/db", () => ({
      getDb: getDbMock,
      schema: { llmCalls: {} },
    }));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { recordLlmCall } = await import("../../src/record");

    await expect(
      recordLlmCall({
        promptId: null,
        profile: "direct",
        model: "claude-haiku-4-5",
        quality: "balanced",
        inputTokens: null,
        outputTokens: null,
        costCents: null,
        costSource: "unknown",
        latencyMs: 12,
        ok: false,
        errorCode: "APICallError",
      }),
    ).resolves.toBeUndefined();

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain("failed to record llm_calls row");

    errorSpy.mockRestore();
  });
});
