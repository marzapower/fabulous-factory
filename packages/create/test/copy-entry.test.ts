/**
 * Unit test for `compose.ts`'s `ensureCopySource` — the shared existence/optional/throw
 * helper `copyEntry`, `composeNpmrc`, and `composeDockerfile` all delegate to, so it's
 * covered once here rather than duplicated across each caller's own test coverage.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ensureCopySource } from "../src/compose";

describe("ensureCopySource", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(tmpdir(), "fabulous-factory-copy-entry-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("returns the resolved absolute path when the source exists", () => {
    writeFileSync(path.join(repoRoot, "present.txt"), "hello\n");
    const warnings: string[] = [];

    const result = ensureCopySource(repoRoot, "present.txt", false, warnings);

    expect(result).toBe(path.join(repoRoot, "present.txt"));
    expect(warnings).toEqual([]);
  });

  it("returns undefined and records a warning (not a throw) for a missing optional source", () => {
    const warnings: string[] = [];

    const result = ensureCopySource(repoRoot, "missing-optional.txt", true, warnings);

    expect(result).toBeUndefined();
    expect(warnings).toEqual(["Skipped missing (optional) compose source: missing-optional.txt"]);
  });

  it("throws for a missing required (non-optional) source", () => {
    const warnings: string[] = [];

    expect(() => ensureCopySource(repoRoot, "missing-required.txt", false, warnings)).toThrow(
      "Missing required compose source: missing-required.txt",
    );
    expect(warnings).toEqual([]);
  });

  it("throws for a missing source when `optional` is undefined (defaults to required)", () => {
    const warnings: string[] = [];

    expect(() => ensureCopySource(repoRoot, "missing-undefined.txt", undefined, warnings)).toThrow(
      "Missing required compose source: missing-undefined.txt",
    );
    expect(warnings).toEqual([]);
  });
});
