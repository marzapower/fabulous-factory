import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertEmptyTarget,
  derivePickerDefault,
  warnIfNodeTooOld,
  type PresetManifestEntry,
} from "../src/install";

const TWO_AVAILABLE: PresetManifestEntry[] = [
  {
    id: "demo",
    label: "Untangle demo",
    description: "Full working micro-SaaS",
    status: "available",
  },
  { id: "api-only", label: "Micro API", description: "API-only shape", status: "available" },
];

describe("derivePickerDefault", () => {
  it("uses the requested preset id when given, even if it's not first in the manifest", () => {
    expect(derivePickerDefault(TWO_AVAILABLE, "api-only")).toBe("api-only");
  });

  it("falls back to the first 'available' entry when none was requested", () => {
    expect(derivePickerDefault(TWO_AVAILABLE)).toBe("demo");
  });

  it("skips 'coming-soon' entries when picking the fallback default", () => {
    const manifest: PresetManifestEntry[] = [
      { id: "soon", label: "Soon", description: "d", status: "coming-soon" },
      { id: "demo", label: "Demo", description: "d", status: "available" },
    ];
    expect(derivePickerDefault(manifest)).toBe("demo");
  });

  it("returns undefined when nothing is available and nothing was requested", () => {
    const noneAvailable = TWO_AVAILABLE.map((entry) => ({
      ...entry,
      status: "coming-soon" as const,
    }));
    expect(derivePickerDefault(noneAvailable)).toBeUndefined();
  });

  it("never throws for an ambiguous multi-preset manifest (unlike resolvePreset)", () => {
    expect(() => derivePickerDefault(TWO_AVAILABLE)).not.toThrow();
  });
});

describe("assertEmptyTarget", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "assert-empty-target-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("allows a path that doesn't exist yet", () => {
    expect(() => assertEmptyTarget(path.join(dir, "nope"))).not.toThrow();
  });

  it("allows an existing empty directory", () => {
    expect(() => assertEmptyTarget(dir)).not.toThrow();
  });

  it("rejects an existing non-empty directory", () => {
    writeFileSync(path.join(dir, "x.txt"), "hi");
    expect(() => assertEmptyTarget(dir)).toThrow(/not empty/);
  });

  it("rejects a target that exists as a regular file, with a readable message", () => {
    const filePath = path.join(dir, "file.txt");
    writeFileSync(filePath, "hi");
    expect(() => assertEmptyTarget(filePath)).toThrow(/not a directory/);
  });

  it("rejects a symlinked target", () => {
    const realDir = path.join(dir, "real");
    mkdirSync(realDir);
    const linkPath = path.join(dir, "link");
    symlinkSync(realDir, linkPath);
    expect(() => assertEmptyTarget(linkPath)).toThrow(/symlink/);
  });
});

describe("warnIfNodeTooOld", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("warns, mentioning the offending version and the fix, on a pre-24 major", () => {
    warnIfNodeTooOld("22.14.0");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toContain("22.14.0");
    expect(message).toContain("nvm install 24");
  });

  it("stays silent on Node 24 and above", () => {
    warnIfNodeTooOld("24.0.0");
    warnIfNodeTooOld("25.1.2");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("never throws on an unparseable version string", () => {
    expect(() => warnIfNodeTooOld("bogus")).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
