import { describe, expect, it } from "vitest";

import { isUntrusted } from "@factory/core/untrusted";

import { buildTurnContext, buildTurnTask, turnElementSchema } from "../src/prompts";

describe("buildTurnTask", () => {
  it("returns fixed, non-empty developer-trusted text", () => {
    const task = buildTurnTask();
    expect(typeof task).toBe("string");
    expect(task.length).toBeGreaterThan(0);
    // Called twice, always identical — no interpolation of anything caller-supplied.
    expect(buildTurnTask()).toBe(task);
  });
});

describe("buildTurnContext", () => {
  it("wraps every user-derived and model-derived entry as untrusted — card, board, both history roles, and the final userText", () => {
    const context = buildTurnContext({
      projectName: "Weekend Kiln",
      pitch: "A ceramics-studio booking tool",
      history: [
        { role: "user", content: "let's brainstorm onboarding" },
        { role: "assistant", content: "sure, here are some ideas" },
      ],
      items: [{ kind: "idea", title: "Guided tour", status: "accepted" }],
      userText: "what about a guided tour?",
    });

    // Project card + board snapshot + 2 history turns + final userText.
    expect(context).toHaveLength(5);

    const [card, board, userTurn, assistantTurn, finalTurn] = context;
    // The project name and pitch are user-typed → the whole card travels untrusted.
    expect(isUntrusted(card)).toBe(true);
    expect((card as { value: string }).value).toContain("Weekend Kiln");
    expect((card as { value: string }).value).toContain("A ceramics-studio booking tool");

    // Board titles are user-typed or earlier model output → untrusted too.
    expect(isUntrusted(board)).toBe(true);

    expect(isUntrusted(userTurn)).toBe(true);
    expect((userTurn as { value: string }).value).toBe("let's brainstorm onboarding");

    // Assistant turns are model output re-entering the prompt — model-adjacent data.
    expect(isUntrusted(assistantTurn)).toBe(true);
    expect((assistantTurn as { value: string }).value).toBe("sure, here are some ideas");

    expect(isUntrusted(finalTurn)).toBe(true);
    expect((finalTurn as { value: string }).value).toBe("what about a guided tour?");
  });

  it("renders a board snapshot line per item, kind/title/status", () => {
    const context = buildTurnContext({
      projectName: "Weekend Kiln",
      pitch: null,
      history: [],
      items: [
        { kind: "idea", title: "Guided tour", status: "accepted" },
        { kind: "feature", title: "Export to PDF", status: "proposed" },
      ],
      userText: "anything else?",
    });

    const board = (context[1] as { value: string }).value;
    expect(board).toContain("idea: Guided tour (accepted)");
    expect(board).toContain("feature: Export to PDF (proposed)");
  });

  it("renders an empty board as a plain trusted string — nothing user-derived in it", () => {
    const context = buildTurnContext({
      projectName: "Weekend Kiln",
      pitch: null,
      history: [],
      items: [],
      userText: "hello",
    });

    expect(context[1]).toBe("Board: (empty)");
  });

  it("omits the pitch line entirely when pitch is null", () => {
    const context = buildTurnContext({
      projectName: "Weekend Kiln",
      pitch: null,
      history: [],
      items: [],
      userText: "hello",
    });

    expect((context[0] as { value: string }).value).toBe("Project: Weekend Kiln");
  });
});

describe("turnElementSchema", () => {
  it("every payload field is nullable, none are optional", () => {
    const shape = turnElementSchema.shape;
    for (const key of ["text", "title", "detail"] as const) {
      // A nullable-but-required field accepts null but rejects undefined.
      expect(shape[key].safeParse(null).success).toBe(true);
      expect(shape[key].safeParse(undefined).success).toBe(false);
    }
  });

  it("accepts each of the four kinds", () => {
    for (const kind of ["say", "idea", "feature", "note"] as const) {
      const result = turnElementSchema.safeParse({
        kind,
        text: null,
        title: null,
        detail: null,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unknown kind", () => {
    const result = turnElementSchema.safeParse({
      kind: "bogus",
      text: null,
      title: null,
      detail: null,
    });
    expect(result.success).toBe(false);
  });
});
