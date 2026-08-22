import { beforeEach, describe, expect, it, vi } from "vitest";

// Same mocking style as `test/check-monitor.test.ts`: mock every vendor/service boundary
// by module path rather than dragging in the real packages (which would pull in
// `@factory/auth`'s module-scope `betterAuth({...})`, a real OTel tracer, etc).
vi.mock("@factory/config", () => ({ isEnabled: vi.fn() }));
vi.mock("@factory/core", () => ({
  untrusted: (value: unknown) => ({ value, __untrusted: true }),
}));
vi.mock("@factory/llm", () => ({ streamArray: vi.fn() }));
vi.mock("@factory/observability", () => ({ captureException: vi.fn() }));

vi.mock("../src/tasks/queries", () => ({
  insertExtractedTask: vi.fn(),
  applyTriage: vi.fn(),
  insertSubtasks: vi.fn(),
}));

import { isEnabled } from "@factory/config";
import { streamArray } from "@factory/llm";
import { captureException } from "@factory/observability";

import {
  decomposeStep,
  extractStep,
  triageStep,
  type CaptureState,
  type TaskEvent,
} from "../src/tasks/pipeline";
import { applyTriage, insertExtractedTask, insertSubtasks } from "../src/tasks/queries";

const mockedIsEnabled = vi.mocked(isEnabled);
const mockedStreamArray = vi.mocked(streamArray);
const mockedCaptureException = vi.mocked(captureException);
const mockedInsertExtractedTask = vi.mocked(insertExtractedTask);
const mockedApplyTriage = vi.mocked(applyTriage);
const mockedInsertSubtasks = vi.mocked(insertSubtasks);

// A minimal stand-in for `RunStepContext` (`../src/runs/engine`, owned by T5 and not yet
// written — see the task's owner file list). Only the fields these steps actually read.
function makeCtx() {
  return { runId: "run-1", userId: "user-1", emit: vi.fn() };
}

function seedState(overrides: Partial<CaptureState> = {}): CaptureState {
  return {
    captureId: "capture-1",
    rawText: "call marco about the contract\nbook flights for the trip",
    todayIso: "2026-08-21",
    tasks: [],
    ...overrides,
  };
}

function genResult<T>(output: T) {
  return {
    output,
    model: "test-model",
    profile: "direct" as const,
    usage: { inputTokens: 10, outputTokens: 5 },
    costCents: 1,
    costSource: "estimated" as const,
    latencyMs: 5,
  };
}

/**
 * Faithful `streamArray` stand-in. The real one invokes `onElement` for each element as
 * it drains `elementStream`, THEN resolves with the collected array — a mock that only
 * resolved `output` would let a regression back into the non-streaming shape (all cards
 * appearing at once, after the call finishes) pass silently, which is exactly the bug
 * this pipeline is built to avoid.
 */
function streamOf<T>(elements: T[]) {
  return (opts: { onElement?: (element: T, index: number) => void }) => {
    elements.forEach((element, index) => opts.onElement?.(element, index));
    return Promise.resolve(genResult(elements));
  };
}

beforeEach(() => {
  mockedIsEnabled.mockReset();
  mockedIsEnabled.mockReturnValue(false);
  mockedStreamArray.mockReset();
  mockedCaptureException.mockReset();
  mockedInsertExtractedTask.mockReset();
  mockedApplyTriage.mockReset();
  mockedInsertSubtasks.mockReset();

  let nextId = 0;
  mockedInsertExtractedTask.mockImplementation(async () => {
    nextId += 1;
    return { id: `task-${nextId}` };
  });
});

describe("extractStep", () => {
  it("LLM path: inserts a row and emits a task-added event per element", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    mockedStreamArray.mockImplementation(
      streamOf([
        { title: "Call Marco", sourceQuote: "call marco about the contract" },
        { title: "Book flights", sourceQuote: "book flights for the trip" },
      ]),
    );

    const ctx = makeCtx();
    const result = await extractStep.run(seedState(), ctx);

    expect(mockedInsertExtractedTask).toHaveBeenCalledTimes(2);
    expect(mockedInsertExtractedTask.mock.calls[0]?.[0]).toMatchObject({
      title: "Call Marco",
      source: "llm",
      sourceStart: 0,
      sourceEnd: 29,
    });
    expect(result.source).toBe("llm");
    expect(result.state.tasks).toHaveLength(2);
    expect(result.state.tasks[0]).toMatchObject({ index: 0, title: "Call Marco" });

    expect(ctx.emit).toHaveBeenCalledTimes(2);
    const firstEvent = ctx.emit.mock.calls[0]?.[0].payload as TaskEvent;
    expect(firstEvent).toMatchObject({ kind: "task-added", index: 0, title: "Call Marco" });

    // THE invariant of the emit-then-persist split: the id a card was announced under is
    // the id the row is written under, and the id the pipeline carries forward. If these
    // ever diverge, the UI shows a task whose real row it can never toggle or delete.
    const emittedId = (firstEvent as Extract<TaskEvent, { kind: "task-added" }>).id;
    expect(emittedId).toEqual(expect.any(String));
    expect(mockedInsertExtractedTask.mock.calls[0]?.[0].id).toBe(emittedId);
    expect(result.state.tasks[0]?.id).toBe(emittedId);
  });

  it("a sourceQuote that doesn't appear in rawText anchors to null, never a wrong offset", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    mockedStreamArray.mockImplementation(
      streamOf([{ title: "Do the thing", sourceQuote: "text that was never in the capture" }]),
    );

    await extractStep.run(seedState(), makeCtx());

    expect(mockedInsertExtractedTask.mock.calls[0]?.[0]).toMatchObject({
      sourceStart: null,
      sourceEnd: null,
    });
  });

  it("heuristic path when isEnabled('llm') is false", async () => {
    const ctx = makeCtx();
    const result = await extractStep.run(seedState(), ctx);

    expect(mockedStreamArray).not.toHaveBeenCalled();
    expect(mockedInsertExtractedTask).toHaveBeenCalledTimes(2);
    expect(mockedInsertExtractedTask.mock.calls[0]?.[0]).toMatchObject({ source: "heuristic" });
    expect(result.source).toBe("heuristic");
    expect(result.state.tasks.map((t) => t.title)).toEqual([
      "call marco about the contract",
      "book flights for the trip",
    ]);
  });

  it("emits tasks-reset when the stream throws AFTER already emitting cards", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    // The dangerous shape: elements arrive and are emitted live, THEN the provider dies.
    // Those cards are on screen but were never persisted (extract writes only after the
    // stream resolves), so the heuristic fallback must not simply add more on top.
    mockedStreamArray.mockImplementation(((opts: {
      onElement?: (element: { title: string; sourceQuote: string | null }, index: number) => void;
    }) => {
      opts.onElement?.({ title: "Call Marco", sourceQuote: null }, 0);
      opts.onElement?.({ title: "Book flights", sourceQuote: null }, 1);
      return Promise.reject(new Error("provider died mid-stream"));
    }) as never);

    const ctx = makeCtx();
    await extractStep.run(seedState(), ctx);

    const kinds = ctx.emit.mock.calls.map((call) => (call[0].payload as TaskEvent).kind);
    expect(kinds.slice(0, 2)).toEqual(["task-added", "task-added"]);
    // The reset must come after the phantom cards and before the heuristic's own cards,
    // or the client renders both sets at once.
    const resetAt = kinds.indexOf("tasks-reset");
    expect(resetAt).toBe(2);
    expect(kinds.slice(resetAt + 1).every((kind) => kind === "task-added")).toBe(true);
  });

  it("a failed insert aborts the step — it must NOT fall back and write a second set", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    mockedStreamArray.mockImplementation(
      streamOf([
        { title: "Call Marco", sourceQuote: null },
        { title: "Book flights", sourceQuote: null },
      ]),
    );
    // First row commits, second insert dies — the shape where falling back would leave
    // one LLM row PLUS a full heuristic set for the same capture.
    mockedInsertExtractedTask.mockReset();
    mockedInsertExtractedTask
      .mockResolvedValueOnce({ id: "task-1" })
      .mockRejectedValueOnce(new Error("database went away"));

    await expect(extractStep.run(seedState(), makeCtx())).rejects.toThrow("database went away");

    // Exactly the two attempts: the successful insert and the failed one. A third call
    // would mean the heuristic fallback ran on top of already-committed rows.
    expect(mockedInsertExtractedTask).toHaveBeenCalledTimes(2);
  });

  it("falls back to the heuristic when streamArray throws, and reports the failure", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    mockedStreamArray.mockRejectedValue(new Error("provider unavailable"));

    const result = await extractStep.run(seedState(), makeCtx());

    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("heuristic");
    expect(mockedInsertExtractedTask).toHaveBeenCalledTimes(2);
    expect(mockedInsertExtractedTask.mock.calls[0]?.[0]).toMatchObject({ source: "heuristic" });
  });

  it("handles a short/truncated streamArray result without throwing", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    // M4: streamArray resolves with fewer elements than requested rather than throwing —
    // the step must not index blindly past what actually arrived.
    mockedStreamArray.mockImplementation(
      streamOf([{ title: "Only one came back", sourceQuote: null }]),
    );

    const result = await extractStep.run(seedState(), makeCtx());

    expect(result.state.tasks).toHaveLength(1);
    expect(mockedInsertExtractedTask).toHaveBeenCalledTimes(1);
  });
});

describe("triageStep", () => {
  function triagedSeed(): CaptureState {
    return seedState({
      tasks: [
        { id: "task-1", index: 0, title: "Call Marco", needsBreakdown: false },
        { id: "task-2", index: 1, title: "Book flights", needsBreakdown: false },
      ],
    });
  }

  it("is skipped when there are no tasks to triage", async () => {
    const result = await triageStep.run(seedState({ tasks: [] }), makeCtx());
    expect(result.skipped).toBe(true);
    expect(mockedStreamArray).not.toHaveBeenCalled();
  });

  it("LLM path: applies triage per element and emits a task-triaged event", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    mockedStreamArray.mockImplementation(
      streamOf([
        {
          index: 0,
          priority: "now",
          effortMinutes: 15,
          dueAt: "2026-08-22",
          tag: "calls",
          needsBreakdown: false,
        },
      ]),
    );

    const ctx = makeCtx();
    const result = await triageStep.run(triagedSeed(), ctx);

    expect(mockedApplyTriage).toHaveBeenCalledTimes(1);
    // Ownership-scoped: the userId argument is the point of the assertion, not noise —
    // `applyTriage` is exported from the package barrel, so it must never accept an id
    // alone (see its doc comment in src/tasks/queries.ts).
    expect(mockedApplyTriage).toHaveBeenCalledWith(
      "task-1",
      "user-1",
      expect.objectContaining({ priority: "now", effortMinutes: 15, tag: "calls" }),
    );
    expect(ctx.emit).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("llm");
  });

  it("drops out-of-range triage indices rather than mis-applying them", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    mockedStreamArray.mockImplementation(
      streamOf([
        {
          index: 0,
          priority: "now",
          effortMinutes: null,
          dueAt: null,
          tag: null,
          needsBreakdown: false,
        },
        // Out of range for a 2-task state — must be dropped, not crash, not touch task-1
        // a second time under the wrong assumption.
        {
          index: 5,
          priority: "later",
          effortMinutes: null,
          dueAt: null,
          tag: null,
          needsBreakdown: false,
        },
        // Negative index — also out of range.
        {
          index: -1,
          priority: "later",
          effortMinutes: null,
          dueAt: null,
          tag: null,
          needsBreakdown: false,
        },
      ]),
    );

    const ctx = makeCtx();
    const result = await triageStep.run(triagedSeed(), ctx);

    expect(mockedApplyTriage).toHaveBeenCalledTimes(1);
    expect(mockedApplyTriage).toHaveBeenCalledWith(
      "task-1",
      "user-1",
      expect.objectContaining({ priority: "now" }),
    );
    expect(ctx.emit).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("llm");
  });

  it("heuristic path when isEnabled('llm') is false", async () => {
    const result = await triageStep.run(triagedSeed(), makeCtx());

    expect(mockedStreamArray).not.toHaveBeenCalled();
    expect(mockedApplyTriage).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("heuristic");
  });

  it("falls back to the heuristic when streamArray throws", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    mockedStreamArray.mockRejectedValue(new Error("provider unavailable"));

    const result = await triageStep.run(triagedSeed(), makeCtx());

    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("heuristic");
    expect(mockedApplyTriage).toHaveBeenCalledTimes(2);
  });
});

describe("decomposeStep", () => {
  function decomposeSeed(): CaptureState {
    return seedState({
      tasks: [
        { id: "task-1", index: 0, title: "Plan the launch", needsBreakdown: true },
        { id: "task-2", index: 1, title: "Send an email", needsBreakdown: false },
      ],
    });
  }

  it("is skipped (never faked) when isEnabled('llm') is false", async () => {
    const result = await decomposeStep.run(decomposeSeed(), makeCtx());
    expect(result).toEqual({ state: decomposeSeed(), source: "none", skipped: true });
    expect(mockedStreamArray).not.toHaveBeenCalled();
  });

  it("is skipped when no task needs breakdown", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    const state = seedState({
      tasks: [{ id: "task-1", index: 0, title: "Simple task", needsBreakdown: false }],
    });

    const result = await decomposeStep.run(state, makeCtx());
    expect(result.skipped).toBe(true);
    expect(mockedStreamArray).not.toHaveBeenCalled();
  });

  it("LLM path: inserts subtasks for a needs-breakdown task and emits an event", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    mockedStreamArray.mockImplementation(
      streamOf([{ index: 0, subtasks: ["Book venue", "Send invites"] }]),
    );
    mockedInsertSubtasks.mockResolvedValue([
      { id: "sub-1", title: "Book venue" },
      { id: "sub-2", title: "Send invites" },
    ]);

    const ctx = makeCtx();
    const result = await decomposeStep.run(decomposeSeed(), ctx);

    expect(mockedInsertSubtasks).toHaveBeenCalledWith(
      "task-1",
      "user-1",
      "run-1",
      ["Book venue", "Send invites"],
      "llm",
    );
    expect(ctx.emit).toHaveBeenCalledTimes(1);
    const event = ctx.emit.mock.calls[0]?.[0].payload as TaskEvent;
    expect(event).toMatchObject({ kind: "task-decomposed", parentId: "task-1", parentIndex: 0 });
    expect(result.source).toBe("llm");
  });

  it("drops an out-of-range decompose index rather than mis-applying it", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    // Only one candidate (task-1) is in this call's context — index 3 is out of range.
    mockedStreamArray.mockImplementation(
      streamOf([{ index: 3, subtasks: ["Should never be inserted"] }]),
    );

    const result = await decomposeStep.run(decomposeSeed(), makeCtx());

    expect(mockedInsertSubtasks).not.toHaveBeenCalled();
    expect(result.source).toBe("llm");
  });

  it("reports skipped (never fakes subtasks) when streamArray throws", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    mockedStreamArray.mockRejectedValue(new Error("provider unavailable"));

    const result = await decomposeStep.run(decomposeSeed(), makeCtx());

    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(true);
    expect(mockedInsertSubtasks).not.toHaveBeenCalled();
  });
});
