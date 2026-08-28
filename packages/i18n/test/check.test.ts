import { describe, expect, it } from "vitest";

import { diffCatalog, flattenKeys } from "../src/check";

describe("flattenKeys", () => {
  it("flattens a nested tree into dotted paths", () => {
    expect(flattenKeys({ a: "x", b: { c: "y", d: { e: "z" } } })).toEqual(["a", "b.c", "b.d.e"]);
  });

  it("prefixes with the given prefix", () => {
    expect(flattenKeys({ a: "x" }, "ns")).toEqual(["ns.a"]);
  });

  it("returns an empty array for an empty tree", () => {
    expect(flattenKeys({})).toEqual([]);
  });
});

describe("diffCatalog", () => {
  it("reports missing and extra keys", () => {
    const base = { a: "1", b: { c: "2" } };
    const candidate = { a: "1", b: {}, d: "3" };
    expect(diffCatalog(base, candidate)).toEqual({ missing: ["b.c"], extra: ["d"] });
  });

  it("reports nothing for structurally identical trees", () => {
    expect(diffCatalog({ a: "1" }, { a: "2" })).toEqual({ missing: [], extra: [] });
  });

  it("reports every key as missing against an empty candidate", () => {
    expect(diffCatalog({ a: "1", b: { c: "2" } }, {})).toEqual({
      missing: ["a", "b.c"],
      extra: [],
    });
  });
});
