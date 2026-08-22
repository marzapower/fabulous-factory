/**
 * Task-capture domain queries (plan K.5.5). Every mutation that acts on an existing row
 * (`setTaskStatus`, `deleteTaskRow`) is scoped by BOTH id and userId — never by id alone
 * — so one user can never touch another's row via a guessed id (cross-user isolation is
 * asserted directly in `test/integration/tasks.test.ts`). Inserts carry `userId` as part
 * of the row itself. `applyTriage` is scoped the same way: its only caller today is this
 * package's own triage step, acting on ids it inserted moments earlier, but it is
 * exported from the package barrel and lives in the half adopters KEEP — an exported
 * unscoped write is a trap left lying around. See its own doc comment.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { ApiError } from "@factory/core";
import { getDb, schema } from "@factory/db";

import type { Priority } from "./constants";

export interface TaskTree {
  id: string;
  title: string;
  priority: Priority | null;
  effortMinutes: number | null;
  dueAt: Date | null;
  tag: string | null;
  status: string;
  source: string;
  sourceStart: number | null;
  sourceEnd: number | null;
  createdAt: Date;
  children: TaskTree[];
}

/** Everything the daily-plan pipeline / dashboard list need — `dueAt` is an ISO string
 * (K.1.8: never a `Date` in anything that flows through pipeline state), converted once
 * here rather than by every caller. */
export interface TaskListItem {
  id: string;
  title: string;
  priority: Priority | null;
  effortMinutes: number | null;
  dueAt: string | null;
  tag: string | null;
}

export async function createCapture(input: {
  userId: string;
  source: "paste" | "url";
  url?: string | null;
  rawText: string;
}): Promise<{ id: string }> {
  const [row] = await getDb()
    .insert(schema.captures)
    .values({
      userId: input.userId,
      source: input.source,
      url: input.url ?? null,
      rawText: input.rawText,
    })
    .returning({ id: schema.captures.id });
  if (!row) throw new Error("createCapture: insert returned no row");
  return row;
}

/**
 * `id` is optional and normally omitted (the column defaults to `gen_random_uuid()`).
 * The streaming extract step supplies one so it can emit a `task-added` event the instant
 * an element arrives off the model stream — the card appears immediately — and persist the
 * row afterwards under that same id, without the UI ever having to reconcile a temporary
 * key against a real one.
 */
export async function insertExtractedTask(input: {
  id?: string;
  userId: string;
  runId: string;
  captureId: string;
  title: string;
  source: "llm" | "heuristic";
  sourceStart: number | null;
  sourceEnd: number | null;
}): Promise<{ id: string }> {
  const [row] = await getDb()
    .insert(schema.tasks)
    .values({
      ...(input.id === undefined ? {} : { id: input.id }),
      userId: input.userId,
      runId: input.runId,
      captureId: input.captureId,
      title: input.title,
      source: input.source,
      sourceStart: input.sourceStart,
      sourceEnd: input.sourceEnd,
    })
    .returning({ id: schema.tasks.id });
  if (!row) throw new Error("insertExtractedTask: insert returned no row");
  return row;
}

/**
 * Ownership-scoped by `(id, userId)` like every other mutation in this file — NOT by id
 * alone. Today's only caller is the triage step, which passes ids it inserted moments
 * earlier for this same user, so an unscoped update would not be reachable in practice.
 * It is scoped anyway for two reasons: this function is exported from the package barrel,
 * so an adopter's own code (or a future step) can call it with any id it likes; and
 * `packages/jobs/src/tasks/` is code adopters KEEP and build on, where an exported
 * unscoped write is a trap left lying around rather than a private shortcut.
 */
export async function applyTriage(
  taskId: string,
  userId: string,
  triage: {
    priority: Priority;
    effortMinutes: number | null;
    dueAt: Date | null;
    tag: string | null;
  },
): Promise<void> {
  await getDb()
    .update(schema.tasks)
    .set({
      priority: triage.priority,
      effortMinutes: triage.effortMinutes,
      dueAt: triage.dueAt,
      tag: triage.tag,
    })
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.userId, userId)));
}

/**
 * Scoped by `(parentTaskId, userId)` for the same reason `applyTriage` and
 * `createManualTask` are: this is exported from the package barrel and lives in the half
 * adopters KEEP, so an unscoped write here is a trap left lying around rather than a
 * private shortcut. Today's only caller is the decompose step, passing ids it extracted
 * moments earlier for this same user, so the check never fires in practice.
 */
export async function insertSubtasks(
  parentTaskId: string,
  userId: string,
  runId: string,
  titles: string[],
  source: "llm" | "heuristic",
): Promise<Array<{ id: string; title: string }>> {
  if (titles.length === 0) return [];

  const [parent] = await getDb()
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, parentTaskId), eq(schema.tasks.userId, userId)));
  if (!parent) {
    throw new ApiError(404, "task_not_found", "That task is gone already.");
  }

  const rows = await getDb()
    .insert(schema.tasks)
    .values(
      titles.map((title) => ({
        userId,
        runId,
        parentTaskId,
        title,
        source,
      })),
    )
    .returning({ id: schema.tasks.id, title: schema.tasks.title });
  return rows;
}

/** Every task owned by `userId`, assembled into a parent/children tree. A row whose
 * `parentTaskId` doesn't resolve to another row in this same result set (shouldn't
 * happen — `parentTaskId` cascades on delete — but never trust a self-reference blindly)
 * is treated as a root rather than dropped. */
export async function listTasksForUser(userId: string): Promise<TaskTree[]> {
  const rows = await getDb()
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.userId, userId))
    .orderBy(asc(schema.tasks.createdAt));

  const byId = new Map<string, TaskTree>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      title: row.title,
      priority: row.priority as Priority | null,
      effortMinutes: row.effortMinutes,
      dueAt: row.dueAt,
      tag: row.tag,
      status: row.status,
      source: row.source,
      sourceStart: row.sourceStart,
      sourceEnd: row.sourceEnd,
      createdAt: row.createdAt,
      children: [],
    });
  }

  const roots: TaskTree[] = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    if (!node) continue;
    const parent = row.parentTaskId ? byId.get(row.parentTaskId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Open tasks for `userId`, ordered `dueAt asc` (nulls last — an undated task shouldn't
 * vanish behind every dated one), `priority desc`. Plain text `desc` already yields the
 * right order for 'now' | 'next' | 'later' (alphabetically 'now' > 'next' > 'later'),
 * so no `CASE` expression is needed. */
export async function listOpenTasksForUser(userId: string): Promise<TaskListItem[]> {
  const rows = await getDb()
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      priority: schema.tasks.priority,
      effortMinutes: schema.tasks.effortMinutes,
      dueAt: schema.tasks.dueAt,
      tag: schema.tasks.tag,
    })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.status, "open")))
    .orderBy(sql`${schema.tasks.dueAt} asc nulls last`, desc(schema.tasks.priority));

  return rows.map((row) => ({
    ...row,
    priority: row.priority as Priority | null,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
  }));
}

export async function setTaskStatus(
  id: string,
  userId: string,
  status: "open" | "done",
): Promise<boolean> {
  const updated = await getDb()
    .update(schema.tasks)
    .set({ status, completedAt: status === "done" ? new Date() : null })
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)))
    .returning({ id: schema.tasks.id });
  return updated.length > 0;
}

/**
 * `captureId` arrives from the client (`createManualTaskAction` validates it as a UUID
 * and nothing more), so it is verified against `userId` here before it is written — the
 * same `(id, userId)` scoping every other mutation in this file uses, applied to a
 * foreign key instead of a primary one. Without this check any signed-in user could hang
 * one of their own tasks off another user's capture row: harmless today, because nothing
 * reads `tasks.capture_id` back across users, but this is the half adopters KEEP and
 * build on, and the first feature that renders "the note this task came from" would turn
 * it into a cross-user read. An unowned reference is refused rather than silently
 * dropped, so a caller passing a bad id learns about it.
 */
export async function createManualTask(input: {
  userId: string;
  title: string;
  captureId?: string | null;
  sourceStart?: number | null;
  sourceEnd?: number | null;
}): Promise<{ id: string }> {
  if (input.captureId) {
    const [capture] = await getDb()
      .select({ id: schema.captures.id })
      .from(schema.captures)
      .where(
        and(eq(schema.captures.id, input.captureId), eq(schema.captures.userId, input.userId)),
      );
    if (!capture) {
      throw new ApiError(404, "capture_not_found", "That note is gone already.");
    }
  }

  const [row] = await getDb()
    .insert(schema.tasks)
    .values({
      userId: input.userId,
      title: input.title,
      source: "manual",
      captureId: input.captureId ?? null,
      sourceStart: input.sourceStart ?? null,
      sourceEnd: input.sourceEnd ?? null,
    })
    .returning({ id: schema.tasks.id });
  if (!row) throw new Error("createManualTask: insert returned no row");
  return row;
}

export async function deleteTaskRow(id: string, userId: string): Promise<boolean> {
  const deleted = await getDb()
    .delete(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)))
    .returning({ id: schema.tasks.id });
  return deleted.length > 0;
}

/** Backs `dailyPlanPipeline`'s `notify` step — not in the K.5.5 contract list verbatim,
 * but required to resolve who to email. It lives here, rather than as an inline join at
 * the call site, because this file already owns every task/capture query. */
export async function getUserEmail(userId: string): Promise<string | undefined> {
  const [row] = await getDb()
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  return row?.email;
}
