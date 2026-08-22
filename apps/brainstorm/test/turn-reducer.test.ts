import { describe, expect, it } from "vitest";

import {
  initialTurnState,
  turnReducer,
  type TurnState,
} from "../components/workbench/turn-reducer";

function streaming(): TurnState {
  return turnReducer(initialTurnState, { type: "reset" });
}

describe("turnReducer", () => {
  it("starts idle", () => {
    expect(initialTurnState.phase).toBe("idle");
    expect(initialTurnState.chunks).toEqual([]);
  });

  it("reset moves to streaming and clears everything", () => {
    const state = streaming();
    expect(state.phase).toBe("streaming");
    expect(state.chunks).toEqual([]);
    expect(state.error).toBeNull();
  });

  it("turn-started is idempotent while already streaming", () => {
    const started = turnReducer(streaming(), { type: "turn-started" });
    const again = turnReducer(started, { type: "turn-started" });
    expect(again).toBe(started);
  });

  it("accumulates say chunks in arrival order", () => {
    let state = streaming();
    state = turnReducer(state, { type: "say", text: "first", index: 0 });
    state = turnReducer(state, { type: "say", text: "second", index: 1 });
    expect(state.chunks).toEqual([
      { kind: "say", index: 0, text: "first" },
      { kind: "say", index: 1, text: "second" },
    ]);
  });

  it("interleaves say and proposal chunks in arrival order", () => {
    let state = streaming();
    state = turnReducer(state, { type: "say", text: "here's an idea:", index: 0 });
    state = turnReducer(state, {
      type: "proposal",
      index: 1,
      proposal: { id: "p1", kind: "idea", title: "Shared grocery list", detail: null },
    });
    state = turnReducer(state, { type: "say", text: "want another?", index: 2 });

    expect(state.chunks.map((c) => c.kind)).toEqual(["say", "proposal", "say"]);
    expect(state.chunks[1]).toMatchObject({
      kind: "proposal",
      status: "pending",
      unsaved: false,
    });
  });

  it("proposal chunks start pending and not unsaved", () => {
    let state = streaming();
    state = turnReducer(state, {
      type: "proposal",
      index: 0,
      proposal: { id: "p1", kind: "feature", title: "Real-time sync", detail: "..." },
    });
    const chunk = state.chunks[0];
    expect(chunk).toMatchObject({ status: "pending", unsaved: false });
  });

  it("turn-finished ok records status and cost", () => {
    let state = streaming();
    state = turnReducer(state, { type: "say", text: "hi", index: 0 });
    state = turnReducer(state, { type: "turn-finished", status: "ok", costCents: 3 });
    expect(state.phase).toBe("finished");
    expect(state.finishedStatus).toBe("ok");
    expect(state.costCents).toBe(3);
    // Chunks survive a successful finish — the caller folds them into history.
    expect(state.chunks).toHaveLength(1);
  });

  it("turn-finished empty is distinguished from ok", () => {
    const state = turnReducer(streaming(), {
      type: "turn-finished",
      status: "empty",
      costCents: null,
    });
    expect(state.finishedStatus).toBe("empty");
  });

  it("an empty turn (no chunks at all) still finishes cleanly", () => {
    const state = turnReducer(streaming(), {
      type: "turn-finished",
      status: "empty",
      costCents: null,
    });
    expect(state.phase).toBe("finished");
    expect(state.chunks).toEqual([]);
  });

  it("turn-error llm_failed discards chunks and sets a retryable error", () => {
    let state = streaming();
    state = turnReducer(state, { type: "say", text: "partial...", index: 0 });
    state = turnReducer(state, { type: "turn-error", code: "llm_failed" });
    expect(state.phase).toBe("error");
    expect(state.chunks).toEqual([]);
    expect(state.error).toEqual({
      code: "llm_failed",
      message: expect.stringContaining("Try again"),
    });
  });

  it("turn-error persist_failed keeps chunks but flags proposals unsaved", () => {
    let state = streaming();
    state = turnReducer(state, { type: "say", text: "here's one:", index: 0 });
    state = turnReducer(state, {
      type: "proposal",
      index: 1,
      proposal: { id: "p1", kind: "note", title: "Remember this", detail: null },
    });
    state = turnReducer(state, { type: "turn-error", code: "persist_failed" });

    expect(state.phase).toBe("error");
    expect(state.chunks).toHaveLength(2);
    const proposalChunk = state.chunks.find((c) => c.kind === "proposal");
    expect(proposalChunk).toMatchObject({ unsaved: true });
    expect(state.error?.code).toBe("persist_failed");
  });

  it("turn-error llm_disabled resets into the chat-off state", () => {
    let state = streaming();
    state = turnReducer(state, { type: "say", text: "partial", index: 0 });
    state = turnReducer(state, { type: "turn-error", code: "llm_disabled" });
    expect(state.phase).toBe("disabled");
    expect(state.chunks).toEqual([]);
    expect(state.disabledMessage).toMatch(/LLM key/);
  });

  it("card-status accepts a pending proposal chunk by id", () => {
    let state = streaming();
    state = turnReducer(state, {
      type: "proposal",
      index: 0,
      proposal: { id: "p1", kind: "idea", title: "Idea one", detail: null },
    });
    state = turnReducer(state, { type: "card-status", id: "p1", status: "accepted" });
    expect(state.chunks[0]).toMatchObject({ status: "accepted" });
  });

  it("card-status is a no-op on an unsaved (persist-failed) card", () => {
    let state = streaming();
    state = turnReducer(state, {
      type: "proposal",
      index: 0,
      proposal: { id: "p1", kind: "idea", title: "Idea one", detail: null },
    });
    state = turnReducer(state, { type: "turn-error", code: "persist_failed" });
    const before = state.chunks[0];
    state = turnReducer(state, { type: "card-status", id: "p1", status: "dismissed" });
    expect(state.chunks[0]).toEqual(before);
  });

  it("ignores say/proposal events once the turn already finished", () => {
    let state = streaming();
    state = turnReducer(state, { type: "turn-finished", status: "empty", costCents: null });
    const after = turnReducer(state, { type: "say", text: "late arrival", index: 0 });
    expect(after).toBe(state);
  });
});
