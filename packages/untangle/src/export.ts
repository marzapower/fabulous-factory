/**
 * Full user-data export for the untangle domain (captures/tasks/runs/run_steps) — the
 * "download my data" counterpart to `packages/auth/src/export.ts`'s account export.
 * Every table here carries its own `userId` column EXCEPT `run_steps`, which is scoped
 * one hop removed via `run_steps.runId → runs.id` (same shape `runs/queries.ts`'s own
 * reads use); this module resolves the caller's own run ids first, then scopes the
 * `run_steps` read to exactly those ids via `inArray` — never a join that could leak
 * another user's steps.
 *
 * Same explicit-column-list discipline as `packages/auth/src/export.ts` ("a future column
 * can never leak by accident"): every `select()` below names its columns rather than
 * reading the whole row. `userId` is omitted from every projection — it's the caller's own
 * id by construction (that's what the `where` clause scopes on), so it's redundant, not
 * sensitive. `runs.error` is the one column deliberately excluded outright: it's raw
 * internal error text (stack/message detail meant for operators debugging a failed
 * pipeline run), not user-facing data a "download my data" export should contain.
 *
 * `packages/untangle` is one of the packages the DAG's
 * `no-bare-drizzle-outside-db-core-billing-brainstorm-untangle` rule allows to import the
 * bare `drizzle-orm` query-operator entry point directly (see `.dependency-cruiser.cjs`),
 * so this reuses the same `eq`/`inArray` pattern `runs/queries.ts` and `tasks/queries.ts`
 * already use, rather than the relational query API `packages/auth/src/export.ts` had to
 * fall back to (that package is NOT on the allowlist).
 */
import { eq, inArray } from "drizzle-orm";

import { getDb } from "@factory/db";

import * as schema from "./schema";

export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const db = getDb();

  const captureRows = await db
    .select({
      id: schema.captures.id,
      source: schema.captures.source,
      url: schema.captures.url,
      rawText: schema.captures.rawText,
      createdAt: schema.captures.createdAt,
    })
    .from(schema.captures)
    .where(eq(schema.captures.userId, userId));

  const taskRows = await db
    .select({
      id: schema.tasks.id,
      runId: schema.tasks.runId,
      captureId: schema.tasks.captureId,
      parentTaskId: schema.tasks.parentTaskId,
      title: schema.tasks.title,
      priority: schema.tasks.priority,
      effortMinutes: schema.tasks.effortMinutes,
      dueAt: schema.tasks.dueAt,
      tag: schema.tasks.tag,
      status: schema.tasks.status,
      source: schema.tasks.source,
      sourceStart: schema.tasks.sourceStart,
      sourceEnd: schema.tasks.sourceEnd,
      createdAt: schema.tasks.createdAt,
      completedAt: schema.tasks.completedAt,
    })
    .from(schema.tasks)
    .where(eq(schema.tasks.userId, userId));

  const runRows = await db
    .select({
      id: schema.runs.id,
      kind: schema.runs.kind,
      status: schema.runs.status,
      driver: schema.runs.driver,
      totalCostCents: schema.runs.totalCostCents,
      startedAt: schema.runs.startedAt,
      finishedAt: schema.runs.finishedAt,
      // `error` deliberately excluded — see the module doc comment above.
    })
    .from(schema.runs)
    .where(eq(schema.runs.userId, userId));

  const runIds = runRows.map((row) => row.id);
  const runStepRows =
    runIds.length > 0
      ? await db
          .select({
            id: schema.runSteps.id,
            runId: schema.runSteps.runId,
            key: schema.runSteps.key,
            ordinal: schema.runSteps.ordinal,
            status: schema.runSteps.status,
            source: schema.runSteps.source,
            attempt: schema.runSteps.attempt,
            model: schema.runSteps.model,
            inputTokens: schema.runSteps.inputTokens,
            outputTokens: schema.runSteps.outputTokens,
            costCents: schema.runSteps.costCents,
            durationMs: schema.runSteps.durationMs,
            error: schema.runSteps.error,
            startedAt: schema.runSteps.startedAt,
            finishedAt: schema.runSteps.finishedAt,
          })
          .from(schema.runSteps)
          .where(inArray(schema.runSteps.runId, runIds))
      : [];

  return {
    captures: captureRows,
    tasks: taskRows,
    runs: runRows,
    runSteps: runStepRows,
  };
}
