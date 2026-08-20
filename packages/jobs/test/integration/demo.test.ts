import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `@factory/db`'s migrations are the single source of truth for `monitors`/
// `monitor_events` (plan G.6/G.10.1), same pattern as packages/llm's integration suite.
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../db/migrations");

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Same documented exception as the other integration suites: test code against a
// disposable database, wired directly from TEST_DATABASE_URL rather than through
// readMergedEnv.
if (!TEST_DATABASE_URL) {
  console.warn(
    "integration tests skipped: set TEST_DATABASE_URL to run packages/jobs demo integration tests against a real Postgres instance.",
  );
}

describe.skipIf(!TEST_DATABASE_URL)("demo pipeline (integration)", () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const db = drizzle({ client: pool });

  // Serializes this suite against the other integration suites sharing the disposable
  // database (same key as packages/db/llm/core's integration suites).
  const INTEGRATION_DB_LOCK_KEY = 4230011;
  const lockClient = new Client({ connectionString: TEST_DATABASE_URL });

  // This suite exercises the REAL `checkMonitor`/`recordMonitorError` (no @factory/llm or
  // @factory/email mocking) — the dev shell happens to export a real OPENROUTER_API_KEY,
  // which would otherwise make `isEnabled("llm")` true and fire a real network call mid
  // test. Cleared here so the "changed" step deterministically exercises the diff
  // fallback; the LLM-enabled path is already covered by check-monitor.test.ts's mocks.
  const LLM_ENV_KEYS = [
    "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "LLM_LOCAL_BASE_URL",
  ];
  const savedLlmEnv = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const key of LLM_ENV_KEYS) {
      savedLlmEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [INTEGRATION_DB_LOCK_KEY]);
  }, 120_000);

  beforeEach(async () => {
    await pool.query(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    );
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    // `getDb()` (called internally by checkMonitor/recordMonitorError) is memoized
    // process-wide — set the env var BEFORE dynamically importing the jobs modules
    // below, never via a static top-of-file import.
    process.env.DATABASE_URL = TEST_DATABASE_URL;
  });

  afterAll(async () => {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [INTEGRATION_DB_LOCK_KEY]);
    await lockClient.end();
    await pool.end();
    for (const key of LLM_ENV_KEYS) {
      const value = savedLlmEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function seedUserAndMonitor(url: string): Promise<{ userId: string; monitorId: string }> {
    const userId = "user-int-1";
    await db.execute(sql`
      insert into "user" (id, name, email, email_verified)
      values (${userId}, 'Test User', 'test-int@example.com', true)
    `);
    const result = await db.execute<{ id: string }>(sql`
      insert into monitors (user_id, name, url)
      values (${userId}, 'Example', ${url})
      returning id
    `);
    const monitorId = result.rows[0]?.id;
    if (!monitorId) throw new Error("seedUserAndMonitor: insert returned no id");
    return { userId, monitorId };
  }

  async function startServer(getHtml: () => string) {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(getHtml());
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
  }

  // safeFetch blocks loopback by design (SSRF protection) — integration tests inject a
  // plain global fetch against the local server instead (the documented seam, plan G.2.5).
  function plainFetcher(url: string, init?: { timeoutMs?: number }) {
    return fetch(url, {
      signal: init?.timeoutMs ? AbortSignal.timeout(init.timeoutMs) : undefined,
    });
  }

  it("baseline -> change -> unchanged updates monitors/monitor_events as expected", async () => {
    const { checkMonitor } = await import("../../src/demo/check-monitor");

    let html = "<html><body>Version 1</body></html>";
    const { server, url } = await startServer(() => html);
    try {
      const { monitorId } = await seedUserAndMonitor(url);

      // --- baseline ---
      const first = await checkMonitor(monitorId, { fetcher: plainFetcher });
      expect(first).toEqual({ status: "baseline" });

      let monitorRows = await db.execute<{ last_hash: string | null; last_content: string | null }>(
        sql`select last_hash, last_content from monitors where id = ${monitorId}`,
      );
      expect(monitorRows.rows[0]?.last_hash).toBeTruthy();
      expect(monitorRows.rows[0]?.last_content).toContain("Version 1");

      let eventRows = await db.execute<{ kind: string; source: string }>(
        sql`select kind, source from monitor_events where monitor_id = ${monitorId}`,
      );
      expect(eventRows.rows).toHaveLength(1);
      expect(eventRows.rows[0]).toMatchObject({ kind: "baseline", source: "none" });

      // --- change ---
      html = "<html><body>Version 2 has arrived</body></html>";
      const second = await checkMonitor(monitorId, { fetcher: plainFetcher });
      expect(second.status).toBe("changed");
      expect(second.source).toBe("diff");

      monitorRows = await db.execute(
        sql`select last_hash, last_content from monitors where id = ${monitorId}`,
      );
      expect(monitorRows.rows[0]?.last_content).toContain("Version 2");

      eventRows = await db.execute(
        sql`select kind, source from monitor_events where monitor_id = ${monitorId} order by created_at asc`,
      );
      expect(eventRows.rows).toHaveLength(2);
      expect(eventRows.rows[1]).toMatchObject({ kind: "change", source: "diff" });

      // --- unchanged ---
      const third = await checkMonitor(monitorId, { fetcher: plainFetcher });
      expect(third).toEqual({ status: "unchanged" });

      eventRows = await db.execute(
        sql`select kind from monitor_events where monitor_id = ${monitorId}`,
      );
      expect(eventRows.rows).toHaveLength(2); // no new event on an unchanged check
    } finally {
      server.close();
    }
  }, 30_000);

  it("recordMonitorError writes the single error row", async () => {
    const { recordMonitorError } = await import("../../src/demo/record-error");

    const { monitorId } = await seedUserAndMonitor("https://example.com/does-not-matter");

    await recordMonitorError(monitorId, "fetch failed after retries");

    const eventRows = await db.execute<{ kind: string; source: string; summary: string }>(
      sql`select kind, source, summary from monitor_events where monitor_id = ${monitorId}`,
    );
    expect(eventRows.rows).toHaveLength(1);
    expect(eventRows.rows[0]).toMatchObject({
      kind: "error",
      source: "none",
      summary: "fetch failed after retries",
    });
  }, 30_000);
});
