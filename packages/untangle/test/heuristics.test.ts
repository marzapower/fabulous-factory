import { describe, expect, it } from "vitest";

import { MAX_TASKS_PER_RUN } from "../src/tasks/constants";
import { heuristicExtract, heuristicTriage, locateQuote } from "../src/tasks/heuristics";

describe("heuristicExtract", () => {
  it("splits on newlines and returns exact character offsets", () => {
    const text = "call marco\nbook flights";
    const tasks = heuristicExtract(text);

    expect(tasks).toEqual([
      { title: "call marco", sourceStart: 0, sourceEnd: 10 },
      { title: "book flights", sourceStart: 11, sourceEnd: 23 },
    ]);
    for (const task of tasks) {
      expect(text.slice(task.sourceStart, task.sourceEnd)).toBe(task.title);
    }
  });

  it("strips bullet markers (-, *, •) and offsets still land past the marker", () => {
    const text = "- call marco\n* book flights\n• landing page";
    const tasks = heuristicExtract(text);

    expect(tasks.map((task) => task.title)).toEqual(["call marco", "book flights", "landing page"]);
    for (const task of tasks) {
      expect(text.slice(task.sourceStart, task.sourceEnd)).toBe(task.title);
    }
  });

  it("strips numbered-list markers ('1.', '2)')", () => {
    const text = "1. call marco\n2) book flights";
    const tasks = heuristicExtract(text);

    expect(tasks.map((task) => task.title)).toEqual(["call marco", "book flights"]);
    for (const task of tasks) {
      expect(text.slice(task.sourceStart, task.sourceEnd)).toBe(task.title);
    }
  });

  it("drops blank lines and fragments shorter than MIN_TASK_CHARS", () => {
    const text = "call marco\n\n   \nhi\nbook flights";
    const tasks = heuristicExtract(text);

    expect(tasks.map((task) => task.title)).toEqual(["call marco", "book flights"]);
  });

  it("caps output at MAX_TASKS_PER_RUN", () => {
    const text = Array.from({ length: MAX_TASKS_PER_RUN + 10 }, (_, i) => `task number ${i}`).join(
      "\n",
    );
    const tasks = heuristicExtract(text);

    expect(tasks).toHaveLength(MAX_TASKS_PER_RUN);
  });

  it("returns an empty array for blank input", () => {
    expect(heuristicExtract("   \n\n  ")).toEqual([]);
  });
});

describe("heuristicTriage", () => {
  const todayIso = "2026-08-21"; // a Friday

  it("assigns 'now' priority for urgent keywords", () => {
    const [result] = heuristicTriage(["asap call marco"], todayIso);
    expect(result).toMatchObject({ index: 0, priority: "now", effortMinutes: null, tag: null });
  });

  it("assigns 'later' priority for someday/maybe keywords", () => {
    const [result] = heuristicTriage(["someday learn spanish"], todayIso);
    expect(result?.priority).toBe("later");
  });

  it("defaults to 'next' priority otherwise", () => {
    const [result] = heuristicTriage(["book flights"], todayIso);
    expect(result?.priority).toBe("next");
  });

  it("resolves 'today'/'tomorrow' relative to todayIso", () => {
    const [today, tomorrow] = heuristicTriage(
      ["submit report today", "call back tomorrow"],
      todayIso,
    );
    expect(today?.dueAt).toBe("2026-08-21");
    expect(tomorrow?.dueAt).toBe("2026-08-22");
  });

  it("resolves a named weekday to its NEXT occurrence, never today", () => {
    // todayIso (2026-08-21) is itself a Friday — "friday" in a title must resolve to
    // next week's Friday, not today.
    const [result] = heuristicTriage(["standup on friday"], todayIso);
    expect(result?.dueAt).toBe("2026-08-28");
  });

  it("returns null dueAt when no date vocabulary is present", () => {
    const [result] = heuristicTriage(["think about it"], todayIso);
    expect(result?.dueAt).toBeNull();
  });

  it("preserves the caller's index for every title", () => {
    const results = heuristicTriage(["a", "b", "c"], todayIso);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2]);
  });
});

describe("locateQuote", () => {
  const rawText = "Please   call   Marco\nabout the contract by friday.";

  it("finds an exact quote", () => {
    const anchor = locateQuote(rawText, "about the contract by friday");
    expect(anchor).not.toBeNull();
    expect(rawText.slice(anchor!.start, anchor!.end)).toBe("about the contract by friday");
  });

  it("is whitespace-tolerant across collapsed spacing and newlines", () => {
    const anchor = locateQuote(rawText, "call Marco\nabout the contract");
    expect(anchor).not.toBeNull();
    expect(rawText.slice(anchor!.start, anchor!.end).replace(/\s+/g, " ")).toBe(
      "call   Marco\nabout the contract".replace(/\s+/g, " "),
    );
  });

  it("returns null for a hallucinated quote not present in the source", () => {
    expect(locateQuote(rawText, "this text does not appear anywhere")).toBeNull();
  });

  it("returns null for a blank quote", () => {
    expect(locateQuote(rawText, "   ")).toBeNull();
  });
});
