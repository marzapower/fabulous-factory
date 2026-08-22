import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@factory/db";
import { inngest } from "@factory/jobs";

import * as schema from "../schema";
import { DAILY_PLAN_EVENT } from "../events";
import { durableDriver } from "../runs/drivers";
import { runPipeline } from "../runs/engine";
import { createRun, finishRun } from "../runs/queries";
import { dailyPlanPipeline, type DailyPlanState } from "../tasks/daily-plan";

/**
 * Per-user daily-plan worker (plan K.6, K.14 M8). `retries: 3` — idempotency comes from
 * wrapping run creation in `step.run("create-run", …)`: Inngest memoizes that call
 * across retries, so a retried attempt resumes the SAME run row instead of creating a
 * new one or (worse) skipping outright. There is deliberately no
 * `countRunsToday(userId, "daily-plan") > 0 → skip` guard — that reads as idempotency
 * but actually cancels `retries: 3`, because attempt 2 would skip instead of resume
 * (K.14 M8b). Same-day double-delivery is prevented by the cron firing once per day, not
 * by a read-then-write check that races itself.
 *
 * `enforceLimit: false` (K.14 M8a): this is the user's OWN scheduled digest, not an
 * interactive action they chose to spend quota on — a free user who already spent their
 * 5 interactive runs today must never have their daily-plan email 422 out from under
 * them. `RUN_HARD_CEILING_PER_DAY` still applies inside `createRun` regardless — that
 * abuse floor is not a plan restriction.
 */
export const dailyPlanWorker = inngest.createFunction(
  {
    id: "daily-plan-worker",
    triggers: [{ event: DAILY_PLAN_EVENT }],
    retries: 3,
    // Fail-open by design (own try/catch, never throws — modeled on
    // `demo/record-error.ts`'s stance): `onFailure` runs after Inngest has already given
    // up on the run, so a failure HERE must not become an unhandled rejection or a
    // second retry cycle — it can only be logged. There is no step tool in `onFailure`
    // (`FailureEventArgs` carries only `event`/`error`), so the memoized "create-run"
    // step result isn't reachable here — the run row is instead looked up directly:
    // the most recent still-`running` "daily-plan" run for this user.
    onFailure: async ({ event, error }) => {
      const userId = event.data.event.data.userId as string;
      try {
        const [row] = await getDb()
          .select({ id: schema.runs.id })
          .from(schema.runs)
          .where(
            and(
              eq(schema.runs.userId, userId),
              eq(schema.runs.kind, "daily-plan"),
              eq(schema.runs.status, "running"),
            ),
          )
          .orderBy(desc(schema.runs.startedAt))
          .limit(1);
        if (row) {
          await finishRun(row.id, "failed", null, error.message);
        }
      } catch (err) {
        console.error("[@factory/untangle] daily-plan onFailure failed:", err);
      }
    },
  },
  async ({ event, step }) => {
    const { userId } = event.data;

    const { id: runId, todayIso } = await step.run("create-run", async () => {
      const created = await createRun({
        userId,
        kind: "daily-plan",
        driver: "durable",
        runsPerDay: null,
        enforceLimit: false,
      });
      // `todayIso` is computed INSIDE the memoized step on purpose (K.1.8). Anything
      // outside a step re-executes on every replay, so a retry that crossed midnight UTC
      // would plan a different day than the attempt it is resuming — the run row would
      // say one date and the email another. Memoized alongside the run id, both stay
      // fixed for the life of this run.
      return { id: created.id, todayIso: new Date().toISOString().slice(0, 10) };
    });

    // The user is carried on the run context (`ctx.userId`), not in pipeline state —
    // `DailyPlanState` is the pipeline's own working set and nothing more.
    const seed: DailyPlanState = { todayIso, tasks: [], focused: [] };

    return runPipeline({
      runId,
      userId,
      steps: dailyPlanPipeline,
      seed,
      // Inngest's real `step.run` returns `Promise<Jsonify<Awaited<T>>>`, not
      // `Promise<T>` — a deliberate JSON round-trip that's structurally incompatible
      // with `durableDriver`'s generic `run: <T>(...) => Promise<T>` for arbitrary T,
      // even though it's exactly what happens at runtime. Every `RunStepResult.state`
      // in this pipeline is already required to be JSON-safe (`runs/engine.ts`'s
      // `RunStepResult` doc comment), so the cast reflects a real invariant, not an
      // unsound one.
      driver: durableDriver(step as unknown as Parameters<typeof durableDriver>[0]),
      // No-op under the durable driver — every step is memoized inside `step.run` by
      // `runPipeline`'s own bookkeeping (K.14 M2/M3), so there is no live transport on
      // this path to push events toward.
      emit: () => {},
    });
  },
);
