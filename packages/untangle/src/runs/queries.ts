import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { ApiError } from "@factory/core";
import { getDb } from "@factory/db";

import * as schema from "../schema";
import { dailyCeilingMessage, RUN_HARD_CEILING_PER_DAY, runLimitMessage } from "./constants";
import type { RunStatus, StepSource, StepStatus } from "./engine";

/** The start of "today" for run-counting purposes, always UTC regardless of the host
 * process's `TimeZone` (K.14 M9) — comparing a `timestamptz` column against a naive
 * `timestamp` lets Postgres resolve the boundary using the SERVER's timezone, which
 * silently drifts the day boundary off UTC. Both sides of the cast stay explicit. */
const START_OF_TODAY_UTC = sql`date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;

export interface RunListItem {
  id: string;
  kind: string;
  status: RunStatus;
  driver: string;
  totalCostCents: number | null;
  startedAt: Date;
  finishedAt: Date | null;
  stepCount: number;
}

export interface RunStepRow {
  id: string;
  key: string;
  ordinal: number;
  status: StepStatus;
  source: StepSource;
  attempt: number;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number | null;
  durationMs: number | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export type RunDetail = RunListItem & { steps: RunStepRow[] };

const RUN_LIST_COLUMNS = {
  id: schema.runs.id,
  kind: schema.runs.kind,
  status: schema.runs.status,
  driver: schema.runs.driver,
  totalCostCents: schema.runs.totalCostCents,
  startedAt: schema.runs.startedAt,
  finishedAt: schema.runs.finishedAt,
} as const;

const RUN_STEP_COLUMNS = {
  id: schema.runSteps.id,
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
} as const;

/**
 * Creates a run row, enforcing the daily cap INSIDE the insert transaction under
 * `pg_advisory_xact_lock(hashtext('run-cap:' || userId))` — the same race-free shape as
 * the retired demo domain's `createMonitorRow`: the count is read under the lock, so it
 * is guaranteed current for the insert that follows it, and two concurrent calls at the
 * cap can never both land.
 *
 * `runsPerDay: null` means "no plan-specific limit", NOT "no limit at all" — the
 * effective plan cap is always `min(runsPerDay ?? RUN_HARD_CEILING_PER_DAY,
 * RUN_HARD_CEILING_PER_DAY)`. `enforceLimit` decides whether that plan cap applies to
 * THIS call at all: a caller acting on the user's own initiative (e.g. an interactive
 * request) passes `true`; a caller acting on the system's initiative (e.g. a scheduled
 * run) passes `false`, so a user who already spent their day's interactive quota can't
 * have the scheduled run fail underneath them. `RUN_HARD_CEILING_PER_DAY` itself is an
 * abuse floor and applies EVERY time, regardless of `enforceLimit`.
 */
export async function createRun(input: {
  userId: string;
  kind: string;
  driver: "inline" | "durable";
  runsPerDay: number | null;
  enforceLimit: boolean;
}): Promise<{ id: string }> {
  const effectivePlanLimit =
    input.runsPerDay === null
      ? RUN_HARD_CEILING_PER_DAY
      : Math.min(input.runsPerDay, RUN_HARD_CEILING_PER_DAY);
  const isHardCeiling = input.runsPerDay === null || input.runsPerDay > RUN_HARD_CEILING_PER_DAY;

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"run-cap:" + input.userId}))`);

    const [row] = await tx
      .select({ value: count() })
      .from(schema.runs)
      .where(
        and(eq(schema.runs.userId, input.userId), gte(schema.runs.startedAt, START_OF_TODAY_UTC)),
      );
    const runsToday = row?.value ?? 0;

    if (input.enforceLimit && runsToday >= effectivePlanLimit) {
      const message = isHardCeiling ? dailyCeilingMessage() : runLimitMessage(effectivePlanLimit);
      throw new ApiError(422, "run_limit_reached", message);
    }
    if (!input.enforceLimit && runsToday >= RUN_HARD_CEILING_PER_DAY) {
      throw new ApiError(422, "run_limit_reached", dailyCeilingMessage());
    }

    const [inserted] = await tx
      .insert(schema.runs)
      .values({ userId: input.userId, kind: input.kind, driver: input.driver })
      .returning({ id: schema.runs.id });
    if (!inserted) {
      throw new Error("createRun: insert returned no row");
    }
    return { id: inserted.id };
  });
}

/**
 * The ONLY writer of `run_steps.attempt`. `ON CONFLICT (run_id, key) DO UPDATE SET
 * attempt = attempt + 1, status = 'running', started_at = now(), error = null` — a step
 * that runs for the first time inserts at `attempt = 1`; a durable-driver retry of the
 * same step updates the existing row and increments `attempt`, rather than duplicating a
 * row (`run_steps_run_id_key_uidx` is what makes this an upsert rather than a plain
 * insert). Called exactly once per real attempt, from inside the driver-wrapped closure
 * — see `runPipeline`'s doc comment in `engine.ts`.
 */
export async function upsertRunStep(input: {
  runId: string;
  key: string;
  ordinal: number;
  status: StepStatus;
  source?: StepSource;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costCents?: number | null;
  durationMs?: number | null;
  error?: string | null;
}): Promise<{ attempt: number }> {
  const [row] = await getDb()
    .insert(schema.runSteps)
    .values({
      runId: input.runId,
      key: input.key,
      ordinal: input.ordinal,
      status: input.status,
      source: input.source ?? "none",
      model: input.model ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      costCents: input.costCents ?? null,
      durationMs: input.durationMs ?? null,
      error: input.error ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.runSteps.runId, schema.runSteps.key],
      set: {
        attempt: sql`${schema.runSteps.attempt} + 1`,
        status: input.status,
        startedAt: sql`now()`,
        error: null,
        // Every field the PREVIOUS attempt left behind is cleared too. Without this, a
        // retrying step reads back as `running` while still carrying the last attempt's
        // `finishedAt`, `durationMs`, `model` and token/cost figures — so the run-history
        // page renders a step that is currently executing alongside a finish time and a
        // duration belonging to a run that already failed. Worse, the stale cost would be
        // counted as if it were this attempt's.
        finishedAt: null,
        durationMs: null,
        source: "none",
        model: null,
        inputTokens: null,
        outputTokens: null,
        costCents: null,
      },
    })
    .returning({ attempt: schema.runSteps.attempt });
  if (!row) {
    throw new Error("upsertRunStep: no row returned");
  }
  return { attempt: row.attempt };
}

/**
 * Plain `UPDATE … WHERE run_id = $1 AND key = $2` — never touches `attempt`. This is
 * deliberately a separate function from `upsertRunStep` (K.14 M2/M3): the engine calls
 * `upsertRunStep` once at step start and `finishRunStep` once at step end, and only the
 * first of those may legally increment `attempt`. Merging the two into one
 * "upsert-always" call was the defect this split fixes — it made a step that never
 * retried still record `attempt = 2`.
 */
export async function finishRunStep(input: {
  runId: string;
  key: string;
  status: StepStatus;
  source?: StepSource;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costCents?: number | null;
  durationMs?: number | null;
  error?: string | null;
}): Promise<void> {
  await getDb()
    .update(schema.runSteps)
    .set({
      status: input.status,
      source: input.source,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costCents: input.costCents,
      durationMs: input.durationMs,
      error: input.error ?? null,
      finishedAt: sql`now()`,
    })
    .where(and(eq(schema.runSteps.runId, input.runId), eq(schema.runSteps.key, input.key)));
}

/** Terminal write for the run row itself. `error` carries the aborting step's message on
 * the `onFailure: 'abort'` rethrow path (K.14 M1); `null` on every other outcome. */
export async function finishRun(
  runId: string,
  status: RunStatus,
  totalCostCents: number | null,
  error: string | null = null,
): Promise<void> {
  await getDb()
    .update(schema.runs)
    .set({ status, totalCostCents, error, finishedAt: sql`now()` })
    .where(eq(schema.runs.id, runId));
}

/** Count of runs `userId` started today (UTC, see `START_OF_TODAY_UTC`), optionally
 * scoped to one `kind`. */
export async function countRunsToday(userId: string, kind?: string): Promise<number> {
  const conditions = [
    eq(schema.runs.userId, userId),
    gte(schema.runs.startedAt, START_OF_TODAY_UTC),
  ];
  if (kind !== undefined) {
    conditions.push(eq(schema.runs.kind, kind));
  }
  const [row] = await getDb()
    .select({ value: count() })
    .from(schema.runs)
    .where(and(...conditions));
  return row?.value ?? 0;
}

/** Runs owned by `userId`, newest first, each with its step count. */
export async function listRunsForUser(userId: string, limit = 20): Promise<RunListItem[]> {
  const runRows = await getDb()
    .select(RUN_LIST_COLUMNS)
    .from(schema.runs)
    .where(eq(schema.runs.userId, userId))
    .orderBy(desc(schema.runs.startedAt))
    .limit(limit);
  if (runRows.length === 0) {
    return [];
  }

  const stepCounts = await getDb()
    .select({ runId: schema.runSteps.runId, value: count() })
    .from(schema.runSteps)
    .where(
      inArray(
        schema.runSteps.runId,
        runRows.map((r) => r.id),
      ),
    )
    .groupBy(schema.runSteps.runId);
  const stepCountByRun = new Map(stepCounts.map((s) => [s.runId, s.value]));

  // `runs.status` is a plain `text` column (its values are enforced by this module's own
  // writers, not a DB-level enum) — the cast is narrowing a value drizzle can only type as
  // `string`, not asserting anything unverified.
  return runRows.map((r) => ({
    ...r,
    status: r.status as RunStatus,
    stepCount: stepCountByRun.get(r.id) ?? 0,
  }));
}

/** One run's full detail (its row plus every step, ordinal order) — scoped by BOTH
 * `runId` and `userId`, so one user can never read another's run via a guessed id. */
export async function getRunForUser(runId: string, userId: string): Promise<RunDetail | undefined> {
  const [run] = await getDb()
    .select(RUN_LIST_COLUMNS)
    .from(schema.runs)
    .where(and(eq(schema.runs.id, runId), eq(schema.runs.userId, userId)));
  if (!run) {
    return undefined;
  }

  const stepRows = await getDb()
    .select(RUN_STEP_COLUMNS)
    .from(schema.runSteps)
    .where(eq(schema.runSteps.runId, runId))
    .orderBy(asc(schema.runSteps.ordinal));
  // Same narrowing cast as `listRunsForUser` — `status`/`source` are plain `text`
  // columns, and this module is the only writer of both.
  const steps: RunStepRow[] = stepRows.map((s) => ({
    ...s,
    status: s.status as StepStatus,
    source: s.source as StepSource,
  }));

  return { ...run, status: run.status as RunStatus, stepCount: steps.length, steps };
}
