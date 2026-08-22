import { describe, expect, it, vi } from "vitest";

// `../src/turn` imports `streamArray` from `@factory/llm` at module scope; mock the
// boundary by module path (the `tasks-pipeline.test.ts` style) so this pure-mapping
// suite never loads the real LLM package's import graph. `mapTurnElement` needs none
// of it.
vi.mock("@factory/llm", () => ({ streamArray: vi.fn() }));

import { mapTurnElement } from "../src/turn";

function mint(id = "minted-id"): () => string {
  return () => id;
}

describe("mapTurnElement", () => {
  it("maps a valid say element", () => {
    const event = mapTurnElement(
      { kind: "say", text: "here's an idea for onboarding", title: null, detail: null },
      0,
      mint(),
    );
    expect(event).toEqual({ type: "say", text: "here's an idea for onboarding", index: 0 });
  });

  it("maps a valid proposal element, minting an id via the injected mint()", () => {
    const event = mapTurnElement(
      { kind: "idea", text: null, title: "Guided tour", detail: "step-by-step walkthrough" },
      2,
      mint("abc-123"),
    );
    expect(event).toEqual({
      type: "proposal",
      proposal: {
        id: "abc-123",
        kind: "idea",
        title: "Guided tour",
        detail: "step-by-step walkthrough",
      },
      index: 2,
    });
  });

  it("drops a say element with null text", () => {
    const event = mapTurnElement({ kind: "say", text: null, title: null, detail: null }, 0, mint());
    expect(event).toBeNull();
  });

  it("drops a say element with empty/whitespace-only text", () => {
    const event = mapTurnElement(
      { kind: "say", text: "   ", title: null, detail: null },
      0,
      mint(),
    );
    expect(event).toBeNull();
  });

  it("drops an item element (idea/feature/note) with a null title", () => {
    for (const kind of ["idea", "feature", "note"] as const) {
      const event = mapTurnElement({ kind, text: null, title: null, detail: null }, 0, mint());
      expect(event).toBeNull();
    }
  });

  it("drops an item element with an empty/whitespace-only title", () => {
    const event = mapTurnElement(
      { kind: "feature", text: null, title: "   ", detail: null },
      0,
      mint(),
    );
    expect(event).toBeNull();
  });

  it("defaults detail to null when the element omits it", () => {
    const event = mapTurnElement(
      { kind: "note", text: null, title: "Remember to follow up", detail: null },
      1,
      mint("note-id"),
    );
    expect(event).toEqual({
      type: "proposal",
      proposal: { id: "note-id", kind: "note", title: "Remember to follow up", detail: null },
      index: 1,
    });
  });

  it("never calls mint() for a say element or a dropped element", () => {
    let calls = 0;
    const countingMint = () => {
      calls += 1;
      return "should-not-be-called";
    };

    mapTurnElement({ kind: "say", text: "hi", title: null, detail: null }, 0, countingMint);
    mapTurnElement({ kind: "idea", text: null, title: null, detail: null }, 1, countingMint);

    expect(calls).toBe(0);
  });
});
