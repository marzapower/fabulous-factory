import { beforeEach, describe, expect, it, vi } from "vitest";

// `engine.ts` calls `upsertRunStep`/`finishRunStep`/`finishRun` from `./queries`, which in
// turn touches `@factory/db`. None of that matters to the engine's own control-flow
// contract, so `./queries` is stubbed directly — the same "stub the module boundary, not
// the vendor" pattern `check-monitor.test.ts` uses for `@factory/core`.
const attempts = vi.hoisted(() => new Map<string, number>());
const upsertCalls = vi.hoisted(() => [] as Array<{ key: string; status: string }>);
const finishStepCalls = vi.hoisted(
  () => [] as Array<{ key: string; status: string; error?: string | null }>,
);
const finishRunCalls = vi.hoisted(
  () => [] as Array<{ status: string; totalCostCents: number | null; error: string | null }>,
);

vi.mock("../src/runs/queries", () => ({
  upsertRunStep: vi.fn(async (input: { key: string; status: string }) => {
    const next = (attempts.get(input.key) ?? 0) + 1;
    attempts.set(input.key, next);
    upsertCalls.push({ key: input.key, status: input.status });
    return { attempt: next };
  }),
  finishRunStep: vi.fn(async (input: { key: string; status: string; error?: string | null }) => {
    finishStepCalls.push({ key: input.key, status: input.status, error: input.error ?? null });
  }),
  finishRun: vi.fn(
    async (
      _runId: string,
      status: string,
      totalCostCents: number | null,
      error: string | null = null,
    ) => {
      finishRunCalls.push({ status, totalCostCents, error });
    },
  ),
}));

import { runPipeline, type RunEvent, type RunStep } from "../src/runs/engine";
import { inlineDriver } from "../src/runs/drivers";

interface State {
  log: string[];
}

function step(overrides: Partial<RunStep<State>> & { key: string }): RunStep<State> {
  return {
    label: overrides.key,
    onFailure: "continue",
    run: async (state) => ({ state, source: "none" }),
    ...overrides,
  };
}

beforeEach(() => {
  attempts.clear();
  upsertCalls.length = 0;
  finishStepCalls.length = 0;
  finishRunCalls.length = 0;
  vi.clearAllMocks();
});

describe("runPipeline — step ordering", () => {
  it("runs steps in declared order, threading state through each", async () => {
    const events: RunEvent[] = [];
    const steps: RunStep<State>[] = [
      step({
        key: "a",
        run: async (state) => ({ state: { log: [...state.log, "a"] }, source: "none" }),
      }),
      step({
        key: "b",
        run: async (state) => ({ state: { log: [...state.log, "b"] }, source: "none" }),
      }),
      step({
        key: "c",
        run: async (state) => ({ state: { log: [...state.log, "c"] }, source: "none" }),
      }),
    ];

    const summary = await runPipeline({
      runId: "run-1",
      userId: "user-1",
      steps,
      seed: { log: [] },
      driver: inlineDriver,
      emit: (e) => events.push(e),
    });

    expect(summary.state.log).toEqual(["a", "b", "c"]);
    expect(summary.status).toBe("succeeded");
  });
});

describe("runPipeline — onFailure: 'abort' vs 'continue'", () => {
  it("'abort' rethrows the original error and marks the run 'failed'", async () => {
    const events: RunEvent[] = [];
    const steps: RunStep<State>[] = [
      step({
        key: "boom",
        onFailure: "abort",
        run: async () => {
          throw new Error("kaboom");
        },
      }),
    ];

    await expect(
      runPipeline({
        runId: "run-1",
        userId: "user-1",
        steps,
        seed: { log: [] },
        driver: inlineDriver,
        emit: (e) => events.push(e),
      }),
    ).rejects.toThrow("kaboom");

    expect(finishRunCalls).toEqual([{ status: "failed", totalCostCents: null, error: "kaboom" }]);
    const finished = events.find((e) => e.type === "run-finished");
    expect(finished).toMatchObject({ status: "failed" });
  });

  it("'continue' swallows the error, records it, and finishes the run 'partial'", async () => {
    const events: RunEvent[] = [];
    const steps: RunStep<State>[] = [
      step({
        key: "boom",
        onFailure: "continue",
        run: async () => {
          throw new Error("oops");
        },
      }),
      step({
        key: "after",
        run: async (state) => ({ state: { log: [...state.log, "after"] }, source: "none" }),
      }),
    ];

    const summary = await runPipeline({
      runId: "run-1",
      userId: "user-1",
      steps,
      seed: { log: [] },
      driver: inlineDriver,
      emit: (e) => events.push(e),
    });

    expect(summary.status).toBe("partial");
    // the pipeline kept going after the swallowed failure
    expect(summary.state.log).toEqual(["after"]);
    expect(finishStepCalls).toEqual(
      expect.arrayContaining([{ key: "boom", status: "failed", error: "oops" }]),
    );
    expect(finishRunCalls).toEqual([{ status: "partial", totalCostCents: null, error: null }]);
  });
});

describe("runPipeline — cost accumulation", () => {
  it("sums costCents across steps, ignoring steps that report none", async () => {
    const steps: RunStep<State>[] = [
      step({ key: "a", run: async (state) => ({ state, source: "llm", costCents: 1.5 }) }),
      step({ key: "b", run: async (state) => ({ state, source: "none" }) }),
      step({ key: "c", run: async (state) => ({ state, source: "llm", costCents: 0.25 }) }),
    ];

    const summary = await runPipeline({
      runId: "run-1",
      userId: "user-1",
      steps,
      seed: { log: [] },
      driver: inlineDriver,
      emit: () => {},
    });

    expect(summary.totalCostCents).toBeCloseTo(1.75);
    expect(finishRunCalls[0]).toMatchObject({ status: "succeeded" });
    expect(finishRunCalls[0]?.totalCostCents).toBeCloseTo(1.75);
  });
});

describe("runPipeline — skipped steps", () => {
  it("a step reporting skipped: true does not fail the run and is recorded/emitted as 'skipped'", async () => {
    const events: RunEvent[] = [];
    const steps: RunStep<State>[] = [
      step({ key: "maybe", run: async (state) => ({ state, source: "none", skipped: true }) }),
    ];

    const summary = await runPipeline({
      runId: "run-1",
      userId: "user-1",
      steps,
      seed: { log: [] },
      driver: inlineDriver,
      emit: (e) => events.push(e),
    });

    expect(summary.status).toBe("succeeded");
    expect(finishStepCalls).toEqual([{ key: "maybe", status: "skipped", error: null }]);
    const stepEvents = events.filter((e) => e.type === "step");
    expect(stepEvents.at(-1)).toMatchObject({ status: "skipped" });
  });
});

describe("runPipeline — emitted event sequence", () => {
  it("emits run-started, one running+terminal step pair per step, then run-finished", async () => {
    const events: RunEvent[] = [];
    const steps: RunStep<State>[] = [
      step({ key: "only", run: async (state) => ({ state, source: "none" }) }),
    ];

    await runPipeline({
      runId: "run-9",
      userId: "user-1",
      steps,
      seed: { log: [] },
      driver: inlineDriver,
      emit: (e) => events.push(e),
    });

    expect(events.map((e) => e.type)).toEqual(["run-started", "step", "step", "run-finished"]);
    expect(events[0]).toEqual({ type: "run-started", runId: "run-9" });
    expect(events[1]).toMatchObject({ type: "step", key: "only", status: "running", attempt: 1 });
    expect(events[2]).toMatchObject({ type: "step", key: "only", status: "succeeded", attempt: 1 });
    expect(events[3]).toMatchObject({ type: "run-finished", runId: "run-9", status: "succeeded" });
  });
});

describe("runPipeline — attempt regression guard (K.14 M2/M3)", () => {
  it("a step that runs once (no retry) records attempt = 1, not 2", async () => {
    const events: RunEvent[] = [];
    const steps: RunStep<State>[] = [
      step({ key: "once", run: async (state) => ({ state, source: "none" }) }),
    ];

    await runPipeline({
      runId: "run-1",
      userId: "user-1",
      steps,
      seed: { log: [] },
      driver: inlineDriver,
      emit: (e) => events.push(e),
    });

    // upsertRunStep (the only writer of `attempt`) was called exactly once for this step.
    expect(upsertCalls).toEqual([{ key: "once", status: "running" }]);
    const stepEvents = events.filter((e) => e.type === "step");
    expect(stepEvents.every((e) => "attempt" in e && e.attempt === 1)).toBe(true);
  });
});

describe("runPipeline — bookkeeping runs inside the driver closure", () => {
  it("upsertRunStep/finishRunStep are called only while the driver's fn is in flight", async () => {
    let driverInvocations = 0;
    let bookkeepingCallsDuringDriver = 0;

    const countingDriver = async <T>(_key: string, fn: () => Promise<T>): Promise<T> => {
      driverInvocations += 1;
      const before = upsertCalls.length + finishStepCalls.length;
      const result = await fn();
      const after = upsertCalls.length + finishStepCalls.length;
      bookkeepingCallsDuringDriver += after - before;
      return result;
    };

    const steps: RunStep<State>[] = [
      step({ key: "a", run: async (state) => ({ state, source: "none" }) }),
      step({ key: "b", run: async (state) => ({ state, source: "none" }) }),
    ];

    await runPipeline({
      runId: "run-1",
      userId: "user-1",
      steps,
      seed: { log: [] },
      driver: countingDriver,
      emit: () => {},
    });

    expect(driverInvocations).toBe(2);
    // 2 steps * (1 upsertRunStep + 1 finishRunStep) = 4 bookkeeping calls, ALL of them
    // observed while some driver invocation's fn() was in flight.
    expect(bookkeepingCallsDuringDriver).toBe(4);
    expect(upsertCalls.length + finishStepCalls.length).toBe(4);
  });
});
