import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertOutDirSafe } from "../src/compose-build";

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(path.join(tmpdir(), "compose-build-out-guard-"));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

describe("assertOutDirSafe", () => {
  it("allows an --out outside the repo (e.g. a temp dir)", () => {
    const outside = mkdtempSync(path.join(tmpdir(), "compose-build-out-elsewhere-"));
    try {
      expect(() => assertOutDirSafe(repoRoot, outside)).not.toThrow();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("allows the default templates root and preset dirs nested under it", () => {
    const templatesRoot = path.join(repoRoot, "packages", "create", "templates");
    expect(() => assertOutDirSafe(repoRoot, templatesRoot)).not.toThrow();
    expect(() => assertOutDirSafe(repoRoot, path.join(templatesRoot, "demo"))).not.toThrow();
  });

  it("rejects an --out equal to repoRoot itself", () => {
    expect(() => assertOutDirSafe(repoRoot, repoRoot)).toThrow(/tracked tree/);
  });

  it("rejects an --out inside the repo's tracked tree outside packages/create/templates", () => {
    expect(() => assertOutDirSafe(repoRoot, path.join(repoRoot, "apps", "demo"))).toThrow(
      /tracked tree/,
    );
  });
});
