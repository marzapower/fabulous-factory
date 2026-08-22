import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Run engine domain (milestone 11, plan K.2.1 as corrected by K.14 M6/M7) — the
 * domain-agnostic pipeline engine (`packages/jobs/src/runs/`) is built on this file.
 * This is the "keepable" half of the M11 split (K.1.3): an adopter inherits `run.ts`
 * verbatim, unlike `task.ts`, which is meant to be renamed to their own domain.
 *
 * `runs` deliberately has NO `capture_id` column (K.14 M7): `run.ts` must never import
 * from `task.ts`, or the domain-agnostic half of the schema would depend on the
 * renameable half — exactly the coupling the keep/rename split exists to avoid. The
 * association between a run and the capture that spawned it lives one-way, on
 * `tasks.run_id` / `tasks.capture_id` in `task.ts`. `runs.kind` plus that FK is enough
 * for every read the UI performs.
 *
 * Both `*CostCents` columns use `numeric(14, 6, { mode: "number" })` — the same shape
 * `packages/db/src/schema/llm-call.ts:23` already uses for the same quantity, for the
 * same reason documented there: drizzle's `numeric` defaults to string mode, and
 * fractions of a cent are the norm for small calls.
 */
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Which pipeline ran. 'capture' | 'daily-plan'. */
    kind: text("kind").notNull(),
    /** 'running' | 'succeeded' | 'partial' | 'failed' */
    status: text("status").notNull().default("running"),
    /** 'inline' | 'durable' — which driver executed it. */
    driver: text("driver").notNull(),
    totalCostCents: numeric("total_cost_cents", { precision: 14, scale: 6, mode: "number" }),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("runs_user_id_started_at_idx").on(t.userId, t.startedAt.desc())],
);

/**
 * One row per pipeline step, per run. `run_steps_run_id_key_uidx` is load-bearing, not
 * a nicety: the durable driver re-runs a step on retry and must UPDATE the existing row
 * (K.14 M2/M3 — `upsertRunStep` is the only writer of `attempt`), never insert a
 * duplicate.
 */
export const runSteps = pgTable(
  "run_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    ordinal: integer("ordinal").notNull(),
    /** 'running' | 'succeeded' | 'failed' | 'skipped' */
    status: text("status").notNull(),
    /** 'llm' | 'heuristic' | 'none' — how the work actually got done. */
    source: text("source").notNull().default("none"),
    attempt: integer("attempt").notNull().default(1),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costCents: numeric("cost_cents", { precision: 14, scale: 6, mode: "number" }),
    durationMs: integer("duration_ms"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("run_steps_run_id_key_uidx").on(t.runId, t.key)],
);
