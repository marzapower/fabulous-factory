/**
 * Brainstorm domain queries. Every mutation/read that acts on an existing row is scoped
 * by BOTH id and userId — never by id alone — so one user can never touch another's row
 * via a guessed id (cross-user isolation is asserted directly in
 * `test/integration/brainstorm.test.ts`). Inserts carry `userId` as part of the row
 * itself. Every function here is exported from the package barrel and lives in the half
 * adopters KEEP and build on — an exported unscoped write is a trap left lying around,
 * not a private shortcut (same rationale as `packages/untangle/src/tasks/queries.ts`).
 */
import { and, asc, count, desc, eq, gte } from "drizzle-orm";

import { getDb } from "@factory/db";

import * as schema from "./schema";
import type {
  ItemKind,
  ItemSource,
  ItemStatus,
  Project,
  ProjectItem,
  ProjectMessage,
  ProjectRole,
  ProjectSummary,
} from "./types";

function toProject(row: typeof schema.projects.$inferSelect): Project {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    pitch: row.pitch,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessage(row: typeof schema.projectMessages.$inferSelect): ProjectMessage {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    role: row.role as ProjectRole,
    content: row.content,
    createdAt: row.createdAt,
  };
}

function toItem(row: typeof schema.projectItems.$inferSelect): ProjectItem {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    kind: row.kind as ItemKind,
    title: row.title,
    detail: row.detail,
    status: row.status as ItemStatus,
    source: row.source as ItemSource,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createProject(
  userId: string,
  name: string,
  pitch?: string | null,
): Promise<Project> {
  const [row] = await getDb()
    .insert(schema.projects)
    .values({ userId, name, pitch: pitch ?? null })
    .returning();
  if (!row) throw new Error("createProject: insert returned no row");
  return toProject(row);
}

/** Every project owned by `userId`, sorted `updatedAt desc`, with item counts grouped by
 * `kind` over ACCEPTED items only (proposed/dismissed items don't count toward the board
 * summary — this is a declared decision, not an oversight). */
export async function listProjectsForUser(userId: string): Promise<ProjectSummary[]> {
  const projectRows = await getDb()
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.updatedAt));

  const countRows = await getDb()
    .select({
      projectId: schema.projectItems.projectId,
      kind: schema.projectItems.kind,
      value: count(),
    })
    .from(schema.projectItems)
    .where(and(eq(schema.projectItems.userId, userId), eq(schema.projectItems.status, "accepted")))
    .groupBy(schema.projectItems.projectId, schema.projectItems.kind);

  const countsByProject = new Map<string, Record<ItemKind, number>>();
  for (const row of countRows) {
    const existing = countsByProject.get(row.projectId) ?? { idea: 0, feature: 0, note: 0 };
    existing[row.kind as ItemKind] = row.value;
    countsByProject.set(row.projectId, existing);
  }

  return projectRows.map((row) => ({
    id: row.id,
    name: row.name,
    pitch: row.pitch,
    updatedAt: row.updatedAt,
    itemCounts: countsByProject.get(row.id) ?? { idea: 0, feature: 0, note: 0 },
  }));
}

export async function getProjectForUser(
  projectId: string,
  userId: string,
): Promise<Project | null> {
  const [row] = await getDb()
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)));
  return row ? toProject(row) : null;
}

export async function renameProjectForUser(
  projectId: string,
  userId: string,
  patch: { name?: string; pitch?: string | null },
): Promise<Project | null> {
  const [row] = await getDb()
    .update(schema.projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .returning();
  return row ? toProject(row) : null;
}

export async function deleteProjectForUser(projectId: string, userId: string): Promise<boolean> {
  const deleted = await getDb()
    .delete(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .returning({ id: schema.projects.id });
  return deleted.length > 0;
}

export async function listMessagesForProject(
  projectId: string,
  userId: string,
): Promise<ProjectMessage[]> {
  const rows = await getDb()
    .select()
    .from(schema.projectMessages)
    .where(
      and(
        eq(schema.projectMessages.projectId, projectId),
        eq(schema.projectMessages.userId, userId),
      ),
    )
    .orderBy(asc(schema.projectMessages.createdAt));
  return rows.map(toMessage);
}

/** Returns `null` (rather than throwing) when `projectId` isn't owned by `userId` — the
 * ownership check is a plain select against `projects`, not a foreign-key trust, same
 * stance `createManualTask` in `packages/untangle/src/tasks/queries.ts` takes for a
 * client-supplied id. Bumps the project's `updatedAt` on success (item CRUD deliberately
 * does not — see `updateItemForUser`). */
export async function appendMessageForUser(
  projectId: string,
  userId: string,
  role: ProjectRole,
  content: string,
): Promise<ProjectMessage | null> {
  const owned = await getProjectForUser(projectId, userId);
  if (!owned) return null;

  const [row] = await getDb()
    .insert(schema.projectMessages)
    .values({ projectId, userId, role, content })
    .returning();
  if (!row) throw new Error("appendMessageForUser: insert returned no row");

  await getDb()
    .update(schema.projects)
    .set({ updatedAt: new Date() })
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)));

  return toMessage(row);
}

/**
 * Counts `userId`'s own "user"-role messages since the start of today (UTC) — the S1
 * abuse-floor check backing `TURN_HARD_CEILING_PER_DAY` in
 * `apps/brainstorm/app/api/chat/route.ts`. Unlike the run-engine's `createRun` and its
 * in-transaction `pg_advisory_xact_lock` cap (a different preset's domain package —
 * not present in this scaffold), this is a plain count with no
 * `pg_advisory_xact_lock` around it: the chat route's own 10/min rate limit already
 * bounds how many turns a single user can race through the check-then-insert window, so
 * a plain read here is enough — this is a coarse daily abuse floor, not a billing-grade
 * guarantee.
 */
export async function countUserTurnsToday(userId: string): Promise<number> {
  const startOfTodayUtc = new Date(new Date().toISOString().slice(0, 10));
  const [row] = await getDb()
    .select({ value: count() })
    .from(schema.projectMessages)
    .where(
      and(
        eq(schema.projectMessages.userId, userId),
        eq(schema.projectMessages.role, "user"),
        gte(schema.projectMessages.createdAt, startOfTodayUtc),
      ),
    );
  return row?.value ?? 0;
}

export async function listItemsForProject(
  projectId: string,
  userId: string,
): Promise<ProjectItem[]> {
  const rows = await getDb()
    .select()
    .from(schema.projectItems)
    .where(
      and(eq(schema.projectItems.projectId, projectId), eq(schema.projectItems.userId, userId)),
    )
    .orderBy(asc(schema.projectItems.createdAt));
  return rows.map(toItem);
}

/**
 * Returns `null` when `projectId` isn't owned by `userId` (same ownership-check-before-
 * write stance as `appendMessageForUser`). `id` is optional and normally omitted (the
 * column defaults to `gen_random_uuid()`); the streaming turn step supplies one so it can
 * emit a `proposal` event the instant an element arrives off the model stream, and persist
 * the row afterwards under that same id — same pattern as
 * `insertExtractedTask` in `packages/untangle/src/tasks/queries.ts`. Default `status` is
 * `"accepted"` for a manually-added item; callers proposing an AI-sourced item pass
 * `status: "proposed"` explicitly.
 */
export async function createItemForUser(
  projectId: string,
  userId: string,
  input: {
    id?: string;
    kind: ItemKind;
    title: string;
    detail?: string | null;
    source: ItemSource;
    status?: ItemStatus;
  },
): Promise<ProjectItem | null> {
  const owned = await getProjectForUser(projectId, userId);
  if (!owned) return null;

  const [row] = await getDb()
    .insert(schema.projectItems)
    .values({
      ...(input.id === undefined ? {} : { id: input.id }),
      projectId,
      userId,
      kind: input.kind,
      title: input.title,
      detail: input.detail ?? null,
      source: input.source,
      status: input.status ?? "accepted",
    })
    .returning();
  if (!row) throw new Error("createItemForUser: insert returned no row");
  return toItem(row);
}

/** Item CRUD deliberately does NOT bump the owning project's `updatedAt` — a declared
 * decision (see `appendMessageForUser`, which does). */
export async function updateItemForUser(
  itemId: string,
  userId: string,
  patch: Partial<{ kind: ItemKind; title: string; detail: string | null; status: ItemStatus }>,
): Promise<ProjectItem | null> {
  const [row] = await getDb()
    .update(schema.projectItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(schema.projectItems.id, itemId), eq(schema.projectItems.userId, userId)))
    .returning();
  return row ? toItem(row) : null;
}

export async function deleteItemForUser(itemId: string, userId: string): Promise<boolean> {
  const deleted = await getDb()
    .delete(schema.projectItems)
    .where(and(eq(schema.projectItems.id, itemId), eq(schema.projectItems.userId, userId)))
    .returning({ id: schema.projectItems.id });
  return deleted.length > 0;
}
