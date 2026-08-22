import { finishRun, finishRunStep, upsertRunStep } from "./queries";

/**
 * The run engine — a small, domain-agnostic pipeline runner. Nothing in this file (or
 * anywhere else under `runs/`) knows what a "run" is FOR: it just executes an ordered
 * list of named steps against some caller-supplied state, records what happened, streams
 * events as it goes, and lets a caller-supplied driver decide HOW each step actually
 * executes (in-process, or wrapped in a durable, retriable unit of work).
 *
 * Read this file as if you are building a completely different pipeline on top of it —
 * a report generator, an onboarding checklist, a data import. That's the intent: a
 * concrete pipeline lives elsewhere, wires up its own step list and its own state shape,
 * and calls `runPipeline`. This file should never need to change to support it.
 */

/** Terminal (or in-flight) status of an entire run. */
export type RunStatus = "running" | "succeeded" | "partial" | "failed";

/** Status of a single step within a run. */
export type StepStatus = "running" | "succeeded" | "failed" | "skipped";

/** How a step's work actually got done — purely descriptive, the engine never branches
 * on this itself. A step reports it; the UI displays it. */
export type StepSource = "llm" | "heuristic" | "none";

export interface RunStepContext {
  runId: string;
  userId: string;
  /** Push an event toward whatever transport the caller is using (e.g. an SSE stream).
   * Under the durable driver this is a genuine no-op on replay — see the driver-closure
   * note on `runPipeline` below for why that's safe. */
  emit: (event: RunEvent) => void;
  signal?: AbortSignal;
}

export interface RunStepResult<TState> {
  /** The pipeline's new state after this step. MUST be JSON-safe — no `Date`, no class
   * instances, nothing that would silently change shape crossing a durable-driver retry
   * boundary. Encode dates as ISO strings. */
  state: TState;
  source: StepSource;
  /** The step deliberately did nothing (e.g. "nothing needed this step's work this
   * time"). Not a failure — the run keeps its non-`'failed'` status. */
  skipped?: boolean;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costCents?: number | null;
}

export interface RunStep<TState> {
  /** Stable identifier for this step within its pipeline — the durable driver keys its
   * retry/replay memoization on this, and it is the unique key `run_steps` upserts on.
   * Never rename a step once it has shipped. */
  key: string;
  /** Human-facing label for this step, carried on every `RunEvent` for that step. */
  label: string;
  /** What happens when this step's `run` throws. `'abort'` stops the pipeline and
   * rethrows out of `runPipeline`, ending the run `'failed'`. `'continue'` records the
   * failure and moves on to the next step, ending the run `'partial'` (unless a later
   * step also aborts). */
  onFailure: "abort" | "continue";
  run: (state: TState, ctx: RunStepContext) => Promise<RunStepResult<TState>>;
}

/**
 * Wraps the execution of ONE step. `runPipeline` never calls a step's `run` directly —
 * it always goes through the driver, so a durable driver gets a chance to make the whole
 * unit (bookkeeping included, see `runPipeline`'s doc comment) replay-safe.
 */
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
  // Domain-owned payload — the engine never inspects or produces this itself, a step's
  // `run` emits it via `ctx.emit` for whatever the caller wants to stream to the client.
  | { type: "data"; payload: unknown }
  | { type: "run-finished"; runId: string; status: RunStatus; totalCostCents: number | null };

export interface RunSummary<TState> {
  status: RunStatus;
  state: TState;
  totalCostCents: number | null;
}

/**
 * Executes `steps` in order against `seed`, driving each one through `driver`.
 *
 * Per step: `upsertRunStep('running')` → `emit('step' running)` → the step's own `run` →
 * on success, `finishRunStep('succeeded' | 'skipped')` + `emit`, and its cost (if any) is
 * added to the run total; on throw, `finishRunStep('failed', error)` + `emit`, then the
 * step's `onFailure` decides whether the pipeline stops (rethrowing, `'abort'`) or moves
 * on (`'continue'`, run ends `'partial'`).
 *
 * ALL of that per-step bookkeeping runs INSIDE the `driver(key, …)` call, as one closure
 * — not around it. This matters specifically for the durable driver: a durable step
 * runtime replays the enclosing function body on every retry, returning a memoized
 * result for any step it already completed while re-executing everything else. If the
 * bookkeeping lived outside the driver call, it would re-run — and re-write `attempt` —
 * on every replay, not just on a genuine retry. Keeping it inside means the bookkeeping
 * is memoized right along with the step: it runs exactly once per real attempt, and
 * `emit` genuinely becomes a no-op on a replayed (memoized) step, which is exactly what
 * you want — the caller already saw those events the first time.
 *
 * `runPipeline` rethrows exactly once: when a step whose `onFailure` is `'abort'` fails.
 * Rethrowing is what lets a durable step runtime's own step-level retry mean anything —
 * the throw has to actually escape the wrapped unit for a retriable failure to look like
 * one. Every other step failure (`onFailure: 'continue'`) is recorded and swallowed
 * here; the run finishes `'partial'` and the summary carries the verdict instead.
 */
export async function runPipeline<TState>(opts: {
  runId: string;
  userId: string;
  steps: ReadonlyArray<RunStep<TState>>;
  seed: TState;
  driver: RunDriver;
  emit: (event: RunEvent) => void;
  signal?: AbortSignal;
}): Promise<RunSummary<TState>> {
  const { runId, userId, steps, driver, emit, signal } = opts;
  let state = opts.seed;
  let status: RunStatus = "succeeded";
  let totalCostCents: number | null = null;

  emit({ type: "run-started", runId });

  for (let ordinal = 0; ordinal < steps.length; ordinal += 1) {
    const step = steps[ordinal]!;
    const ctx: RunStepContext = { runId, userId, emit, signal };

    try {
      const result = await driver(step.key, async () => {
        const startedAt = Date.now();
        const { attempt } = await upsertRunStep({
          runId,
          key: step.key,
          ordinal,
          status: "running",
        });
        emit({
          type: "step",
          key: step.key,
          label: step.label,
          ordinal,
          status: "running",
          attempt,
        });

        try {
          const stepResult = await step.run(state, ctx);
          const finalStatus: StepStatus = stepResult.skipped ? "skipped" : "succeeded";
          const durationMs = Date.now() - startedAt;
          await finishRunStep({
            runId,
            key: step.key,
            status: finalStatus,
            source: stepResult.source,
            model: stepResult.model ?? null,
            inputTokens: stepResult.inputTokens ?? null,
            outputTokens: stepResult.outputTokens ?? null,
            costCents: stepResult.costCents ?? null,
            durationMs,
          });
          emit({
            type: "step",
            key: step.key,
            label: step.label,
            ordinal,
            status: finalStatus,
            attempt,
            source: stepResult.source,
            model: stepResult.model ?? null,
            costCents: stepResult.costCents ?? null,
            durationMs,
          });
          return stepResult;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const durationMs = Date.now() - startedAt;
          await finishRunStep({
            runId,
            key: step.key,
            status: "failed",
            error: message,
            durationMs,
          });
          emit({
            type: "step",
            key: step.key,
            label: step.label,
            ordinal,
            status: "failed",
            attempt,
            durationMs,
          });
          throw err;
        }
      });

      state = result.state;
      if (typeof result.costCents === "number") {
        totalCostCents = (totalCostCents ?? 0) + result.costCents;
      }
    } catch (err) {
      if (step.onFailure === "abort") {
        const message = err instanceof Error ? err.message : String(err);
        status = "failed";
        await finishRun(runId, status, totalCostCents, message);
        emit({ type: "run-finished", runId, status, totalCostCents });
        throw err;
      }
      status = "partial";
    }
  }

  // Reaching this point means every step either succeeded or failed with `onFailure:
  // 'continue'` — the `'abort'` path above already returned by throwing, so `status` is
  // never `'failed'` here.
  await finishRun(runId, status, totalCostCents, null);
  emit({ type: "run-finished", runId, status, totalCostCents });
  return { status, state, totalCostCents };
}
