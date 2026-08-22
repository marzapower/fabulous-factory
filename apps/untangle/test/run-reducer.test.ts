import { describe, expect, it } from "vitest";

import type { RunEvent } from "@factory/untangle";

import { initialWorkspaceState, runReducer } from "../components/workspace/run-reducer";

function fold(events: RunEvent[]) {
  return events.reduce(runReducer, initialWorkspaceState);
}

describe("runReducer", () => {
  it("resets state on run-started for a new runId", () => {
    const first = runReducer(initialWorkspaceState, { type: "run-started", runId: "run-1" });
    expect(first.runId).toBe("run-1");
    expect(first.runStatus).toBe("running");

    const withStep = runReducer(first, {
      type: "step",
      key: "extract",
      label: "Extract tasks",
      ordinal: 0,
      status: "running",
      attempt: 1,
    });

    const second = runReducer(withStep, { type: "run-started", runId: "run-2" });
    expect(second.runId).toBe("run-2");
    expect(second.steps).toHaveLength(0);
  });

  it("is idempotent for a duplicate run-started of the SAME run", () => {
    const started = runReducer(initialWorkspaceState, { type: "run-started", runId: "run-1" });
    const withStep = runReducer(started, {
      type: "step",
      key: "extract",
      label: "Extract tasks",
      ordinal: 0,
      status: "succeeded",
      attempt: 1,
    });
    const dup = runReducer(withStep, { type: "run-started", runId: "run-1" });
    expect(dup.steps).toHaveLength(1);
    expect(dup.steps[0]!.status).toBe("succeeded");
  });

  it("converges step status forward and drops an out-of-order (older) status for the same attempt", () => {
    const events: RunEvent[] = [
      { type: "run-started", runId: "run-1" },
      { type: "step", key: "extract", label: "Extract", ordinal: 0, status: "running", attempt: 1 },
      {
        type: "step",
        key: "extract",
        label: "Extract",
        ordinal: 0,
        status: "succeeded",
        attempt: 1,
        source: "llm",
      },
      // Duplicate delivery of the 'running' frame, arriving AFTER 'succeeded' — must not
      // move the step backwards.
      { type: "step", key: "extract", label: "Extract", ordinal: 0, status: "running", attempt: 1 },
    ];
    const state = fold(events);
    expect(state.steps).toHaveLength(1);
    expect(state.steps[0]!.status).toBe("succeeded");
    expect(state.steps[0]!.source).toBe("llm");
  });

  it("drops a stale (older-attempt) step event and accepts a newer attempt", () => {
    const events: RunEvent[] = [
      { type: "run-started", runId: "run-1" },
      { type: "step", key: "triage", label: "Triage", ordinal: 1, status: "succeeded", attempt: 2 },
      // A late-arriving duplicate from attempt 1 — dropped.
      { type: "step", key: "triage", label: "Triage", ordinal: 1, status: "running", attempt: 1 },
    ];
    const state = fold(events);
    expect(state.steps[0]!.attempt).toBe(2);
    expect(state.steps[0]!.status).toBe("succeeded");

    // A genuinely newer attempt (a durable-driver retry) always wins, even starting
    // from 'running' again.
    const retried = runReducer(state, {
      type: "step",
      key: "triage",
      label: "Triage",
      ordinal: 1,
      status: "running",
      attempt: 3,
    });
    expect(retried.steps[0]!.attempt).toBe(3);
    expect(retried.steps[0]!.status).toBe("running");
  });

  it("dedupes a duplicate task-added delivery", () => {
    const events: RunEvent[] = [
      { type: "run-started", runId: "run-1" },
      {
        type: "data",
        payload: {
          kind: "task-added",
          id: "t1",
          index: 0,
          title: "Call marco",
          sourceStart: 0,
          sourceEnd: 10,
        },
      },
      {
        type: "data",
        payload: {
          kind: "task-added",
          id: "t1",
          index: 0,
          title: "Call marco",
          sourceStart: 0,
          sourceEnd: 10,
        },
      },
    ];
    const state = fold(events);
    expect(state.taskOrder).toEqual(["t1"]);
    expect(Object.keys(state.tasks)).toHaveLength(1);
  });

  it("applies task-triaged that arrives BEFORE its task-added (out of order)", () => {
    const events: RunEvent[] = [
      { type: "run-started", runId: "run-1" },
      {
        type: "data",
        payload: {
          kind: "task-triaged",
          id: "t1",
          index: 0,
          priority: "now",
          effortMinutes: 15,
          dueAt: null,
          tag: null,
        },
      },
      {
        type: "data",
        payload: {
          kind: "task-added",
          id: "t1",
          index: 0,
          title: "Call marco",
          sourceStart: 0,
          sourceEnd: 10,
        },
      },
    ];
    const state = fold(events);
    expect(state.tasks.t1!.priority).toBe("now");
    expect(state.tasks.t1!.effortMinutes).toBe(15);
  });

  it("applies task-decomposed that arrives BEFORE its parent task-added", () => {
    const events: RunEvent[] = [
      { type: "run-started", runId: "run-1" },
      {
        type: "data",
        payload: {
          kind: "task-decomposed",
          parentId: "t1",
          parentIndex: 0,
          subtasks: [{ id: "s1", title: "Compare dates" }],
        },
      },
      {
        type: "data",
        payload: {
          kind: "task-added",
          id: "t1",
          index: 0,
          title: "Book flights",
          sourceStart: 0,
          sourceEnd: 5,
        },
      },
    ];
    const state = fold(events);
    expect(state.tasks.t1!.children).toEqual(["s1"]);
    expect(state.tasks.s1?.title).toBe("Compare dates");
    expect(state.tasks.s1?.parentId).toBe("t1");
  });

  it("dedupes a duplicate task-decomposed delivery for the same parent", () => {
    const decomposed: RunEvent = {
      type: "data",
      payload: {
        kind: "task-decomposed",
        parentId: "t1",
        parentIndex: 0,
        subtasks: [{ id: "s1", title: "Compare dates" }],
      },
    };
    const events: RunEvent[] = [
      { type: "run-started", runId: "run-1" },
      {
        type: "data",
        payload: {
          kind: "task-added",
          id: "t1",
          index: 0,
          title: "Book flights",
          sourceStart: 0,
          sourceEnd: 5,
        },
      },
      decomposed,
      decomposed,
    ];
    const state = fold(events);
    expect(state.tasks.t1!.children).toEqual(["s1"]);
  });

  it("is idempotent for a duplicate/late run-finished and ignores one for a different run", () => {
    const events: RunEvent[] = [
      { type: "run-started", runId: "run-1" },
      { type: "run-finished", runId: "run-1", status: "succeeded", totalCostCents: 4.2 },
      { type: "run-finished", runId: "run-1", status: "succeeded", totalCostCents: 4.2 },
    ];
    const state = fold(events);
    expect(state.runStatus).toBe("succeeded");
    expect(state.totalCostCents).toBe(4.2);

    const stray = runReducer(state, {
      type: "run-finished",
      runId: "some-other-run",
      status: "failed",
      totalCostCents: 0,
    });
    expect(stray).toBe(state);
  });
});
