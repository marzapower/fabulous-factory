import { describe, expect, it } from "vitest";

import { splitLeftover } from "../components/workspace/dump-segments";

/**
 * `splitLeftover` is the fix for a bug no gate could see: a leftover span used to render
 * as ONE `<button>`, and a `<button>` is `inline-block`, so any newline inside it stopped
 * breaking the parent's line. Highlighted text welded together — "…they've pinged twice⏎
 * book the flight…" rendered as "…pinged twicebook the flight…".
 *
 * These assert the property that actually matters (no piece carrying a clickable span may
 * contain a newline) and the offsets, which have to keep addressing the ORIGINAL dump text
 * or `createManualTaskAction` records the wrong source range.
 */
describe("splitLeftover", () => {
  /** Every clickable piece must be safe to put inside an inline-block element. */
  function expectNoNewlineInsideButtons(pieces: ReturnType<typeof splitLeftover>) {
    for (const piece of pieces) {
      if (piece.span) expect(piece.text).not.toContain("\n");
    }
  }

  /** Reassembling every piece must reproduce the input exactly — nothing dropped. */
  function expectLossless(pieces: ReturnType<typeof splitLeftover>, raw: string) {
    expect(pieces.map((p) => p.text).join("")).toBe(raw);
  }

  it("keeps a single line whole and points at its own offsets", () => {
    const text = "call marco about the contract";
    const pieces = splitLeftover(text, 0);

    expect(pieces).toEqual([{ text, span: { start: 0, end: text.length } }]);
    expectLossless(pieces, text);
  });

  it("splits a multi-line leftover into one clickable piece per line", () => {
    // The normal shape of "what the model ignored": two consecutive skipped lines arrive
    // as ONE leftover segment with a newline in the middle.
    const raw = "first skipped line\nsecond skipped line";
    const pieces = splitLeftover(raw, 0);

    expect(pieces.filter((p) => p.span).map((p) => p.text)).toEqual([
      "first skipped line",
      "second skipped line",
    ]);
    expectNoNewlineInsideButtons(pieces);
    expectLossless(pieces, raw);
  });

  it("leaves edge whitespace outside the clickable piece", () => {
    const raw = "\n  padded line  \n";
    const pieces = splitLeftover(raw, 0);
    const clickable = pieces.filter((p) => p.span);

    expect(clickable).toHaveLength(1);
    expect(clickable[0]?.text).toBe("padded line");
    expectNoNewlineInsideButtons(pieces);
    expectLossless(pieces, raw);
  });

  it("offsets stay absolute against the whole dump, not the segment", () => {
    // A leftover that starts partway through the dump — `start` is the segment's offset
    // into the ORIGINAL text, and every span must be expressed in those coordinates.
    const dump = "consumed line\nskipped one\nskipped two";
    const start = "consumed line\n".length;
    const raw = dump.slice(start);

    const clickable = splitLeftover(raw, start).filter((p) => p.span);

    expect(clickable).toHaveLength(2);
    for (const piece of clickable) {
      // The decisive assertion: slicing the dump at the reported offsets returns exactly
      // the words the button shows. An off-by-one here silently mis-records the source
      // range on the created task.
      expect(dump.slice(piece.span!.start, piece.span!.end)).toBe(piece.text);
    }
    expect(clickable.map((p) => p.text)).toEqual(["skipped one", "skipped two"]);
  });

  it("a blank line between two skipped lines survives as its own text piece", () => {
    const raw = "one\n\ntwo";
    const pieces = splitLeftover(raw, 0);

    expect(pieces.filter((p) => p.span).map((p) => p.text)).toEqual(["one", "two"]);
    expectNoNewlineInsideButtons(pieces);
    // Losslessness is what proves the blank line is still rendered — drop it and the
    // paragraph break the user typed disappears from their own note.
    expectLossless(pieces, raw);
  });

  it("a line of only whitespace produces no clickable piece", () => {
    const raw = "one\n   \ntwo";
    const pieces = splitLeftover(raw, 0);

    expect(pieces.filter((p) => p.span).map((p) => p.text)).toEqual(["one", "two"]);
    expectLossless(pieces, raw);
  });
});
