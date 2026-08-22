/**
 * CLI integration test (npx-installer design spec §9): drives the actual bin — via `tsx`
 * against source, no build required — with `--yes --no-install --no-git`, and asserts the
 * resulting tree.
 *
 * Composes every REAL "available" preset into a scratch templates dir (never the tracked
 * `packages/create/templates/`) and points the spawned CLI at it via
 * `FABULOUS_FACTORY_TEMPLATES_DIR` (`install.ts`'s test-only override, spec §6) — this
 * suite never touches or `rmSync`s the repo's own `packages/create/templates/`. Manifest
 * covers every preset (not just "available") so the multi-preset ambiguity path below is
 * exercised the same way the real CLI would see it.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { composeProject } from "../src/compose";
import { listPresets } from "../src/presets";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cliEntry = path.join(repoRoot, "packages/create/src/cli.ts");
const tsxBin = path.join(repoRoot, "node_modules/.bin/tsx");

let templatesDir: string;
let scratchDir: string;
let presets: ReturnType<typeof listPresets>;

beforeAll(() => {
  templatesDir = mkdtempSync(path.join(tmpdir(), "fabulous-factory-cli-templates-"));
  presets = listPresets(repoRoot);
  const available = presets.filter((preset) => preset.status === "available");
  if (available.length === 0) {
    throw new Error(
      'No "available" presets found under presets/ — cannot run the CLI integration test.',
    );
  }
  for (const preset of available) {
    composeProject({ repoRoot, preset, outDir: path.join(templatesDir, preset.id) });
  }
  writeFileSync(
    path.join(templatesDir, "presets.json"),
    `${JSON.stringify(
      presets.map(({ id, label, description, status }) => ({ id, label, description, status })),
      null,
      2,
    )}\n`,
  );

  scratchDir = mkdtempSync(path.join(tmpdir(), "fabulous-factory-cli-test-"));
});

afterAll(() => {
  rmSync(templatesDir, { recursive: true, force: true });
  rmSync(scratchDir, { recursive: true, force: true });
});

function runEntry(entry: string, args: string[]): string {
  return execFileSync(tsxBin, [entry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, FABULOUS_FACTORY_TEMPLATES_DIR: templatesDir },
  });
}

function runCli(args: string[]): string {
  return runEntry(cliEntry, args);
}

describe("fabulous-factory install --yes --no-install --no-git", () => {
  it("scaffolds into --dir, dots gitignore, and prints next steps", () => {
    const target = path.join(scratchDir, "my-app");

    const output = runCli([
      "install",
      "--yes",
      "--no-install",
      "--no-git",
      "--dir",
      target,
      "--preset",
      "untangle",
    ]);

    expect(existsSync(path.join(target, ".gitignore"))).toBe(true);
    expect(existsSync(path.join(target, "gitignore"))).toBe(false);
    expect(output).toContain("pnpm dev");
  });

  it("stamps the project name into root package.json", () => {
    const target = path.join(scratchDir, "stamp-check");
    runCli([
      "install",
      "--yes",
      "--no-install",
      "--no-git",
      "--dir",
      target,
      "--preset",
      "untangle",
    ]);

    const pkg = JSON.parse(readFileSync(path.join(target, "package.json"), "utf8"));
    expect(pkg.name).toBe("stamp-check");
  });

  it("refuses to scaffold into a non-empty target directory, leaving it untouched", () => {
    const target = path.join(scratchDir, "occupied");
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "existing.txt"), "hi");

    expect(() =>
      runCli([
        "install",
        "--yes",
        "--no-install",
        "--no-git",
        "--dir",
        target,
        "--preset",
        "untangle",
      ]),
    ).toThrow();

    // Untouched: still exactly the one pre-existing file, no partial scaffold dropped in.
    expect(existsSync(path.join(target, "existing.txt"))).toBe(true);
    expect(existsSync(path.join(target, "CLAUDE.md"))).toBe(false);
  });

  it("scaffolds when invoked through a symlink to cli.ts (npm/pnpm symlinked bin simulation)", () => {
    const symlinkPath = path.join(scratchDir, "fabulous-factory-symlink.ts");
    symlinkSync(cliEntry, symlinkPath);
    const target = path.join(scratchDir, "symlink-target");

    runEntry(symlinkPath, [
      "install",
      "--yes",
      "--no-install",
      "--no-git",
      "--dir",
      target,
      "--preset",
      "untangle",
    ]);

    expect(existsSync(path.join(target, ".gitignore"))).toBe(true);
  });

  it("scaffolds via a bin.js-style proxy (dynamic import + explicit main())", () => {
    const proxyPath = path.join(scratchDir, "proxy.mjs");
    const cliUrl = pathToFileURL(cliEntry).href;
    writeFileSync(
      proxyPath,
      `const { main } = await import(${JSON.stringify(cliUrl)});\nawait main();\n`,
    );
    const target = path.join(scratchDir, "proxy-target");

    runEntry(proxyPath, [
      "install",
      "--yes",
      "--no-install",
      "--no-git",
      "--dir",
      target,
      "--preset",
      "untangle",
    ]);

    expect(existsSync(path.join(target, ".gitignore"))).toBe(true);
  });

  // One full install run on a second preset, bounding runtime (spec §9): this doesn't
  // repeat every assertion above per preset — the untangle runs already cover the CLI's
  // general behavior — it just proves a non-default preset installs end to end too.
  it("scaffolds the brainstorm preset end to end", () => {
    const target = path.join(scratchDir, "brainstorm-app");

    const output = runCli([
      "install",
      "--yes",
      "--no-install",
      "--no-git",
      "--dir",
      target,
      "--preset",
      "brainstorm",
    ]);

    expect(existsSync(path.join(target, ".gitignore"))).toBe(true);
    expect(existsSync(path.join(target, "gitignore"))).toBe(false);
    expect(output).toContain("pnpm dev");
  });

  it("`--yes` without `--preset` fails with the multi-preset ambiguity error", () => {
    const target = path.join(scratchDir, "no-preset-ambiguous");
    const availableIds = presets
      .filter((preset) => preset.status === "available")
      .map((preset) => preset.id)
      .join(", ");

    expect(() => runCli(["install", "--yes", "--no-install", "--no-git", "--dir", target])).toThrow(
      `Multiple presets are available (${availableIds}) — pass --preset <id> to choose one.`,
    );

    expect(existsSync(target)).toBe(false);
  });
});
