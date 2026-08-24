import { describe, expect, it } from "vitest";

import {
  matchesManifest,
  parseSyncManifest,
  planSyncActions,
  type FileSnapshot,
} from "../scripts/factory-sync-plan";

describe("parseSyncManifest", () => {
  it("parses a valid manifest", () => {
    const raw = JSON.stringify({
      version: 1,
      paths: ["packages/core/", "eslint.factory-rules.mjs"],
    });
    expect(parseSyncManifest(raw)).toEqual({
      version: 1,
      paths: ["packages/core/", "eslint.factory-rules.mjs"],
    });
  });

  it("throws on a wrong version", () => {
    expect(() => parseSyncManifest(JSON.stringify({ version: 2, paths: [] }))).toThrow(
      /Invalid \.factory\/sync-manifest\.json/,
    );
  });

  it("throws when paths is missing", () => {
    expect(() => parseSyncManifest(JSON.stringify({ version: 1 }))).toThrow(
      /Invalid \.factory\/sync-manifest\.json/,
    );
  });

  it("throws when paths is not an array", () => {
    expect(() => parseSyncManifest(JSON.stringify({ version: 1, paths: "nope" }))).toThrow(
      /Invalid \.factory\/sync-manifest\.json/,
    );
  });

  it("throws when a paths entry isn't a string", () => {
    expect(() => parseSyncManifest(JSON.stringify({ version: 1, paths: [1] }))).toThrow(
      /every "paths" entry must be a string/,
    );
  });

  it("throws on unparseable JSON", () => {
    expect(() => parseSyncManifest("not json")).toThrow();
  });

  it("accepts a well-formed exact-file entry", () => {
    const raw = JSON.stringify({ version: 1, paths: ["eslint.factory-rules.mjs"] });
    expect(parseSyncManifest(raw).paths).toEqual(["eslint.factory-rules.mjs"]);
  });

  it("accepts a well-formed directory-prefix entry", () => {
    const raw = JSON.stringify({ version: 1, paths: ["packages/core/"] });
    expect(parseSyncManifest(raw).paths).toEqual(["packages/core/"]);
  });

  it.each([
    ["a posix-absolute path", "/etc/passwd"],
    ["a posix-absolute directory prefix", "/etc/"],
    ["a Windows drive-letter path", "C:\\Windows\\System32"],
    ["a path containing a '..' segment", "packages/../../etc/passwd"],
    ["a bare '..' segment", ".."],
    ["a '../' directory prefix", "../"],
    ["a path with a backslash", "packages\\core\\index.ts"],
    ["an empty string", ""],
    ["a lone slash", "/"],
    ["a path with a redundant './' segment", "./packages/core/index.ts"],
    ["a path with a redundant '//' segment", "packages//core/index.ts"],
  ])("rejects %s (%j)", (_label, entry) => {
    const raw = JSON.stringify({ version: 1, paths: [entry] });
    expect(() => parseSyncManifest(raw)).toThrow(/unsafe "paths" entry/);
  });
});

describe("matchesManifest", () => {
  const prefixes = ["packages/core/", "eslint.factory-rules.mjs"];

  it("matches a file nested anywhere under a directory prefix", () => {
    expect(matchesManifest("packages/core/src/handler.ts", prefixes)).toBe(true);
    expect(matchesManifest("packages/core/src/deep/nested/file.ts", prefixes)).toBe(true);
  });

  it("matches an exact-file prefix only itself", () => {
    expect(matchesManifest("eslint.factory-rules.mjs", prefixes)).toBe(true);
    expect(matchesManifest("eslint.factory-rules.mjs.bak", prefixes)).toBe(false);
  });

  it("does not match an unrelated path", () => {
    expect(matchesManifest("packages/db/src/client.ts", prefixes)).toBe(false);
  });

  it("does not match a directory prefix's sibling with a shared string prefix", () => {
    expect(matchesManifest("packages/core-extra/file.ts", prefixes)).toBe(false);
  });
});

describe("planSyncActions", () => {
  const prefixes = ["tracked/"];

  it("skips a file unchanged between base and target", () => {
    const base: FileSnapshot = { "tracked/a.ts": "same" };
    const target: FileSnapshot = { "tracked/a.ts": "same" };
    const local: FileSnapshot = { "tracked/a.ts": "same" };
    expect(planSyncActions(prefixes, base, target, local)).toEqual([
      { path: "tracked/a.ts", kind: "skip" },
    ]);
  });

  it("skips a file absent from both base and target even if present in local", () => {
    // Base/target never had it (outside the union of their keys) — nothing to plan.
    expect(planSyncActions(prefixes, {}, {}, { "tracked/a.ts": "local only" })).toEqual([]);
  });

  it("adds a file missing locally but present in target", () => {
    const base: FileSnapshot = {};
    const target: FileSnapshot = { "tracked/new.ts": "new content" };
    const local: FileSnapshot = {};
    expect(planSyncActions(prefixes, base, target, local)).toEqual([
      { path: "tracked/new.ts", kind: "add" },
    ]);
  });

  it("skips a file missing locally that target also no longer has", () => {
    const base: FileSnapshot = { "tracked/gone.ts": "old" };
    const target: FileSnapshot = {};
    const local: FileSnapshot = {};
    expect(planSyncActions(prefixes, base, target, local)).toEqual([
      { path: "tracked/gone.ts", kind: "skip" },
    ]);
  });

  it("deletes a file removed upstream when local is unmodified", () => {
    const base: FileSnapshot = { "tracked/old.ts": "content" };
    const target: FileSnapshot = {};
    const local: FileSnapshot = { "tracked/old.ts": "content" };
    expect(planSyncActions(prefixes, base, target, local)).toEqual([
      { path: "tracked/old.ts", kind: "delete" },
    ]);
  });

  it("keeps (and reports) a file removed upstream when local has diverged from base", () => {
    const base: FileSnapshot = { "tracked/old.ts": "content" };
    const target: FileSnapshot = {};
    const local: FileSnapshot = { "tracked/old.ts": "content, but edited locally" };
    expect(planSyncActions(prefixes, base, target, local)).toEqual([
      { path: "tracked/old.ts", kind: "keep-deleted" },
    ]);
  });

  it("merges a file present (and differing from base) in target while local also has it", () => {
    const base: FileSnapshot = { "tracked/x.ts": "base" };
    const target: FileSnapshot = { "tracked/x.ts": "upstream change" };
    const local: FileSnapshot = { "tracked/x.ts": "local edit" };
    expect(planSyncActions(prefixes, base, target, local)).toEqual([
      { path: "tracked/x.ts", kind: "merge" },
    ]);
  });

  it("merges a file added independently in both target and local (no base entry)", () => {
    const base: FileSnapshot = {};
    const target: FileSnapshot = { "tracked/y.ts": "upstream version" };
    const local: FileSnapshot = { "tracked/y.ts": "local version" };
    expect(planSyncActions(prefixes, base, target, local)).toEqual([
      { path: "tracked/y.ts", kind: "merge" },
    ]);
  });

  it("ignores files outside the manifest prefixes entirely", () => {
    const base: FileSnapshot = { "untracked/a.ts": "x" };
    const target: FileSnapshot = { "untracked/a.ts": "y" };
    const local: FileSnapshot = { "untracked/a.ts": "z" };
    expect(planSyncActions(prefixes, base, target, local)).toEqual([]);
  });

  it("returns actions sorted by path", () => {
    const base: FileSnapshot = {};
    const target: FileSnapshot = { "tracked/b.ts": "b", "tracked/a.ts": "a" };
    const local: FileSnapshot = {};
    expect(planSyncActions(prefixes, base, target, local).map((a) => a.path)).toEqual([
      "tracked/a.ts",
      "tracked/b.ts",
    ]);
  });
});
