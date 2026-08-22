# Part K — Milestone 11 contracts (Untangle: the keepable AI workspace)

> Authored 2026-08-21. Replaces the page-monitor demo with a keepable, streaming
> brain-dump→tasks workspace. Follows the per-milestone contract format of
> `m6-jobs-demo.md` / `m7-billing.md`. "Critique corrections" subsections, once added,
> are BINDING and supersede earlier text in this file.

### K.0 Scope statement

**Job to be done:** _"I have a wall of mess in my head. I paste it, and I watch it become
an ordered list of tasks with priorities, effort, due dates and subtasks."_

**In:**

- `@factory/llm` gains a **streaming array** call (`streamArray`) with identical budget,
  cost, OTel and `llm_calls` accounting to `generate` — extracted into a shared
  `call.ts` so neither path forks the accounting.
- `@factory/jobs` gains a domain-agnostic **run engine** (`runs/`) with two drivers
  (inline / durable) plus the **tasks domain** (`tasks/`) that rides on it.
- New tables: `captures`, `runs`, `run_steps`, `tasks`. `monitors` / `monitor_events`
  are dropped.
- `apps/web` gains a POST-SSE run endpoint, a rewritten dashboard workspace, a run
  history page, and a design-token layer for the workspace.
- The plan catalog's metered unit changes from `monitorLimit` to `runsPerDay`.
- The scheduled digest is re-homed: a **daily plan** cron fan-out per user, using the
  same run engine under the durable driver, emailing a `daily-plan` digest.
- Adoption surface: `make-it-yours` Phase 2 flips from _delete the demo_ to _rename the
  domain_; `LAUNCH.md`'s `Demo logic` item is reworded to match.

**Explicitly out (excluded impacts):**

- No new env vars — `ENV_REGISTRY` is untouched, `.env.example` does not regenerate.
- No new workspace package, no DAG edge changes. `packages/jobs`' existing allowlist
  (`config, db, core, llm, email, analytics, observability`) already covers everything.
- No vector store, no embeddings, no pgvector.
- No multi-user / org concepts. Single-user, exactly as today.
- `packages/auth`, `packages/core`, `apps/web/middleware.ts` are **not touched**.
  (`packages/billing` and `packages/db/migrations` ARE touched — both guarded zones, so
  `fab-bastion` review is mandatory.)
- No dark-mode toggle. Tokens are defined for both schemes; nothing sets `.dark`.
- No new fonts are vendored — the third type voice uses a system serif stack.

### K.1 Decisions declared autonomously

1. **Name.** The product is **Untangle**; the verb in the UI is _Untangle_ and the past
   tense in every subsequent surface is _Untangled_. Placeholder by design — `brand-it`
   renames it.
2. **Package placement.** The engine and domain live in `packages/jobs`, not a new
   package. `packages/jobs` is already the only package whose DAG allowlist spans
   `llm + email + analytics + core + db`, and it already hosts domain code (`demo/`).
   A new package would need new `dag-*` rules for zero structural gain.
3. **Keep/rename boundary is encoded in the directory names.** `packages/jobs/src/runs/`
   is domain-agnostic and meant to be inherited verbatim; `packages/jobs/src/tasks/` is
   the renameable domain. `make-it-yours` names exactly this split.
4. **Streaming shape.** `Output.array({ element })` + `result.elementStream`, not
   `Output.object` + `partialOutputStream`. Elements arrive complete and typed; no
   `DeepPartial` leaks out of `packages/llm`, and cards pop in fully formed instead of
   character-typing.
5. **Transport.** One `POST /api/runs` that executes the run and streams SSE frames back
   on the same response. No separate create+subscribe pair, therefore no cross-request
   pub/sub. Consumed with `fetch` + a manual frame reader, never `EventSource` (GET-only).
6. **Interactive runs are always inline.** The durable driver exists for the daily-plan
   cron. This is what keeps the interactive UX byte-identical with `jobs` disabled.
7. **Stale runs are derived, not reaped.** A run left `running` past
   `RUN_STALE_AFTER_MS` reads as `interrupted`. No reaper job — a reaper would not exist
   in the baseline profile anyway.
8. **Dates in pipeline state are ISO strings, never `Date`.** The durable driver
   `Jsonify`s every `step.run` return value; a `Date` would silently become a string
   across a retry boundary.

---

## K.2 Domain model

Two schema files replace `packages/db/src/schema/monitor.ts`.

### K.2.1 `packages/db/src/schema/run.ts` — the engine's tables (keepable)

```ts
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
    // NO capture_id here (K.14 M7): run.ts must never import task.ts, or the "inherited
    // verbatim" half of the tree would depend on the renameable half. The association
    // lives one-way on tasks.run_id / tasks.capture_id.
    totalCostCents: numeric("total_cost_cents", { precision: 14, scale: 6, mode: "number" }),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("runs_user_id_started_at_idx").on(t.userId, t.startedAt.desc())],
);

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
  (t) => [
    // The durable driver re-runs a step on retry and must UPDATE, never duplicate.
    uniqueIndex("run_steps_run_id_key_uidx").on(t.runId, t.key),
  ],
);
```

Both cost columns are `numeric(14, 6, { mode: "number" })` — the exact shape
`packages/db/src/schema/llm-call.ts:23` already uses for the same quantity, for the
reason documented there (drizzle's `numeric` defaults to string mode; fractions of a cent
are the norm).

### K.2.2 `packages/db/src/schema/task.ts` — the domain's tables (renameable)

```ts
export const captures = pgTable(
  "captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** 'paste' | 'url' */
    source: text("source").notNull(),
    /** The URL, when source = 'url'. */
    url: text("url"),
    /** Normalized text actually fed to the pipeline, capped at MAX_CAPTURE_CHARS. */
    rawText: text("raw_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("captures_user_id_idx").on(t.userId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
    captureId: uuid("capture_id").references(() => captures.id, { onDelete: "set null" }),
    parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => tasks.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    /** 'now' | 'next' | 'later' | null (untriaged) */
    priority: text("priority"),
    effortMinutes: integer("effort_minutes"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    tag: text("tag"),
    /** 'open' | 'done' */
    status: text("status").notNull().default("open"),
    /** 'llm' | 'heuristic' | 'manual' — provenance of the row itself. */
    source: text("source").notNull(),
    /** Character offsets into captures.raw_text; null when not locatable. */
    sourceStart: integer("source_start"),
    sourceEnd: integer("source_end"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_user_id_status_idx").on(t.userId, t.status),
    index("tasks_parent_task_id_idx").on(t.parentTaskId),
    index("tasks_run_id_idx").on(t.runId),
  ],
);
```

`parentTaskId` is a self-reference — Drizzle requires the explicit `AnyPgColumn` return
annotation on the callback or TS7024 fires.

### K.2.3 Migration

One generated migration (`pnpm db:generate`): creates the four tables, drops
`monitor_events` then `monitors`. Reviewed by hand before it is allowed to run — a
generated migration that touches anything beyond these six objects is rejected, not
edited around. `packages/db/migrations` is a guarded zone.

---

## K.3 `packages/llm` — streaming, without forking the accounting

### K.3.1 New: `packages/llm/src/call.ts` (shared, not speculative — two consumers)

Extracted verbatim-in-behavior from today's `generate.ts`. Existing
`packages/llm/test/generate.test.ts` is the regression guard: it must pass unchanged.

```ts
export interface PreparedCall {
  model: LanguageModel;
  modelId: string;
  profile: "local" | "openrouter" | "direct";
  quality: Quality;
  instructions: string | undefined;
  prompt: string;
  enforcedMaxOutputTokens: number | undefined;
}

/** Steps 1-4 of the documented runtime order: resolve → assemble → budget pre-check.
 *  Throws LlmDisabledError / LlmBudgetExceededError before any provider call. */
export function prepareCall(opts: GenerateOptions): Promise<PreparedCall>;

/** Steps 6-7: usage → cost, span attributes, `llm_calls` write. Returns the envelope. */
export function finalizeCall<T>(args: {
  prepared: PreparedCall;
  span: Span;
  startedAt: number;
  promptId: string | undefined;
  output: T;
  inputTokens: number | null;
  outputTokens: number | null;
  openRouterCostUsd: number | undefined;
}): Promise<GenerateResult<T>>;

/** Step 8 failure path: span status, error code, failed `llm_calls` row. Never wraps. */
export function recordCallFailure(args: {
  prepared: PreparedCall;
  span: Span;
  startedAt: number;
  promptId: string | undefined;
  error: unknown;
}): Promise<void>;

export function detectErrorCode(error: unknown): string;
export function extractOpenRouterCostUsd(
  md: Record<string, unknown> | undefined,
): number | undefined;
```

`generate.ts` is rewritten to call these three and keeps its exact public signature,
overloads, and observable behaviour.

### K.3.2 New: `packages/llm/src/stream.ts`

```ts
export interface StreamArrayOptions<S extends z.ZodType> extends GenerateOptions {
  /** Schema of ONE array element. */
  element: S;
  /** Invoked once per element, in arrival order, as the model completes it.
   *  A throw here is caught and logged once — it never fails the call. */
  onElement?: (element: z.infer<S>, index: number) => void;
}

export function streamArray<S extends z.ZodType>(
  opts: StreamArrayOptions<S>,
): Promise<GenerateResult<Array<z.infer<S>>>>;
```

Runtime order, mirroring `generate` exactly:

1. `prepareCall(opts)` — disabled check, routing, prompt assembly, budget pre-check.
2. `tracer.startActiveSpan("llm.stream_array", …)`, `gen_ai.operation.name = "stream_text"`.
3. `streamText({ …callOptions, output: Output.array({ element: opts.element }) })`.
4. **We** drain `result.elementStream` in a `for await`, invoking `onElement` per element
   inside a try/catch. The consumer never owns the stream, so the accounting below can
   never be skipped by an abandoned iterator.
5. `await result.output` / `result.usage` / `result.providerMetadata` → `finalizeCall`.
6. Any throw from 3-5 → `recordCallFailure`, then rethrow the original error.

`abortSignal` passes through unchanged; an abort surfaces as a throw and is recorded as a
failed call, same as `generate`.

### K.3.3 `packages/llm/src/index.ts`

Adds `export { streamArray, type StreamArrayOptions } from "./stream";`. Nothing else in
the public surface changes. **`ai` types never leave this package** — `elementStream`'s
element type is our own `z.infer<S>`, so `packages/jobs` never references `ai` and the
`ai-sdk-only-in-llm` boundary rule stays satisfied.

---

## K.4 `packages/jobs` — the run engine (`runs/`, keepable)

### K.4.1 `runs/engine.ts`

```ts
export type RunStatus = "running" | "succeeded" | "partial" | "failed";
export type StepStatus = "running" | "succeeded" | "failed" | "skipped";
export type StepSource = "llm" | "heuristic" | "none";

export interface RunStepContext {
  runId: string;
  userId: string;
  /** Push a domain event toward the caller's transport. No-op under the durable driver. */
  emit: (event: RunEvent) => void;
  signal?: AbortSignal;
}

export interface RunStepResult<TState> {
  state: TState; // MUST be JSON-safe (see K.1.8)
  source: StepSource;
  skipped?: boolean; // deliberately did nothing; not a failure
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costCents?: number | null;
}

export interface RunStep<TState> {
  key: string;
  label: string;
  /** 'abort' stops the run on failure; 'continue' marks the run 'partial'. */
  onFailure: "abort" | "continue";
  run: (state: TState, ctx: RunStepContext) => Promise<RunStepResult<TState>>;
}

/** Wraps ONE step's execution. Inline runs it directly; durable wraps it in step.run(). */
export type RunDriver = <T>(key: string, fn: () => Promise<T>) => Promise<T>;

export type RunEvent =
  | { type: "run-started"; runId: string }
  | {
      type: "step";
      key: string;
      label: string;
      ordinal: number;
      status: StepStatus;
      attempt: number;
      source?: StepSource;
      model?: string | null;
      costCents?: number | null;
      durationMs?: number | null;
    }
  | { type: "data"; payload: unknown } // domain-owned, engine never inspects it
  | { type: "run-finished"; runId: string; status: RunStatus; totalCostCents: number | null };

export interface RunSummary<TState> {
  status: RunStatus;
  state: TState;
  totalCostCents: number | null;
}

export function runPipeline<TState>(opts: {
  runId: string;
  userId: string;
  steps: ReadonlyArray<RunStep<TState>>;
  seed: TState;
  driver: RunDriver;
  emit: (event: RunEvent) => void;
  signal?: AbortSignal;
}): Promise<RunSummary<TState>>;
```

Per step, in order: `upsertRunStep(running)` → `emit(step:running)` → `driver(key, …)` →
on success `upsertRunStep(succeeded|skipped)` + `emit` + accumulate cost; on throw
`upsertRunStep(failed, error)` + `emit` + honour `onFailure`. Finally `finishRun(...)` and
`emit(run-finished)`. `runPipeline` itself **never throws** for a step failure — the
summary carries the verdict. It only throws if the run-row bookkeeping itself fails.

### K.4.2 `runs/drivers.ts`

```ts
/** Executes in-process. The only driver available when capabilities.jobs === 'disabled'. */
export const inlineDriver: RunDriver;

/** Wraps each engine step in one Inngest step.run — per-step retries and durability.
 *  `step` is the Inngest step tool; typed structurally so this file needs no import
 *  from `inngest` beyond what `client.ts` already owns. */
export function durableDriver(step: {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
}): RunDriver;
```

### K.4.3 `runs/queries.ts`

```ts
export interface RunListItem {
  id: string;
  kind: string;
  status: RunStatus;
  driver: string;
  totalCostCents: number | null;
  startedAt: Date;
  finishedAt: Date | null;
  stepCount: number;
  taskCount: number;
}

/** Enforces the daily run cap INSIDE the insert transaction, under
 *  pg_advisory_xact_lock(hashtext('run-cap:' || userId)) — same race-free shape as the
 *  retired createMonitorRow. `runsPerDay: null` means "no plan limit", NOT "no limit":
 *  the effective cap is always min(limit ?? CEILING, CEILING). Throws
 *  ApiError(422, 'run_limit_reached'). */
export function createRun(input: {
  userId: string;
  kind: string;
  driver: "inline" | "durable";
  captureId?: string | null;
  runsPerDay: number | null;
}): Promise<{ id: string }>;

export function upsertRunStep(input: {
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
}): Promise<{ attempt: number }>; // ON CONFLICT (run_id, key) DO UPDATE, attempt + 1

export function finishRun(
  runId: string,
  status: RunStatus,
  totalCostCents: number | null,
  error?: string | null,
): Promise<void>;

export function countRunsToday(userId: string, kind?: string): Promise<number>;
export function listRunsForUser(userId: string, limit?: number): Promise<RunListItem[]>;
export function getRunForUser(runId: string, userId: string): Promise<RunDetail | undefined>;
```

`countRunsToday` counts `started_at >= date_trunc('day', now() at time zone 'utc')`.

### K.4.4 `runs/constants.ts`

```ts
/** Absolute per-user daily run ceiling, enforced in EVERY profile, including the
 *  `runsPerDay: null` (billing-disabled) case. Above every catalog plan by design. */
export const RUN_HARD_CEILING_PER_DAY = 300;
export function runLimitMessage(limit: number): string; // plan wording
export function dailyCeilingMessage(): string; // abuse-floor wording — never says "plan"
/** A run still 'running' after this reads as 'interrupted'. */
export const RUN_STALE_AFTER_MS = 5 * 60_000;
export function isStaleRun(status: RunStatus, startedAt: Date, now?: Date): boolean;
```

---

## K.5 `packages/jobs` — the tasks domain (`tasks/`, renameable)

### K.5.1 Pipeline state and events

```ts
export interface CaptureState {
  captureId: string;
  rawText: string;
  todayIso: string; // trusted context, injected by the caller
  tasks: Array<{ id: string; index: number; title: string; needsBreakdown: boolean }>;
}

export type TaskEvent =
  | {
      kind: "task-added";
      id: string;
      index: number;
      title: string;
      sourceStart: number | null;
      sourceEnd: number | null;
    }
  | {
      kind: "task-triaged";
      id: string;
      index: number;
      priority: Priority;
      effortMinutes: number | null;
      dueAt: string | null;
      tag: string | null;
    }
  | {
      kind: "task-decomposed";
      parentId: string;
      parentIndex: number;
      subtasks: Array<{ id: string; title: string }>;
    };
```

### K.5.2 `tasks/pipeline.ts` — `capturePipeline: ReadonlyArray<RunStep<CaptureState>>`

| #   | key         | onFailure  | LLM path                                                                         | No-LLM / failure path                                                       |
| --- | ----------- | ---------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | `extract`   | `abort`    | `streamArray` → `{ title, sourceQuote? }`, row inserted + emitted per element    | `heuristicExtract(rawText)` — same rows, same events, `source: 'heuristic'` |
| 2   | `triage`    | `continue` | `streamArray` → `{ index, priority, effortMinutes, dueAt, tag, needsBreakdown }` | `heuristicTriage(titles)` — keyword priority, no effort, coarse due dates   |
| 3   | `decompose` | `continue` | only for `needsBreakdown` tasks; `streamArray` → `{ index, subtasks[] }`         | `skipped: true` — never faked                                               |

Every step checks `isEnabled("llm")` first and takes the heuristic branch when it is
`false`. When it is `true` and the call throws, the step falls back to the heuristic (for
`extract`/`triage`) or reports `skipped` (`decompose`) rather than failing the run —
mirroring `checkMonitor`'s diff-fallback stance. `captureException` is called on every
fallback so the degradation is visible, never silent.

Prompts live in `tasks/prompts.ts`: trusted task strings + zod element schemas. The
capture text and every task title derived from it are ALWAYS passed via
`untrusted(...)` — never interpolated into `task`.

### K.5.3 `tasks/heuristics.ts` — pure, no I/O, the degradation proof

```ts
export interface HeuristicTask {
  title: string;
  sourceStart: number;
  sourceEnd: number;
}
/** Splits on newlines and bullet markers, strips markers/numbering, drops blanks and
 *  anything under MIN_TASK_CHARS, caps at MAX_TASKS_PER_RUN. Offsets are exact — the
 *  heuristic path has BETTER provenance than the LLM path, by construction. */
export function heuristicExtract(rawText: string): HeuristicTask[];

/** Keyword priority ('asap'/'urgent'/'today'/'!' → now; 'someday'/'maybe' → later;
 *  else next) and a small date vocabulary (today/tomorrow/tonight/weekday names). */
export function heuristicTriage(
  titles: string[],
  todayIso: string,
): Array<{
  index: number;
  priority: Priority;
  effortMinutes: null;
  dueAt: string | null;
  tag: null;
}>;

/** Locates a model-quoted excerpt in the raw text, whitespace-tolerant.
 *  Returns null when not found — a hallucinated quote yields no anchor, never a wrong one. */
export function locateQuote(rawText: string, quote: string): { start: number; end: number } | null;
```

### K.5.4 `tasks/daily-plan.ts` — `dailyPlanPipeline: ReadonlyArray<RunStep<DailyPlanState>>`

| #   | key      | onFailure  | LLM path                                                        | No-LLM path                                                                     |
| --- | -------- | ---------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | `gather` | `abort`    | —                                                               | open tasks for the user, `dueAt asc, priority desc`                             |
| 2   | `focus`  | `continue` | `streamArray` → `{ index, reason }` for the 3 that matter today | first 3 by the same ordering, no reason line                                    |
| 3   | `notify` | `continue` | —                                                               | `send("daily-plan", …)`; a non-`console` undelivered result warns, never throws |

### K.5.5 `tasks/queries.ts`

```ts
export function createCapture(input: {
  userId: string;
  source: "paste" | "url";
  url?: string | null;
  rawText: string;
}): Promise<{ id: string }>;
export function insertExtractedTask(input: {
  userId: string;
  runId: string;
  captureId: string;
  title: string;
  source: "llm" | "heuristic";
  sourceStart: number | null;
  sourceEnd: number | null;
}): Promise<{ id: string }>;
export function applyTriage(
  taskId: string,
  triage: {
    priority: Priority;
    effortMinutes: number | null;
    dueAt: Date | null;
    tag: string | null;
  },
): Promise<void>;
export function insertSubtasks(
  parentTaskId: string,
  userId: string,
  runId: string,
  titles: string[],
  source: "llm" | "heuristic",
): Promise<Array<{ id: string; title: string }>>;

export function listTasksForUser(userId: string): Promise<TaskTree[]>; // parents + nested children
export function listOpenTasksForUser(userId: string): Promise<TaskListItem[]>;
export function setTaskStatus(
  id: string,
  userId: string,
  status: "open" | "done",
): Promise<boolean>;
export function createManualTask(input: {
  userId: string;
  title: string;
  captureId?: string | null;
  sourceStart?: number | null;
  sourceEnd?: number | null;
}): Promise<{ id: string }>;
export function deleteTaskRow(id: string, userId: string): Promise<boolean>;
```

Every mutation is scoped by `(id, userId)` — never by id alone.

### K.5.6 `tasks/constants.ts`

`MAX_CAPTURE_CHARS = 20_000`, `MAX_TASKS_PER_RUN = 30`, `MAX_SUBTASKS_PER_TASK = 8`,
`MIN_TASK_CHARS = 3`, `MAX_TITLE_CHARS = 200`, `MAX_TAG_CHARS = 24`,
`URL_FETCH_MAX_BYTES = 1_048_576`, `URL_FETCH_TIMEOUT_MS = 10_000`.

---

## K.6 `packages/jobs` — cron, barrels, deletions

- **`cron/daily-plan-cron.ts`** — `{ id: "daily-plan-cron", triggers: [{ cron: "0 7 * * *" }] }`.
  `step.run("list-users")` selects distinct `user_id` from open tasks, then fans out
  `DAILY_PLAN_EVENT` in chunks of 500 (the existing `chunk()` helper moves here verbatim
  — it is already pure and unit-tested).
- **`cron/daily-plan-worker.ts`** — `retries: 3`. Idempotency without a new column: skips
  when `countRunsToday(userId, "daily-plan") > 0`. Runs `dailyPlanPipeline` through
  `durableDriver(step)`. `onFailure` marks the run `failed` via `finishRun`.
- **`events.ts`** — `MONITOR_CHECK_EVENT` → `DAILY_PLAN_EVENT = "untangle/daily-plan.requested"`.
- **`functions/index.ts`** — `[dailyPlanCron, dailyPlanWorker]`.
- **`index.ts`** — re-exports the `runs/` and `tasks/` public surfaces; every
  `demo/*` export is removed.
- **Deleted:** `packages/jobs/src/demo/**`, `packages/jobs/test/check-monitor.test.ts`,
  `queries.test.ts`, `test/integration/demo.test.ts`.
- **`.dependency-cruiser.cjs`:** the `diff-only-in-jobs` rule loses its only consumer.
  The `diff` dependency is dropped from `packages/jobs/package.json` and the rule is
  removed with it. Rule comments naming `monitors`/`monitor_events` are updated to name
  the new tables — comments that lie are worse than no comments.

---

## K.7 `packages/config` + `packages/billing` — the metered unit

`Plan.monitorLimit` → `Plan.runsPerDay`; `Entitlement.monitorLimit` → `Entitlement.runsPerDay`.
Free `5`, Pro `200` (below `RUN_HARD_CEILING_PER_DAY`). Metering runs, not tasks, is the
honest choice: a run is what costs money, and the limit lands on a moment the user feels.
`packages/billing` is a guarded zone — mechanical rename only, no logic change; the
`freeEntitlement("disabled") → runsPerDay: null` semantics are preserved exactly.

`packages/email`: the `change-digest` template becomes `daily-plan`
(`{ tasks: Array<{ title, dueAt, reason }>, appUrl }`), and its `SUBJECTS` entry becomes
`"Your plan for today"`.

---

## K.8 `apps/web` — transport, actions, pages

### K.8.1 `POST /api/runs` (`apps/web/app/api/runs/route.ts`)

```ts
export const dynamic = "force-dynamic";
export const POST = defineHandler({
  auth: "required",
  input: z
    .object({
      text: z.string().max(MAX_CAPTURE_CHARS).optional(),
      url: z.url({ protocol: /^https?$/ }).optional(),
    })
    .refine((v) => Boolean(v.text?.trim()) !== Boolean(v.url), "Provide either text or a URL"),
  rateLimit: { windowSeconds: 60, max: 6 },
  handler: async ({ session, input, req }) => {
    /* returns a streaming Response */
  },
});
```

Body:

1. `url` given → `safeFetch(url, { maxBytes: URL_FETCH_MAX_BYTES, timeoutMs: URL_FETCH_TIMEOUT_MS })`,
   then the same tag-stripping normalization the retired `normalizeContent` used (moved
   to `tasks/normalize.ts`, kept verbatim, kept unit-tested).
2. `getEntitlement(session.user.id)` at the action layer, never inside the transaction.
3. `createCapture` → `createRun({ …, runsPerDay: entitlement.runsPerDay })`. An
   `ApiError` from the cap check propagates as a normal JSON error response — the stream
   is never opened, so a 422 is a plain 422.
4. Otherwise return `new Response(stream, { headers: { "content-type": "text/event-stream",
"cache-control": "no-cache, no-transform", "connection": "keep-alive",
"x-accel-buffering": "no" } })` and drive `runPipeline(capturePipeline, …, inlineDriver)`
   with `emit` writing `data: ${JSON.stringify(event)}\n\n`.
5. Client disconnect: enqueue-after-close is swallowed by a small `SseWriter` guard and
   the run continues to completion, so the DB never ends mid-write. `req.signal` is NOT
   forwarded as the pipeline's abort signal — a closed tab must not cancel work already
   paid for.

### K.8.2 `apps/web/app/dashboard/actions.ts`

Keeps `createCheckoutAction` / `openPortalAction` unchanged. Monitor actions are replaced
by `toggleTaskAction`, `createManualTaskAction`, `deleteTaskAction` — each
`defineAction({ auth: "required", input: z…, … })`.

### K.8.3 Pages

- `apps/web/app/dashboard/page.tsx` — server component: `requireSession`, then
  `listTasksForUser`, `listRunsForUser(5)`, `getEntitlement`, `countRunsToday`. Renders
  `<Workspace>` plus the billing card (still gated on `isEnabled("billing")`) and the
  existing `<CapabilityPanel>`.
- `apps/web/app/runs/page.tsx` — run history: one row per run with its steps, models,
  tokens, cost, duration, driver, and `interrupted` derived via `isStaleRun`. This is the
  page a technical evaluator screenshots.

### K.8.4 Pure, testable client logic (`apps/web/test/` is node-env, no DOM)

- `apps/web/lib/sse.ts` — `createSseFrameParser(): (chunk: string) => object[]`, handling
  split frames across chunk boundaries. Unit-tested.
- `components/workspace/run-reducer.ts` — `runReducer(state, event)`, the single source of
  truth for the live view. Unit-tested against a recorded event sequence, including
  out-of-order and duplicate events.
- `components/workspace/format.ts` — `formatCents`, `formatDuration`, `formatDue`. Unit-tested.

---

## K.9 Design direction — "the dump consumes itself"

**Subject:** the mess in your head, and the machine that sorts it. **Audience:** both the
person with the mess and the engineer deciding whether this template is real. The design
serves both by _showing the machinery instead of hiding it_.

**Three type voices, each with a job.** Serif = your words. Sans = the product. Mono = the
machine. This is the structural device, and it encodes something true: you can tell at a
glance who is speaking.

- `--font-serif: ui-serif, Georgia, "Iowan Old Style", "Times New Roman", serif` — the
  dump only. No new font files are vendored.
- Plex Sans (existing) — chrome, task titles.
- Plex Mono (existing) — models, tokens, cents, milliseconds, step keys.

**Colour: chroma belongs to work in flight, and drains when it lands.** The page is
achromatic — the existing neutral token set, untouched. The single accent, `--fab-live`,
appears only while a run is executing: the active step, the streaming region's hairline,
the pulse on the button. When the run finishes, the tint transitions out over 600ms and
the page settles to pure ink-on-paper. Priority is carried by ink _density_, not hue
(`now` = solid ink chip, `next` = outlined, `later` = grey text), which stays legible for
colour-blind readers and keeps the accent's meaning unambiguous.

New tokens in `globals.css` (light + dark), exposed through `@theme inline`:
`--fab-live`, `--fab-live-soft`, `--fab-paper` (a cool, faintly blue-grey slab for the
dump), `--fab-marker` (replacing the raw `text-amber-600` currently hard-coded across
five marketing components — a raw palette class is a design-system violation, and it is
in scope to tokenize the ones the workspace touches).

**Signature: the consuming dump.** The pasted text stays on screen. As `extract` streams,
each task's source span highlights, then settles to `opacity: .45` — _consumed_. Text that
produced no task **stays fully lit**, which is honest (you can see what the model ignored)
and immediately useful: click a leftover span and it becomes a task via
`createManualTaskAction`. Hovering a card highlights its source span and vice versa,
wired with `aria-describedby` rather than colour alone. Provenance is achieved with
character offsets and highlight state — no SVG leader lines, so nothing breaks on reflow.

```
┌───────────────────────────────────────────────────────────────────┐
│ Untangle                                        plan · 3/5 today  │
├─────────────────────────────────┬─────────────────────────────────┤
│ YOUR DUMP            (serif)    │ THE LIST              (sans)    │
│ ┌─────────────────────────────┐ │ ┌─────────────────────────────┐ │
│ │ ░call marco re contract by░ │ │ │ Call Marco about the        │ │
│ │ ░friday░ also need to book  │ │ │ contract            ▮ now   │ │
│ │ flights, and the landing    │ │ │ fri 22 aug · 15m            │ │
│ │ page still looks rough      │ │ ├─────────────────────────────┤ │
│ └─────────────────────────────┘ │ │ Book flights        ▯ next  │ │
│  ░ = consumed   lit = leftover  │ │   └ Compare dates           │ │
│ [ Untangle ]                    │ │   └ Hold the booking        │ │
├─────────────────────────────────┴─────────────────────────────────┤
│ RUN 04 · inline   extract ✓ 1.2s · claude-x · 812t · 0.04¢        │
│                   triage  ● running                               │
│                   decompose  queued                     (mono)    │
└───────────────────────────────────────────────────────────────────┘
```

**Motion.** Nothing animates on page load. The run _is_ the motion: cards enter with a
120ms fade + 2px rise as they arrive over the wire (staggering is a property of the
network, not a delay we fake); chips settle in when triage lands; subtasks expand by
height. `prefers-reduced-motion: reduce` collapses all of it to instant state changes,
including the tint drain.

**Empty state as invitation.** The dump box ships with a real, messy example and a
_"Try this one"_ button — one click to a full run, before signup friction has any chance
to bore anyone.

**Copy.** Verbs the user controls, one vocabulary end to end: the button says _Untangle_,
the toast says _Untangled_, the history says _Untangled 3 minutes ago_. Errors say what
happened and what to do: _"That page wouldn't load. Paste the text instead."_ — never an
apology, never vague.

**Quality floor, unannounced:** responsive to 360px, visible keyboard focus on every
interactive element, the dump's consumed/leftover state exposed to assistive tech via
text, not colour.

---

## K.10 Degradation matrix (every row is a test)

| Capability off | What happens                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `llm`          | `extract`/`triage` take the heuristic branch, `decompose` reports `skipped`. Steps still stream, still show timings, `source: heuristic`. The UI is structurally identical — no LLM-only affordance appears. |
| `jobs`         | No daily plan, no cron. Interactive runs are unaffected (they were always inline). The dashboard says so plainly rather than showing a dead control.                                                         |
| `email`        | The daily plan still runs and still records; `notify` reports `skipped`. No throw.                                                                                                                           |
| `billing`      | `runsPerDay: null` → the cap is `RUN_HARD_CEILING_PER_DAY`. Zero billing UI, as today.                                                                                                                       |
| `analytics`    | `track("run_completed", …)` is the existing fire-and-forget no-op.                                                                                                                                           |
| `errors`       | `captureException` on every fallback is the existing no-op.                                                                                                                                                  |
| Baseline only  | `DATABASE_URL` + `BETTER_AUTH_SECRET`: paste → heuristic extraction → triaged list. Fully usable.                                                                                                            |

---

## K.11 Tests

**Pure unit (no service):**

- `packages/llm/test/stream.test.ts` — element callback order; accounting fires on
  success AND on mid-stream failure; disabled/budget errors throw before any provider
  import; `onElement` throwing does not fail the call.
- `packages/llm/test/generate.test.ts` — **unchanged**, proving the `call.ts` extraction
  is behaviour-preserving.
- `packages/jobs/test/runs-engine.test.ts` — step ordering; `abort` vs `continue`;
  `partial` status; cost accumulation; skipped steps; emitted event sequence; a step
  failure never throws out of `runPipeline`.
- `packages/jobs/test/heuristics.test.ts` — extraction offsets exact; bullets/numbering;
  caps; `locateQuote` whitespace tolerance and not-found → `null`.
- `packages/jobs/test/tasks-pipeline.test.ts` — LLM path with `streamArray` mocked;
  fallback on `isEnabled('llm') === false`; fallback on a thrown LLM error; out-of-range
  triage indices dropped rather than mis-applied.
- `packages/config/test/plans.test.ts`, `packages/billing/test/entitlement.test.ts` —
  updated for `runsPerDay`; a plan limit above the ceiling still clamps.
- `apps/web/test/sse.test.ts` — frames split across chunk boundaries, multi-frame chunks,
  trailing partial frame.
- `apps/web/test/run-reducer.test.ts` — recorded sequence; duplicate and out-of-order
  events converge to the same state.
- `apps/web/test/middleware.test.ts` — unchanged (middleware is not touched).

**Postgres integration (`TEST_DATABASE_URL`, skips cleanly when absent):**

- `packages/jobs/test/integration/runs.test.ts` — `createRun` cap under concurrency (two
  parallel creates at the limit must land exactly one); `upsertRunStep` retry updates
  rather than duplicates; `finishRun` totals; `countRunsToday` day boundary.
- `packages/jobs/test/integration/tasks.test.ts` — full capture pipeline against a real
  DB with the LLM env cleared (the existing suite's env-clearing pattern), asserting the
  heuristic path writes tasks, offsets and steps correctly; cross-user isolation on every
  mutation.

---

## K.12 Adoption surface

- **`make-it-yours` Phase 2** is rewritten from _Demo removal_ to **_Rename the domain_**:
  keep `packages/jobs/src/runs/`, `packages/db/src/schema/run.ts`, the SSE route and the
  run history; rename `tasks/` and `packages/db/src/schema/task.ts` to your own noun. The
  deletion recipe survives as a smaller "if you don't want a run engine at all" note.
- **`LAUNCH.md`** — the `Demo logic` item is reworded to match ("the Untangle domain is
  renamed to the product's own, or deliberately kept"), and `Email templates` names
  `daily-plan` instead of `change-digest`.
- **`PRODUCT.md`** — placeholder prose updated to describe Untangle, still explicitly
  labelled as the template's placeholder.
- **`README.md`** — the demo paragraph and the "what's in the box" demo row.
- **`features-meta.ts` / `demo-teaser.tsx` / `features/jobs` / `features/llm`** — copy that
  currently describes page monitoring.
- **ADR** — `docs/adr/0004-keepable-demo-domain.md`: why the demo stopped being disposable,
  and what that costs.

---

## K.13 Task split for parallel implementation (disjoint files)

| Task | Owner files                                                                                                                                                                                                | Wave |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| T1   | `packages/llm/src/{call,stream,generate,index}.ts`, `packages/llm/test/stream.test.ts`                                                                                                                     | 1    |
| T2   | `packages/db/src/schema/{run,task,index}.ts`, delete `monitor.ts`, `packages/db/migrations/**`                                                                                                             | 1    |
| T3   | `packages/config/src/plans.ts` + its test, `packages/billing/src/entitlement.ts` + its tests                                                                                                               | 1    |
| T4   | `packages/email/src/templates/**`, `packages/email/src/send.ts`, `packages/email/test/send.test.ts`                                                                                                        | 1    |
| T5   | `packages/jobs/src/runs/**`, `packages/jobs/test/runs-engine.test.ts`, `test/integration/runs.test.ts`                                                                                                     | 2    |
| T6   | `packages/jobs/src/tasks/**`, `packages/jobs/test/{heuristics,tasks-pipeline}.test.ts`, `test/integration/tasks.test.ts`                                                                                   | 2    |
| T7   | `packages/jobs/src/{cron/**,events.ts,functions/index.ts,index.ts,package.json}`, delete `demo/**` + its tests, `.dependency-cruiser.cjs`                                                                  | 2    |
| T8   | `apps/web/app/api/runs/route.ts`, `apps/web/lib/sse.ts`, `apps/web/app/dashboard/actions.ts`, `apps/web/test/sse.test.ts`                                                                                  | 3    |
| T9   | `apps/web/components/workspace/**`, `apps/web/app/dashboard/page.tsx`, `apps/web/app/runs/page.tsx`, `apps/web/app/globals.css`, delete `components/demo/**`, `apps/web/test/{run-reducer,format}.test.ts` | 3    |
| T10  | `.factory/handoff/**`, `PRODUCT.md`, `README.md`, `docs/adr/0004-*.md`, `apps/web/components/marketing/{features-meta,demo-teaser}.tsx`, `apps/web/app/features/{jobs,llm}/page.tsx`                       | 3    |

Cross-task imports are pinned by the contracts above. A red typecheck on another task's
not-yet-written module is expected during a wave and must not be "fixed" by inventing a
local stub.

---

## K.14 Critique corrections — BINDING

Folded 2026-08-21 from an adversarial read-only critique (verdict:
`APPROVED WITH CORRECTIONS`). Every item here **supersedes** the earlier text in this
file. Each was verified against real source, cited inline.

### M1 — `runPipeline` must rethrow on `onFailure: "abort"`

K.4.1's "`runPipeline` never throws for a step failure" is wrong and would silently
disable the durable driver: Inngest retries a step only because the throw propagates out
of `step.run` (existing precedent: `packages/jobs/src/demo/monitor-worker.ts:26-38`
rethrows deliberately so `retries: 3` means something).

**Contract:** after recording the failed step, `onFailure: "abort"` **rethrows** the
original error; only `onFailure: "continue"` swallows it and marks the run `partial`. The
inline caller (`apps/web/app/api/runs/route.ts`) catches that throw, calls `finishRun`
with `failed`, and emits a terminal `run-finished` frame before closing the stream.
`runs-engine.test.ts` asserts both halves.

### M2 + M3 — step bookkeeping moves INSIDE the driver, and `attempt` increments once

Two defects with one fix. (a) K.4.3 annotated `upsertRunStep` as `attempt + 1` on every
conflict, but the engine calls it twice per step (start, then finish), so a step that
never retried records `attempt = 2`. (b) K.4.1 placed `upsertRunStep`/`emit` _outside_
`driver(key, …)`; Inngest replays the whole function body on every retry, returning
memoized `step.run` results while all non-step code re-executes — so the bookkeeping would
be rewritten on every replay and `attempt` would count replays, not retries.

**Contract:** the driver wraps the whole unit.

```ts
await driver(step.key, async () => {
  const { attempt } = await upsertRunStep({ …, status: "running" });  // attempt + 1 HERE only
  emit({ type: "step", status: "running", attempt, … });
  try {
    const result = await step.run(state, ctx);
    await finishRunStep({ …, status: result.skipped ? "skipped" : "succeeded" }); // plain UPDATE
    return result;
  } catch (err) {
    await finishRunStep({ …, status: "failed", error: message });                 // plain UPDATE
    throw err;
  }
});
```

`upsertRunStep` (`INSERT … ON CONFLICT (run_id, key) DO UPDATE SET attempt = attempt + 1,
status = 'running', started_at = now(), error = null`) is the ONLY writer of `attempt`.
`finishRunStep` is a plain `UPDATE … WHERE run_id = $1 AND key = $2` that never touches
`attempt`. Note the consequence: under the durable driver, everything inside the closure
is memoized with the step, so `emit` is genuinely a no-op there — as K.4.1 already said.

### M4 — `streamArray` returns the elements it delivered, never `result.output`

`ai@7.0.68` `dist/index.js:3653-3670`: `Output.array`'s `parseCompleteOutput` throws
`NoObjectGeneratedError` if **any** element fails validation, while `parsePartialOutput`
(`3672-3697`) silently skips invalid elements and, on a `repaired-parse`, drops the
trailing one. The two legitimately disagree — so `await result.output` can throw _after_
`onElement` already fired and, per K.5.2, after task rows were inserted and streamed to
the browser.

**Contract:** `streamArray` accumulates elements from `elementStream` as it drains and
resolves `GenerateResult.output` with **that** array. `result.output` is never awaited.
Usage and cost still come from `result.usage` / `result.providerMetadata`, which resolve
in the base transform's flush and are unaffected. Consequence to document in the JSDoc: a
malformed trailing element is dropped rather than failing the call — the honest trade for
never orphaning a row we already committed. `stream.test.ts` covers exactly this case.

### M5 — every streaming step pins `maxOutputTokens` explicitly

`packages/llm/src/generate.ts:103-110`: setting `maxCostCents` without `maxOutputTokens`
silently enforces a 1024-token cap. Extracting up to `MAX_TASKS_PER_RUN = 30` elements
would truncate, and truncation both drops the trailing element (M4) and would have thrown
on `result.output`. K.5.2's steps therefore pass an explicit, cap-derived value:
`extract` 2048, `triage` 2048, `decompose` 1536, `focus` 512. Both `maxCostCents` and
`maxOutputTokens` are always passed together in this repo — never one alone.

### M6 — cost columns are `numeric(14, 6)`, not `doublePrecision`

Applied inline in K.2.1. Precedent: `packages/db/src/schema/llm-call.ts:23`.

### M7 — `runs` has no `capture_id`

Applied inline in K.2.1. `run.ts` must not import `task.ts`, or the domain-agnostic half
of the schema would depend on the renameable half — the exact promise K.1.3 makes. The
association is one-way via `tasks.run_id` / `tasks.capture_id`. `runs.kind` plus that FK
is enough for every read the UI performs.

### M8 — the plan cap applies to user-initiated runs only; cron idempotency is Inngest's

Two defects. (a) `createRun` enforcing `runsPerDay` for _every_ kind means a free user who
spent their 5 interactive runs gets `422 run_limit_reached` on their own scheduled digest,
and the worker then burns all 3 retries failing. (b) the `countRunsToday(userId,
"daily-plan") > 0 → skip` guard makes retry attempt 2 skip instead of resume, silently
cancelling `retries: 3`.

**Contract:** `createRun` takes `enforceLimit: boolean`; only `kind: "capture"` passes
`true`. `RUN_HARD_CEILING_PER_DAY` still applies to every kind — an abuse floor is not a
plan restriction. The daily-plan worker drops the `countRunsToday` guard entirely and
wraps run creation in `step.run("create-run", …)`, which Inngest already memoizes across
retries. Same-day double-delivery is prevented by the cron firing once per day, not by a
read-then-write check that races itself.

### M9 — `countRunsToday`'s day boundary

`started_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`. The
form in K.4.3 compared a `timestamptz` against a `timestamp without time zone`, which
Postgres resolves using the _server's_ `TimeZone`, silently moving the boundary off UTC.

### M10 — `packages/observability` gains `export type { Span }`

`packages/llm` cannot name `Span` today: `packages/observability/src/index.ts:3-8`
exports only `captureException`, `captureMessage`, `tracer`, `SpanStatusCode`, and
importing `@opentelemetry/api` from `packages/llm` violates
`otel-api-only-in-observability` (`.dependency-cruiser.cjs:333-346`) — which
`tsPreCompilationDeps: true` (`.dependency-cruiser.cjs:501`) enforces even for a
type-only import. Add `export type { Span } from "@opentelemetry/api";` to
`packages/observability/src/index.ts`, the same re-export precedent already documented
there for `SpanStatusCode`. **Owner: T1** (the file is otherwise untouched this
milestone).

### M11 + M12 — file ownership gaps in K.13

Three files break `pnpm check` with no owner, and one token ships unused. Assignments:

| File                                                                                                                                                                     | Task    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `apps/web/components/billing/billing-card.tsx` (`entitlement.monitorLimit`, `monitorCount` prop, lines 14/25/56/58/61/77)                                                | **T9**  |
| `packages/email/test/templates.test.ts` (`TEMPLATES["change-digest"]`, lines 11/44-61)                                                                                   | **T4**  |
| `packages/jobs/test/functions.test.ts` (imports `demo/*` + `MONITOR_CHECK_EVENT`, and is the ONLY home of the `chunk` tests, lines 67-85 — carry them over with `chunk`) | **T7**  |
| `packages/observability/src/index.ts` (M10)                                                                                                                              | **T1**  |
| The five `text-amber-600` sites: `apps/web/app/page.tsx`, `components/marketing/{quickstart-strip,hero,env-table,feature-card}.tsx`                                      | **T10** |

K.6's claim that `chunk` is "already pure and unit-tested" only stays true if T7 carries
those cases across with the function.

### R1 — element schemas use `.nullable()`, never `.optional()`

`Output.array` builds its wrapper with `additionalProperties: false` and spreads the
element's JSON schema verbatim (`ai/dist/index.js:3603-3625`); providers in strict
structured-output modes reject properties absent from `required`. `sourceQuote` becomes
`z.string().max(300).nullable()`. Applies to every element schema in `tasks/prompts.ts`.

### R2 — honest wording on interrupted runs, and a wider stale window

K.8.1 step 5's "the DB never ends mid-write" overclaims — nothing guarantees a serverless
runtime keeps executing after the response stream is cancelled. The true statement: every
step commits independently, so an interrupted run leaves a truthful partial record that
`isStaleRun` renders as `interrupted`. `RUN_STALE_AFTER_MS` rises to **10 minutes**: three
LLM calls at `generate`'s default `timeoutMs: 60_000` (`generate.ts:145`) plus overhead
sits too close to 5.

### R3 — `call.ts` import constraint

`packages/llm/test/generate.test.ts:13-21` mocks `../src/profile` and `../src/record` **by
module path**. `call.ts` must therefore import `resolveLanguageModel` from `./profile` and
`recordLlmCall` from `./record` directly — never through a re-export — or "generate.test.ts
passes unchanged" stops being a real guard.

### R4 — T3 file list widened

Add `packages/billing/test/webhook.test.ts`, `packages/billing/test/contract.test.ts`, and
`packages/billing/src/index.ts` (line 5 re-exports the renamed type surface).

### R5 — T10 file list widened

Live docs that describe the monitor demo and must be updated, not left lying:
`docs/guides/graceful-degradation.md`, `docs/guides/llm-evals.md`,
`docs/templates/PRODUCT.md`, `.claude/skills/add-a-job/SKILL.md`, and
`apps/web/app/features/{billing,auth,observability}/page.tsx` (the latter two embed
monitor code snippets at `features/billing/page.tsx:42,67,78-79` and
`features/auth/page.tsx:57-65,96`). The archival milestone plans `m6-jobs-demo.md` /
`m7-billing.md` are deliberately NOT updated — they are a record of what was built then.

**Addendum (found during Wave 1 verification, also T10):** two handoff skills name the
retired field directly — `.factory/handoff/skills/define-product/SKILL.md:32` and
`.factory/handoff/skills/enable-billing/SKILL.md:29` both instruct the adopter to keep
`monitorLimit` in sync. Both must name `runsPerDay`. These are promoted verbatim into
every fresh clone by `runFactoryInit`, so a stale field name here ships to every adopter.

### R6 — the `packages/jobs/src/index.ts` barrel

T7 owns the file, but T5 and T6 write the modules it re-exports in the same wave. The
exact export list is pinned identically in all three implementation prompts; T7 writes it
verbatim rather than deriving it.

### Nits folded

- `export type Priority = "now" | "next" | "later";` lives in `tasks/constants.ts` and is
  re-exported from `packages/jobs/src/index.ts`.
- `RunDetail = RunListItem & { steps: RunStepRow[] }`, defined in `runs/queries.ts`.
- `finishRun`'s `error` argument carries the aborting step's error message (M1's rethrow
  path), and is `null` on every other outcome.
- `apps/web/test/format.test.ts` is part of K.11's pure-unit inventory.
- `AnyPgColumn` is imported from `drizzle-orm/pg-core`.
- K.2.3's reviewer checklist reads: **four `CREATE TABLE`, two `DROP TABLE`, nothing
  else.**

---

## K.15 Scope addendum — the public surface (landing redesign + component docs)

Added 2026-08-21, after Wave 1 landed, on an explicit product decision. This section is
additive: nothing in K.0-K.14 changes. It expands Wave 3 and introduces the milestone's
**first new public routes**, which makes `fab-bastion` review mandatory for this section
specifically, not just for the guarded zones named in K.0.

### K.15.0 Decisions taken

1. **The hero demo is a scripted replay**, not a live run. A recorded `RunEvent` sequence
   replayed client-side, labelled honestly as a recording in visible copy. No server call,
   no cost, no abuse surface, and it cannot break on a deployment with no keys.
2. **Component documentation lives in-app**, replacing the current `/features/*` guided
   tour with real per-primitive docs that show working examples.
3. **Live means live-and-free.** An example is only wired to the real deployment when it
   costs nothing, needs no account, and makes no outbound request on user input.
   Everything else is a replay or a rendered artifact. This rule is absolute — see
   K.15.3.

### K.15.1 Landing page (`apps/web/app/page.tsx` + `components/marketing/**`)

The page's job: convince a developer evaluating a template, in one screen, that the
machinery is real. The demo product is the _evidence_, not the pitch.

Section order, each carrying information rather than decorating:

1. **Header** — unchanged structurally.
2. **Hero.** Copy sells the template; the replay proves it. Left: eyebrow, H1, subhead,
   two CTAs. Right: the recorded run — serif dump on cool paper, source spans dimming as
   task cards arrive, run strip beneath showing step / model / tokens / cost / ms. Plays
   once on first view; a `Replay` control repeats it. Under
   `prefers-reduced-motion: reduce` it renders the **final** state immediately with no
   animation, and the replay control still works. A small mono caption reads
   `recorded run — try it yourself after signup`. That caption is not optional: an
   unlabelled fake demo is the one thing that would cost this repo the credibility the
   whole page exists to build.
3. **The kernel, in code.** The landing page currently shows **no code at all** — the
   single most convincing artifact for this audience is buried in the README. Show the
   illegal raw handler next to the legal `defineHandler`, with the "this does not lint,
   does not merge" annotation. Source is excerpted from the real file, not retyped.
4. **Control panel** (existing `ControlPanel` + `StatusLight`) — kept as-is. Capability
   lights read from this deployment's own runtime; that is genuinely unusual and already
   works.
5. **Degradation, side by side.** The same recorded run twice: with an LLM key and
   without. Same steps, same timings, same layout — one says `source: llm`, the other
   `source: heuristic`. This is the template's central claim, demonstrated rather than
   asserted, and it is the section a skeptical reader will remember.
6. **Feature grid** — unchanged component, repointed at the reworked docs pages.
7. **The honest parts** — kept; the "not in v1" list is updated.
8. **Footer** — unchanged.

Design follows K.9 exactly: three type voices, chroma reserved for work in flight and
drained on completion, priority carried by ink density. The landing page and the
workspace must read as one product; the tokens are shared, defined once in `globals.css`
by T9.

### K.15.2 Component docs (`apps/web/app/features/**`)

Each page answers four questions in this order, and no page invents a fifth:

1. **What it does** — one sentence, from the caller's side.
2. **The rule it enforces** — why it exists at all, i.e. what it makes impossible.
3. **Real source** — an excerpt from the actual repo file, with a copy control and the
   file path shown. Never retyped prose-code that can drift from the file it quotes.
4. **A working example** — live where K.15.3 permits, otherwise a replay or a rendered
   artifact, always labelled as such.

### K.15.3 The live-example safety table — BINDING

| Page            | Example                                                                         | Live?    | Why                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `kernel`        | Public echo endpoint returning its own auth / validation / rate-limit decisions | **Live** | Costs nothing, needs no account, makes no outbound call. Demonstrates the 400 and the 429 by actually producing them.  |
| `config`        | This deployment's real capability map                                           | **Live** | Already exists (`getClientConfig`); booleans only, never adapter identities.                                           |
| `llm`           | Recorded `streamArray` replay                                                   | Replay   | A live call spends money on anonymous traffic and is dead on a keyless clone.                                          |
| `jobs`          | Recorded run replay + real pipeline source                                      | Replay   | A live run would write rows for an anonymous visitor.                                                                  |
| `security`      | `isBlockedAddress(host)` evaluated on user input                                | **Live** | Pure function, **DNS-free, no fetch is ever performed**. Shows the metadata-range and private-range refusals for real. |
| `email`         | Server-rendered template preview (the console transport's own output)           | **Live** | Renders only; sends nothing.                                                                                           |
| `billing`       | Capability state + source                                                       | Static   | Nothing safe to run anonymously.                                                                                       |
| `observability` | Capability state + source                                                       | Static   | Same.                                                                                                                  |

**Non-negotiable constraints on every new public route in this section:**

- Declared `defineHandler({ auth: "public", rateLimit: { … } })` — never `"none"`.
- **No outbound request on user-supplied input.** The `security` page evaluates
  `isBlockedAddress` on a hostname and stops there; it must not call `safeFetch`.
- No user-controlled data is persisted. These endpoints are read-only by construction.
- Input is capped and echoed back bounded — no unbounded reflection.
- Every one is listed for `fab-bastion` review by path.

### K.15.4 Middleware

The reworked docs pages keep the existing `/features` + `/features/` allowlist entries,
so **`apps/web/middleware.ts` needs no change** and stays untouched (K.0). Any new public
API route added for K.15.3 lives under `/api/…`, which the matcher already covers, and
therefore **does** need an exact-match allowlist entry. `middleware.ts` is a guarded
zone: add only the exact entries required, nothing else, and follow the existing file's
own reasoning about exact-vs-prefix matching — a prefix entry here would repeat the
same-prefix-sibling bug that file already documents and guards against.

_(This supersedes K.0's "`middleware.ts` is not touched" to the extent that K.15.3's
public routes require allowlist entries — and only to that extent.)_

### K.15.5 Adoption-surface cost — stated honestly

This section grows what an adopter must delete. `make-it-yours`' `Template showcase`
phase (and `LAUNCH.md`'s matching item) must be updated to name every new file, including
the recorded-run fixtures and any public demo endpoint. A showcase that is easy to build
and hard to remove is a tax on every adopter, so the removal recipe is part of this
section's definition of done, not a follow-up.

### K.15.6 Task split addendum

| Task    | Owner files                                                                                                                                                                                                         | Wave |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **T11** | `apps/web/app/page.tsx`, `components/marketing/{hero,demo-teaser,kernel-code,degradation-strip}.tsx`, the recorded-run fixture module, `features-meta.ts`                                                           | 3    |
| **T12** | `apps/web/app/features/**` (all pages + index), `components/marketing/{feature-page-shell,env-table}.tsx`, any new public route under `apps/web/app/api/demo/**`, `apps/web/middleware.ts` (allowlist entries only) | 3    |

T9 (workspace UI) owns `globals.css` and therefore the shared tokens; T11 and T12 consume
them and must not define their own. The recorded-run fixture is authored once by T11 and
imported by T12's `llm`/`jobs` pages — T11 owns the file, T12 imports it.

### K.15.7 Wave 3 ownership — collision resolution (BINDING)

K.13 and K.15.6 both claimed `features-meta.ts`, `apps/web/app/page.tsx`, and the five
`text-amber-600` sites. Two owners for one file in one wave is exactly what the disjoint-
file rule exists to prevent. Authoritative split, superseding both:

- **T10 — documentation and adoption surface ONLY. Touches no file under `apps/web/`.**
  `.factory/handoff/**` (LAUNCH.md, make-it-yours, define-product, enable-billing),
  `PRODUCT.md`, `README.md`, `docs/adr/0004-*.md`, `docs/guides/graceful-degradation.md`,
  `docs/guides/llm-evals.md`, `docs/templates/PRODUCT.md`, `.claude/skills/add-a-job/SKILL.md`.
- **T11 — the landing page.** `apps/web/app/page.tsx`, `components/marketing/{hero,
demo-teaser,features-meta,quickstart-strip,feature-card}.tsx`, the new `kernel-code`
  and `degradation-strip` components, and the recorded-run fixture module.
- **T12 — the docs pages.** `apps/web/app/features/**`, `components/marketing/{feature-
page-shell,env-table}.tsx`, any public route under `apps/web/app/api/demo/**`,
  `apps/web/middleware.ts` (allowlist entries only).

The `--fab-marker` tokenization of the five raw `text-amber-600` sites therefore belongs
to **T11** (`page.tsx`, `hero`, `quickstart-strip`, `feature-card`) and **T12**
(`env-table`) — not T10, which owns no UI. This supersedes K.14 M12's assignment.

T10 writes `make-it-yours`' showcase-removal recipe in terms of **directories and
components** (`apps/web/app/features/`, the marketing components it names), not
individual new filenames, so it stays correct regardless of how T11/T12 name their files.

---

## K.16 K.15 critique corrections — BINDING

Folded 2026-08-21 (verdict `APPROVED WITH CORRECTIONS`). Supersedes K.15 wherever they
disagree. Each verified against real source.

**Stale finding, deliberately NOT actioned:** the critique's closing note claims the
`--fab-*` tokens are absent from `.dark` and from `@theme inline`. They are present
(`apps/web/app/globals.css` — `.dark` block and the `@theme inline` `--color-fab-*`
mappings). The critic read the file while T9 was mid-write. Do not "fix" it.

### N1 — the `security` page teaches the WRONG mechanism, and would state a falsehood

`packages/core/src/safe-fetch.ts:102-114`: `isBlockedAddress(address)` takes an **IP
literal**. It `net.isIPv4`/`net.isIPv6`-checks the input and returns `true` (blocked,
fail-closed) for anything that parses as neither — so `example.com` renders as
**BLOCKED**. A page inviting a hostname would teach visitors something false about their
own guard.

Worse, K.15.3 presented this as _the_ SSRF defense. It is not: the real one is
`createValidatingConnector` (`safe-fetch.ts:122-142`), which validates
`socket.remoteAddress` **after connect**, which is what defeats DNS-rebinding TOCTOU.

**Correction:** the input is labelled **IP address**, pre-seeded with literals
(`169.254.169.254`, `10.0.0.1`, `127.0.0.1`, `::ffff:169.254.169.254`, `8.8.8.8`), and
the page's stated teaching point is the post-connect check, with `isBlockedAddress` shown
as the pure, table-testable predicate it actually is. The "DNS-free, no fetch performed"
claim stays — it is true, and it is why this row is safe to expose.

### N2 — the `email` row drops to **Static**

`packages/email/src/index.ts` exports only `send` + types — no render/preview function —
and `apps/web/package.json` has no `@factory/email` dependency at all. Building the
preview would require a new export, a new workspace dep, and a lockfile change, none of
them in T12's list; reaching for `@react-email/render` from `apps/web` directly would
breach vendor confinement.

**Correction:** the `email` page shows the template **source** plus the `SUBJECTS` map,
Static. (A `renderTemplate` export in `packages/email` would upgrade this later; that is
a separate, deliberate change, not something to smuggle into this milestone.)

### N3 — "read-only by construction" is false, and the anonymous bucket needs hardening

`checkRateLimit` **writes** `rate_limits` on every call, keyed `${name}:${subject}` with
the anonymous subject `ip:${getClientIp(...)}` (`define-handler.ts:179`).
`getClientIp` (`packages/core/src/get-client-ip.ts`) returns the first `x-forwarded-for`
entry **unvalidated and uncapped**, and `rate_limits.key` is unbounded `text` inside the
primary key (`packages/db/src/schema/rate-limit.ts:13,17`). Behind a
non-normalizing proxy an anonymous visitor mints a fresh bucket per request: the limit is
bypassed _and_ rows accumulate (pruning only sweeps >24h windows). `checkRateLimit` also
**fails open** on a DB error, by design.

**Corrections:**

1. Strike K.15.3's "No user-controlled data is persisted / read-only by construction"
   sentence and K.15.0.1's "no abuse surface" — both overclaim.
2. **Harden `getClientIp`** (assigned to T12): validate the extracted value with
   `net.isIP()` and fall back to `"unknown"` when it is not a valid IP; cap length first.
   This makes the function match **its own documented intent** — its header comment
   already says spoofed traffic should "collapse into one shared `ip:unknown` bucket,
   consciously". Today a spoofed non-IP gets its own private bucket instead, which is the
   opposite. `packages/core` is a **guarded zone**: this exact change and nothing else,
   its existing test updated, and flagged to `fab-bastion` by name.
3. The demo pages state plainly that the rate limit is abuse mitigation which fails open,
   not a security guarantee.

### N4 — the feature key set is frozen here (T11 and T12 both read this)

`features-meta.ts:13` currently declares six keys; K.15.3 implied nine and silently
dropped `auth`. Frozen set, nine entries, in grid order:

`auth`, `kernel`, `config`, `llm`, `jobs`, `security`, `email`, `billing`, `observability`

`kernel`, `config`, `security` and `auth` carry `services: []` (they map to no
`ServiceName`, exactly as `auth` does today). `apps/web/app/features/auth/page.tsx`
**stays** and is updated, not deleted.

### N5 — the recorded fixture is typed against the real `RunEvent`

`export const RECORDED_RUN: readonly RunEvent[] = [...]`, importing `RunEvent` from
`@factory/jobs`. Drift then becomes a compile error instead of a silently stale replay —
which is the whole point of K.15.0.1's honesty rule.

### N6 — new marketing component filenames are frozen NOW, so T10's keep-list can name them

`make-it-yours/SKILL.md`'s Phase 3 enumerates marketing components to keep **by name**,
so new showcase-only files must be nameable before T10 finishes. Frozen:

- **T11:** `components/marketing/kernel-code.tsx`, `components/marketing/degradation-strip.tsx`,
  `components/marketing/recorded-run.ts`
- **T12:** `components/marketing/live-example.tsx`

All four are **showcase-only** and belong on the delete side of `Template showcase`. The
orchestrator reconciles `make-it-yours` Phase 3 against this list once T11/T12 land.

### R-items folded

- **R1:** K.15.4 verified correct — `/features` (exact) and `/features/` (prefix) already
  exist, so the docs pages need no middleware change; new `/api/demo/*` routes need
  **exact** entries. Add the standing caveat: middleware only suppresses the `/login`
  redirect; the real boundary is each route's own `auth` mode.
- **R2:** every new component carries the repo's `fab-*` watermark class
  (`fab-shell`, `fab-hero`, `fab-teaser`, `fab-code`, … are systematic). New:
  `fab-kernel`, `fab-degradation`, `fab-live-example`.
- **R3:** the kernel page documents the origin asymmetry it demonstrates —
  `define-handler.ts:201-204` applies the origin check to state-changing methods only, and
  `isOriginAllowed` (297-305) permits a missing `Origin` while rejecting
  `sec-fetch-site: cross-site`. A copyable `curl` therefore works where a cross-origin
  browser call is refused. Show it; don't let it look like a bug.
- **R4:** both degradation fixtures derive from **one** source array, so "same steps, same
  timings" cannot drift.
- **Nits:** `env-table.tsx` must render env var **names and set/unset state only, never
  values** (T12 verifies). Source excerpts are imported from the real module where
  possible; where quoted, the file path is shown next to the quote.
