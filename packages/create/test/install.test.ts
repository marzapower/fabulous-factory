import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertEmptyTarget,
  derivePickerDefault,
  install,
  warnIfNodeTooOld,
  type PresetManifestEntry,
} from "../src/install";
import { MissingToolError, type ToolProbe } from "../src/lib/tool-preflight";

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

// `install()`'s injectable `probe` argument lets these tests force specific preflight
// outcomes without depending on what's actually installed on the machine running the
// suite — including proving that a missing-pnpm failure happens early enough that
// nothing is scaffolded, even though a valid `--dir`/preset were given.
describe("install (preflight)", () => {
  let templatesDir: string;
  let scratchDir: string;
  let previousTemplatesDirEnv: string | undefined;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWrites: string[];

  function stdoutOutput(): string {
    return stdoutWrites.join("");
  }

  beforeEach(() => {
    templatesDir = mkdtempSync(path.join(tmpdir(), "install-preflight-templates-"));
    const presetDir = path.join(templatesDir, "demo");
    mkdirSync(presetDir, { recursive: true });
    writeFileSync(
      path.join(presetDir, "package.json"),
      `${JSON.stringify({ name: "fabulous-factory-app", version: "0.0.0" }, null, 2)}\n`,
    );
    // `stampProvenance` writes into `.factory/config.json` post-copy without creating the
    // directory itself — the real templates always ship it (the compose-time seed), so the
    // fixture needs it too for any test that reaches the copy step.
    mkdirSync(path.join(presetDir, ".factory"), { recursive: true });
    writeFileSync(
      path.join(presetDir, ".factory", "config.json"),
      `${JSON.stringify({ stage: "prototype" }, null, 2)}\n`,
    );
    writeFileSync(
      path.join(templatesDir, "presets.json"),
      `${JSON.stringify(
        [{ id: "demo", label: "Demo", description: "d", status: "available" }],
        null,
        2,
      )}\n`,
    );

    scratchDir = mkdtempSync(path.join(tmpdir(), "install-preflight-scratch-"));

    previousTemplatesDirEnv = process.env.FABULOUS_FACTORY_TEMPLATES_DIR;
    process.env.FABULOUS_FACTORY_TEMPLATES_DIR = templatesDir;

    // Preflight and the final next-steps message both print via clack (intro / reportTools
    // / note / outro) straight to stdout — collect the writes instead of letting them hit
    // the real terminal, so tests can assert on the rendered text.
    stdoutWrites = [];
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdoutWrites.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    });
  });

  afterEach(() => {
    if (previousTemplatesDirEnv === undefined) {
      delete process.env.FABULOUS_FACTORY_TEMPLATES_DIR;
    } else {
      process.env.FABULOUS_FACTORY_TEMPLATES_DIR = previousTemplatesDirEnv;
    }
    rmSync(templatesDir, { recursive: true, force: true });
    rmSync(scratchDir, { recursive: true, force: true });
    stdoutSpy.mockRestore();
  });

  it("rejects with MissingToolError and scaffolds nothing when pnpm is missing", async () => {
    const target = path.join(scratchDir, "x");
    const fakeProbe: ToolProbe = (tool) =>
      tool === "pnpm" ? { status: "missing" } : { status: "ok", version: "1.0.0" };

    await expect(
      install(
        { yes: true, installDeps: false, gitInit: false, dir: target, preset: "demo" },
        fakeProbe,
      ),
    ).rejects.toThrow(MissingToolError);

    expect(existsSync(target)).toBe(false);
  });

  it("scaffolds without git and prints the git-not-installed hint when git is missing", async () => {
    const target = path.join(scratchDir, "x");
    const fakeProbe: ToolProbe = (tool) =>
      tool === "git" ? { status: "missing" } : { status: "ok", version: "1.0.0" };

    await install(
      { yes: true, installDeps: false, gitInit: true, dir: target, preset: "demo" },
      fakeProbe,
    );

    expect(existsSync(path.join(target, ".git"))).toBe(false);
    expect(stdoutOutput()).toContain("git isn't installed");
  });

  it("shows the docker step only when docker is available", async () => {
    const target = path.join(scratchDir, "with-docker");
    const dockerOk: ToolProbe = () => ({ status: "ok", version: "1.0.0" });

    await install(
      { yes: true, installDeps: false, gitInit: false, dir: target, preset: "demo" },
      dockerOk,
    );

    expect(stdoutOutput()).toContain("start Docker first");
  });

  it("shows the generic Postgres hint, not the docker step, when docker is missing", async () => {
    const target = path.join(scratchDir, "without-docker");
    const dockerMissing: ToolProbe = (tool) =>
      tool === "docker" ? { status: "missing" } : { status: "ok", version: "1.0.0" };

    await install(
      { yes: true, installDeps: false, gitInit: false, dir: target, preset: "demo" },
      dockerMissing,
    );

    expect(stdoutOutput()).toContain("any reachable Postgres");
  });
});
