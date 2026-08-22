import path from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Multi-chain layout (same pattern as `packages/db/scripts/migrate.ts`, which this file
// mirrors for a single known domain rather than discovering chains dynamically): the
// SHARED chain (`packages/db/migrations`, default journal table `__drizzle_migrations`)
// owns `user`/`session`/`account`/`verification`/billing/llm-call/rate-limit and runs
// first. This package's OWN chain, at the `brainstorm` subdirectory with its own
// `migrationsTable`, owns `projects`/`project_messages`/`project_items` and runs second
// (same pattern as `packages/untangle/test/integration/tasks.test.ts`, which this file
// mirrors for the brainstorm domain).
const SHARED_MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../db/migrations");
const BRAINSTORM_MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../db/migrations/brainstorm");
const BRAINSTORM_MIGRATIONS_TABLE = "__drizzle_migrations_brainstorm";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Same documented exception as the other integration suites: test code against a
// disposable database, wired directly from TEST_DATABASE_URL rather than through
// readMergedEnv.
if (!TEST_DATABASE_URL) {
  console.warn(
    "integration tests skipped: set TEST_DATABASE_URL to run packages/brainstorm integration tests against a real Postgres instance.",
  );
}

describe.skipIf(!TEST_DATABASE_URL)(
  "brainstorm domain (integration)",
  () => {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    const db = drizzle({ client: pool });

    // ONE key shared by every integration suite in the repo (not a per-package key): all
    // of them `DROP SCHEMA public CASCADE` against the same disposable database, so the
    // lock is what stops one suite wiping the schema out from under another. Same key
    // `packages/untangle/test/integration/tasks.test.ts` uses.
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
      await migrate(db, { migrationsFolder: SHARED_MIGRATIONS_FOLDER });
      await migrate(db, {
        migrationsFolder: BRAINSTORM_MIGRATIONS_FOLDER,
        migrationsTable: BRAINSTORM_MIGRATIONS_TABLE,
      });

      // `getDb()` (called internally by every query in `../../src/queries`) is memoized
      // process-wide — set the env var BEFORE dynamically importing `../../src/queries`
      // below, never via a static top-of-file import.
      process.env.DATABASE_URL = TEST_DATABASE_URL;
      process.env.BETTER_AUTH_SECRET = "test-suite-better-auth-secret-16plus-chars";
    });

    afterAll(async () => {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [INTEGRATION_DB_LOCK_KEY]);
      await lockClient.end();
      await pool.end();
    });

    async function seedUser(id: string, email: string): Promise<void> {
      await db.execute(sql`
      insert into "user" (id, name, email, email_verified)
      values (${id}, 'Test User', ${email}, true)
    `);
    }

    it("project CRUD roundtrip", async () => {
      const { createProject, getProjectForUser, renameProjectForUser, deleteProjectForUser } =
        await import("../../src/queries");

      await seedUser("user-1", "user-1@example.com");

      const created = await createProject("user-1", "Untangle", "A tangled-project workspace");
      expect(created.name).toBe("Untangle");
      expect(created.pitch).toBe("A tangled-project workspace");

      const fetched = await getProjectForUser(created.id, "user-1");
      expect(fetched).toMatchObject({ id: created.id, name: "Untangle" });

      const renamed = await renameProjectForUser(created.id, "user-1", {
        name: "Untangle v2",
        pitch: null,
      });
      expect(renamed?.name).toBe("Untangle v2");
      expect(renamed?.pitch).toBeNull();
      expect(renamed?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());

      expect(await deleteProjectForUser(created.id, "user-1")).toBe(true);
      expect(await getProjectForUser(created.id, "user-1")).toBeNull();
    });

    it("appendMessageForUser bumps the project's updatedAt and returns null for a non-owned project", async () => {
      const { createProject, appendMessageForUser, getProjectForUser } =
        await import("../../src/queries");

      await seedUser("user-1", "user-1@example.com");
      await seedUser("user-2", "user-2@example.com");

      const project = await createProject("user-1", "Untangle");
      const beforeUpdatedAt = project.updatedAt;

      // Force a measurable clock delta between the insert and the message append.
      await new Promise((resolve) => setTimeout(resolve, 5));

      const message = await appendMessageForUser(project.id, "user-1", "user", "let's brainstorm");
      expect(message).toMatchObject({
        projectId: project.id,
        userId: "user-1",
        role: "user",
        content: "let's brainstorm",
      });

      const refetched = await getProjectForUser(project.id, "user-1");
      expect(refetched?.updatedAt.getTime()).toBeGreaterThan(beforeUpdatedAt.getTime());

      // Cross-user: user-2 cannot append to user-1's project.
      const denied = await appendMessageForUser(project.id, "user-2", "user", "not mine");
      expect(denied).toBeNull();
    });

    it("listMessagesForProject returns messages in createdAt asc order", async () => {
      const { createProject, appendMessageForUser, listMessagesForProject } =
        await import("../../src/queries");

      await seedUser("user-1", "user-1@example.com");
      const project = await createProject("user-1", "Untangle");

      await appendMessageForUser(project.id, "user-1", "user", "first");
      await appendMessageForUser(project.id, "user-1", "assistant", "second");
      await appendMessageForUser(project.id, "user-1", "user", "third");

      const messages = await listMessagesForProject(project.id, "user-1");
      expect(messages.map((m) => m.content)).toEqual(["first", "second", "third"]);
    });

    it("item create honors a minted id and defaults status by source (ai/proposed vs manual/accepted)", async () => {
      const { createProject, createItemForUser } = await import("../../src/queries");

      await seedUser("user-1", "user-1@example.com");
      const project = await createProject("user-1", "Untangle");

      const manual = await createItemForUser(project.id, "user-1", {
        kind: "idea",
        title: "Manual idea",
        source: "manual",
      });
      expect(manual?.status).toBe("accepted");

      const proposed = await createItemForUser(project.id, "user-1", {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "feature",
        title: "AI-proposed feature",
        source: "ai",
        status: "proposed",
      });
      expect(proposed?.id).toBe("11111111-1111-4111-8111-111111111111");
      expect(proposed?.status).toBe("proposed");
      expect(proposed?.source).toBe("ai");
    });

    it("createItemForUser returns null when the project isn't owned by the caller", async () => {
      const { createProject, createItemForUser } = await import("../../src/queries");

      await seedUser("user-1", "user-1@example.com");
      await seedUser("user-2", "user-2@example.com");
      const project = await createProject("user-1", "Untangle");

      const denied = await createItemForUser(project.id, "user-2", {
        kind: "idea",
        title: "borrowed",
        source: "manual",
      });
      expect(denied).toBeNull();
    });

    it("updateItemForUser transitions status and deleteItemForUser removes the row, item CRUD does not bump the project's updatedAt", async () => {
      const {
        createProject,
        createItemForUser,
        updateItemForUser,
        deleteItemForUser,
        getProjectForUser,
      } = await import("../../src/queries");

      await seedUser("user-1", "user-1@example.com");
      const project = await createProject("user-1", "Untangle");
      const beforeUpdatedAt = project.updatedAt;

      const item = await createItemForUser(project.id, "user-1", {
        kind: "note",
        title: "A note",
        source: "manual",
        status: "proposed",
      });
      expect(item).not.toBeNull();

      await new Promise((resolve) => setTimeout(resolve, 5));

      const accepted = await updateItemForUser(item!.id, "user-1", { status: "accepted" });
      expect(accepted?.status).toBe("accepted");
      expect(accepted?.updatedAt.getTime()).toBeGreaterThan(item!.updatedAt.getTime());

      const refetchedProject = await getProjectForUser(project.id, "user-1");
      expect(refetchedProject?.updatedAt.getTime()).toBe(beforeUpdatedAt.getTime());

      expect(await deleteItemForUser(item!.id, "user-1")).toBe(true);
      expect(await deleteItemForUser(item!.id, "user-1")).toBe(false);
    });

    it("listProjectsForUser counts accepted items only, sorted by updatedAt desc", async () => {
      const { createProject, createItemForUser, listProjectsForUser } =
        await import("../../src/queries");

      await seedUser("user-1", "user-1@example.com");
      const projectA = await createProject("user-1", "Project A");
      await new Promise((resolve) => setTimeout(resolve, 5));
      const projectB = await createProject("user-1", "Project B");

      await createItemForUser(projectA.id, "user-1", {
        kind: "idea",
        title: "accepted idea",
        source: "manual",
        status: "accepted",
      });
      await createItemForUser(projectA.id, "user-1", {
        kind: "idea",
        title: "proposed idea",
        source: "ai",
        status: "proposed",
      });
      await createItemForUser(projectA.id, "user-1", {
        kind: "feature",
        title: "accepted feature",
        source: "manual",
        status: "accepted",
      });

      const summaries = await listProjectsForUser("user-1");
      expect(summaries.map((s) => s.name)).toEqual(["Project B", "Project A"]);

      const summaryA = summaries.find((s) => s.id === projectA.id)!;
      expect(summaryA.itemCounts).toEqual({ idea: 1, feature: 1, note: 0 });

      const summaryB = summaries.find((s) => s.id === projectB.id)!;
      expect(summaryB.itemCounts).toEqual({ idea: 0, feature: 0, note: 0 });
    });

    it("cascade delete: deleting a project removes its messages and items", async () => {
      const { createProject, appendMessageForUser, createItemForUser, deleteProjectForUser } =
        await import("../../src/queries");

      await seedUser("user-1", "user-1@example.com");
      const project = await createProject("user-1", "Untangle");
      await appendMessageForUser(project.id, "user-1", "user", "hello");
      await createItemForUser(project.id, "user-1", {
        kind: "idea",
        title: "an idea",
        source: "manual",
      });

      expect(await deleteProjectForUser(project.id, "user-1")).toBe(true);

      const messageRows = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from project_messages where project_id = ${project.id}`,
      );
      expect(messageRows.rows[0]?.count).toBe("0");

      const itemRows = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from project_items where project_id = ${project.id}`,
      );
      expect(itemRows.rows[0]?.count).toBe("0");
    });

    it("every cross-user mutation/read is isolated", async () => {
      const {
        createProject,
        getProjectForUser,
        appendMessageForUser,
        createItemForUser,
        updateItemForUser,
        deleteItemForUser,
        deleteProjectForUser,
        renameProjectForUser,
        listMessagesForProject,
        listItemsForProject,
      } = await import("../../src/queries");

      await seedUser("user-1", "user-1@example.com");
      await seedUser("user-2", "user-2@example.com");

      const project = await createProject("user-1", "Untangle");
      const item = await createItemForUser(project.id, "user-1", {
        kind: "idea",
        title: "user-1's idea",
        source: "manual",
      });
      expect(item).not.toBeNull();
      await appendMessageForUser(project.id, "user-1", "user", "user-1's message");

      // getProjectForUser
      expect(await getProjectForUser(project.id, "user-2")).toBeNull();

      // appendMessageForUser
      expect(await appendMessageForUser(project.id, "user-2", "user", "not mine")).toBeNull();

      // createItemForUser
      expect(
        await createItemForUser(project.id, "user-2", {
          kind: "note",
          title: "not mine",
          source: "manual",
        }),
      ).toBeNull();

      // updateItemForUser
      expect(await updateItemForUser(item!.id, "user-2", { title: "hijacked" })).toBeNull();

      // deleteItemForUser
      expect(await deleteItemForUser(item!.id, "user-2")).toBe(false);

      // deleteProjectForUser
      expect(await deleteProjectForUser(project.id, "user-2")).toBe(false);

      // renameProjectForUser
      expect(await renameProjectForUser(project.id, "user-2", { name: "hijacked" })).toBeNull();

      // listMessagesForProject — user-1 has a message, user-2 sees none of it.
      expect(await listMessagesForProject(project.id, "user-2")).toEqual([]);

      // listItemsForProject — user-1 has an item, user-2 sees none of it.
      expect(await listItemsForProject(project.id, "user-2")).toEqual([]);

      // Every one of user-1's rows is untouched.
      const stillThere = await getProjectForUser(project.id, "user-1");
      expect(stillThere).not.toBeNull();
    });

    it("countUserTurnsToday counts only role 'user' messages, scoped per user", async () => {
      const { createProject, appendMessageForUser, countUserTurnsToday } =
        await import("../../src/queries");

      await seedUser("user-1", "user-1@example.com");
      await seedUser("user-2", "user-2@example.com");

      expect(await countUserTurnsToday("user-1")).toBe(0);

      const project = await createProject("user-1", "Untangle");
      await appendMessageForUser(project.id, "user-1", "user", "a turn");
      await appendMessageForUser(project.id, "user-1", "assistant", "a reply");

      expect(await countUserTurnsToday("user-1")).toBe(1);

      // Isolated per user — user-2 has posted nothing.
      expect(await countUserTurnsToday("user-2")).toBe(0);
    });
  },
  30_000,
);
