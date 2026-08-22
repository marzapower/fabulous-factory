import path from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `@factory/db`'s migrations are the single source of truth for `captures`/`tasks`/
// `runs` (same pattern as `test/integration/demo.test.ts`, which this file replaces the
// coverage of for the tasks domain).
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../db/migrations");

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Same documented exception as the other integration suites: test code against a
// disposable database, wired directly from TEST_DATABASE_URL rather than through
// readMergedEnv.
if (!TEST_DATABASE_URL) {
  console.warn(
    "integration tests skipped: set TEST_DATABASE_URL to run packages/jobs tasks integration tests against a real Postgres instance.",
  );
}

describe.skipIf(!TEST_DATABASE_URL)(
  "tasks domain (integration)",
  () => {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    const db = drizzle({ client: pool });

    // Serializes this suite against the other integration suites sharing the disposable
    // database (same key convention as packages/db/llm/core/jobs's other integration
    // suites — a distinct constant here, not reused from theirs).
    // ONE key shared by every integration suite in the repo (not a per-package key): all of
    // them `DROP SCHEMA public CASCADE` against the same disposable database, so the lock is
    // what stops one suite wiping the schema out from under another. A second key would
    // create a second, independent lock group — which is exactly the bug this line fixes.
    const INTEGRATION_DB_LOCK_KEY = 4230011;
    const lockClient = new Client({ connectionString: TEST_DATABASE_URL });

    // This suite exercises the REAL extractStep/triageStep/decomposeStep (no @factory/llm
    // mocking) — the dev shell happens to export a real OPENROUTER_API_KEY, which would
    // otherwise make `isEnabled("llm")` true and fire a real network call mid test. Cleared
    // here (same pattern as `test/integration/demo.test.ts`) so every step deterministically
    // exercises its heuristic path; the LLM-enabled path is already covered by
    // `test/tasks-pipeline.test.ts`'s mocks.
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

      // `getDb()` (called internally by every query in `../src/tasks/queries`) is memoized
      // process-wide — set the env var BEFORE dynamically importing `../src/tasks/*` below,
      // never via a static top-of-file import.
      process.env.DATABASE_URL = TEST_DATABASE_URL;
      process.env.BETTER_AUTH_SECRET = "test-suite-better-auth-secret-16plus-chars";
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

    async function seedUser(id: string, email: string): Promise<void> {
      await db.execute(sql`
      insert into "user" (id, name, email, email_verified)
      values (${id}, 'Test User', ${email}, true)
    `);
    }

    async function seedRunAndCapture(
      userId: string,
      rawText: string,
    ): Promise<{ runId: string; captureId: string }> {
      const runResult = await db.execute<{ id: string }>(sql`
      insert into runs (user_id, kind, driver)
      values (${userId}, 'capture', 'inline')
      returning id
    `);
      const runId = runResult.rows[0]?.id;
      if (!runId) throw new Error("seedRunAndCapture: run insert returned no id");

      const captureResult = await db.execute<{ id: string }>(sql`
      insert into captures (user_id, source, raw_text)
      values (${userId}, 'paste', ${rawText})
      returning id
    `);
      const captureId = captureResult.rows[0]?.id;
      if (!captureId) throw new Error("seedRunAndCapture: capture insert returned no id");

      return { runId, captureId };
    }

    it("heuristic extract writes tasks with exact source offsets", async () => {
      const { extractStep } = await import("../../src/tasks/pipeline");

      await seedUser("user-int-1", "int-1@example.com");
      const rawText = "- call marco about the contract\n- book flights for the trip";
      const { runId, captureId } = await seedRunAndCapture("user-int-1", rawText);

      const emitted: unknown[] = [];
      const ctx = { runId, userId: "user-int-1", emit: (event: unknown) => emitted.push(event) };
      const state = { captureId, rawText, todayIso: "2026-08-21", tasks: [] };

      const result = await extractStep.run(state, ctx);

      expect(result.source).toBe("heuristic");
      expect(result.state.tasks).toHaveLength(2);
      expect(emitted).toHaveLength(2);

      const rows = await db.execute<{
        title: string;
        source: string;
        source_start: number;
        source_end: number;
      }>(
        sql`select title, source, source_start, source_end from tasks where user_id = ${"user-int-1"} order by created_at asc`,
      );
      expect(rows.rows).toHaveLength(2);
      expect(rows.rows[0]).toMatchObject({
        title: "call marco about the contract",
        source: "heuristic",
      });
      expect(rawText.slice(rows.rows[0]!.source_start, rows.rows[0]!.source_end)).toBe(
        rows.rows[0]!.title,
      );
      expect(rows.rows[1]).toMatchObject({
        title: "book flights for the trip",
        source: "heuristic",
      });
      expect(rawText.slice(rows.rows[1]!.source_start, rows.rows[1]!.source_end)).toBe(
        rows.rows[1]!.title,
      );
    });

    it("heuristic triage writes priority/dueAt onto the extracted rows", async () => {
      const { extractStep, triageStep } = await import("../../src/tasks/pipeline");

      await seedUser("user-int-1", "int-1@example.com");
      const rawText = "asap call marco\nsomeday learn spanish";
      const { runId, captureId } = await seedRunAndCapture("user-int-1", rawText);

      const ctx = { runId, userId: "user-int-1", emit: () => undefined };
      const state = { captureId, rawText, todayIso: "2026-08-21", tasks: [] };

      const extracted = await extractStep.run(state, ctx);
      const triaged = await triageStep.run(extracted.state, ctx);

      expect(triaged.source).toBe("heuristic");

      const rows = await db.execute<{ title: string; priority: string }>(sql`
      select title, priority from tasks where user_id = ${"user-int-1"} order by created_at asc
    `);
      expect(rows.rows).toEqual([
        { title: "asap call marco", priority: "now" },
        { title: "someday learn spanish", priority: "later" },
      ]);
    });

    it("insertSubtasks writes rows with the parent task id set", async () => {
      const { extractStep } = await import("../../src/tasks/pipeline");
      const { insertSubtasks } = await import("../../src/tasks/queries");

      await seedUser("user-int-1", "int-1@example.com");
      const rawText = "plan the launch";
      const { runId, captureId } = await seedRunAndCapture("user-int-1", rawText);
      const ctx = { runId, userId: "user-int-1", emit: () => undefined };
      const extracted = await extractStep.run(
        { captureId, rawText, todayIso: "2026-08-21", tasks: [] },
        ctx,
      );
      const parent = extracted.state.tasks[0]!;

      const inserted = await insertSubtasks(
        parent.id,
        "user-int-1",
        runId,
        ["Book venue", "Send invites"],
        "heuristic",
      );
      expect(inserted).toHaveLength(2);

      const rows = await db.execute<{ title: string; parent_task_id: string }>(sql`
      select title, parent_task_id from tasks where parent_task_id = ${parent.id} order by created_at asc
    `);
      expect(rows.rows.map((r) => r.title)).toEqual(["Book venue", "Send invites"]);
      expect(rows.rows.every((r) => r.parent_task_id === parent.id)).toBe(true);
    });

    it("every mutation is cross-user isolated", async () => {
      const { extractStep } = await import("../../src/tasks/pipeline");
      const { setTaskStatus, deleteTaskRow, listTasksForUser } =
        await import("../../src/tasks/queries");

      await seedUser("user-int-1", "int-1@example.com");
      await seedUser("user-int-2", "int-2@example.com");

      const { runId: run1, captureId: capture1 } = await seedRunAndCapture(
        "user-int-1",
        "call marco",
      );
      const { runId: run2, captureId: capture2 } = await seedRunAndCapture(
        "user-int-2",
        "book flights",
      );

      const ctx1 = { runId: run1, userId: "user-int-1", emit: () => undefined };
      const ctx2 = { runId: run2, userId: "user-int-2", emit: () => undefined };

      const extracted1 = await extractStep.run(
        { captureId: capture1, rawText: "call marco", todayIso: "2026-08-21", tasks: [] },
        ctx1,
      );
      await extractStep.run(
        { captureId: capture2, rawText: "book flights", todayIso: "2026-08-21", tasks: [] },
        ctx2,
      );

      const user1Task = extracted1.state.tasks[0]!;

      // User 2 can neither complete nor delete user 1's task via a guessed id.
      expect(await setTaskStatus(user1Task.id, "user-int-2", "done")).toBe(false);
      expect(await deleteTaskRow(user1Task.id, "user-int-2")).toBe(false);

      const user1Tasks = await listTasksForUser("user-int-1");
      const user2Tasks = await listTasksForUser("user-int-2");
      expect(user1Tasks.map((t) => t.title)).toEqual(["call marco"]);
      expect(user2Tasks.map((t) => t.title)).toEqual(["book flights"]);
      // Still open — user 2's attempt above never touched it.
      expect(user1Tasks[0]?.status).toBe("open");

      // The rightful owner CAN act on their own task.
      expect(await setTaskStatus(user1Task.id, "user-int-1", "done")).toBe(true);
    });

    it("a manual task cannot be hung off another user's capture", async () => {
      const { createManualTask, listTasksForUser } = await import("../../src/tasks/queries");

      await seedUser("user-int-1", "int-1@example.com");
      await seedUser("user-int-2", "int-2@example.com");
      const { captureId: capture1 } = await seedRunAndCapture("user-int-1", "call marco");

      // `captureId` reaches `createManualTaskAction` straight from the client, validated
      // only as a UUID — so the ownership check has to live below the action.
      await expect(
        createManualTask({
          userId: "user-int-2",
          title: "borrowed from someone else's note",
          captureId: capture1,
        }),
      ).rejects.toMatchObject({ status: 404 });

      // Refused outright: no orphan row left behind by the rejected call.
      expect(await listTasksForUser("user-int-2")).toEqual([]);

      // The owner of that capture is unaffected.
      const owned = await createManualTask({
        userId: "user-int-1",
        title: "from my own note",
        captureId: capture1,
      });
      expect(owned.id).toBeTruthy();

      // And a manual task with no capture at all still works for anyone.
      const free = await createManualTask({ userId: "user-int-2", title: "no note attached" });
      expect(free.id).toBeTruthy();
    });

    it("subtasks cannot be hung off another user's task", async () => {
      const { extractStep } = await import("../../src/tasks/pipeline");
      const { insertSubtasks } = await import("../../src/tasks/queries");

      await seedUser("user-int-1", "int-1@example.com");
      await seedUser("user-int-2", "int-2@example.com");
      const { runId: run1, captureId: capture1 } = await seedRunAndCapture(
        "user-int-1",
        "plan the offsite",
      );
      const { runId: run2 } = await seedRunAndCapture("user-int-2", "unrelated");

      const extracted = await extractStep.run(
        { captureId: capture1, rawText: "plan the offsite", todayIso: "2026-08-21", tasks: [] },
        { runId: run1, userId: "user-int-1", emit: () => undefined },
      );
      const user1Task = extracted.state.tasks[0]!;

      // `insertSubtasks` is exported from the package barrel and lives in the half
      // adopters keep — an unscoped parent reference would be a trap left lying around.
      await expect(
        insertSubtasks(user1Task.id, "user-int-2", run2, ["Book venue"], "heuristic"),
      ).rejects.toMatchObject({ status: 404 });

      const rows = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from tasks where parent_task_id = ${user1Task.id}`,
      );
      expect(rows.rows[0]?.count).toBe("0");

      // The owner is unaffected.
      const owned = await insertSubtasks(
        user1Task.id,
        "user-int-1",
        run1,
        ["Book venue"],
        "heuristic",
      );
      expect(owned).toHaveLength(1);
    });
  },
  30_000,
);
