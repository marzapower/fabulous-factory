/**
 * Golden test (npx-installer design spec §8.2/§9): composes the REAL "demo" preset from
 * this repo into a TEMP dir — never the tracked tree (see compose.config.ts's comment on
 * why: nested packages/* copies would otherwise be crawled by the root vitest/eslint/
 * dependency-cruiser configs with regexes that no longer match).
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { composeProject } from "../src/compose";
import { listPresets, type PresetMeta } from "../src/presets";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Mirrors packages/config/scripts/launch-checklist.ts's ITEM_LINE regex (spec: don't
 * import @factory/config from packages/create — it must stay workspace-import-free). */
const LAUNCH_ITEM_LINE = /^## \[( |x|X)\] /;

function countLaunchItems(content: string): number {
  return content.split(/\r?\n/).filter((line) => LAUNCH_ITEM_LINE.test(line)).length;
}

/** Recursively lists every FILE (never a directory) under `dir`, as absolute paths. */
function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else out.push(full);
  }
  return out;
}

let outDir: string;
let warnings: string[];

beforeAll(() => {
  outDir = mkdtempSync(path.join(tmpdir(), "fabulous-factory-compose-golden-"));
  const presets = listPresets(repoRoot);
  const demo = presets.find((preset: PresetMeta) => preset.id === "demo");
  if (!demo) throw new Error("presets/demo/preset.json not found — cannot run the golden test.");
  const result = composeProject({ repoRoot, preset: demo, outDir });
  warnings = result.warnings;
});

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

function read(relPath: string): string {
  return readFileSync(path.join(outDir, relPath), "utf8");
}

describe("compose demo — adopter instruction set", () => {
  it("ships an adopter CLAUDE.md at root (not the factory-dev one)", () => {
    const content = read("CLAUDE.md");
    expect(content).toContain("docs/agents/conventions.md");
    expect(content).not.toContain("factory-dev");
  });

  it("ships AGENTS.md with the conventions pointer", () => {
    expect(read("AGENTS.md")).toContain("docs/agents/conventions.md");
  });

  it('ships .factory/config.json exactly {"stage":"prototype"}', () => {
    expect(JSON.parse(read(".factory/config.json"))).toEqual({ stage: "prototype" });
  });
});

describe("compose demo — LAUNCH.md merge", () => {
  it("parses to exactly 9 items (shape-generic + the demo's 2-item fragment)", () => {
    expect(countLaunchItems(read("LAUNCH.md"))).toBe(9);
  });
});

describe("compose demo — skills and agents tiering", () => {
  it("ships exactly the 7 adopter + 2 shared skills, none of the 3 factory-dev skills", () => {
    const skills = readdirSync(path.join(outDir, ".claude/skills")).sort();
    expect(skills).toEqual(
      [
        "add-a-feature",
        "add-a-job",
        "brand-it",
        "define-product",
        "enable-billing",
        "fabulous-feature",
        "make-it-yours",
        "pre-ship-check",
        "swap-llm-provider",
      ].sort(),
    );
    for (const factoryDev of ["add-integration-package", "write-adr", "release-template"]) {
      expect(skills).not.toContain(factoryDev);
    }
  });

  it("ships exactly the 4 adopter + 3 shared agents, no fab-forge/fab-steward", () => {
    const agents = readdirSync(path.join(outDir, ".claude/agents")).sort();
    expect(agents).toEqual(
      [
        "fab-bastion.md",
        "fab-medic.md",
        "fab-muse.md",
        "fab-preflight.md",
        "fab-scribe.md",
        "fab-smith.md",
        "fab-warden.md",
      ].sort(),
    );
    expect(agents).not.toContain("fab-forge.md");
    expect(agents).not.toContain("fab-steward.md");
  });
});

describe("compose demo — preset app rename", () => {
  it("renames the preset app to apps/web with package.json name 'web'", () => {
    const pkg = JSON.parse(read("apps/web/package.json"));
    expect(pkg.name).toBe("web");
  });
});

describe("compose demo — never-shipped paths", () => {
  it("ships none of payload/, presets/, packages/create*, docs/superpowers, docs/adr", () => {
    for (const forbidden of [
      "payload",
      "presets",
      "packages/create",
      "packages/create-alias",
      "docs/superpowers",
      "docs/adr",
    ]) {
      expect(existsSync(path.join(outDir, forbidden))).toBe(false);
    }
  });
});

describe("compose demo — factory-maintainer-only exclusions", () => {
  it("ships none of the factory-only test/doc files (BASE_EXCLUDED_FILES)", () => {
    for (const excluded of [
      "packages/config/test/factory-docs.test.ts",
      "packages/config/test/factory-agents.test.ts",
      "packages/config/test/launch-checklist-drift.test.ts",
      "docs/guides/release-checklist.md",
    ]) {
      expect(existsSync(path.join(outDir, excluded))).toBe(false);
    }
  });

  it("no file under packages/config/test references payload/ or presets/", () => {
    const testDir = path.join(outDir, "packages/config/test");
    for (const file of collectFiles(testDir)) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(/payload\//);
      expect(content).not.toMatch(/presets\//);
    }
  });
});

describe("compose demo — security & docker config", () => {
  it("ships .gitleaks.toml", () => {
    expect(existsSync(path.join(outDir, ".gitleaks.toml"))).toBe(true);
  });

  it("ships .dockerignore", () => {
    expect(existsSync(path.join(outDir, ".dockerignore"))).toBe(true);
  });
});

describe("compose demo — secret hygiene", () => {
  it("ships .env.example but sweeps clean of every other secret-shaped file", () => {
    expect(existsSync(path.join(outDir, ".env.example"))).toBe(true);

    for (const file of collectFiles(outDir)) {
      const name = path.basename(file);
      if (name === ".env.example") continue;
      expect(name).not.toMatch(/^\.env(\..+)?$/);
      expect(name).not.toMatch(/\.(pem|key|p12)$/);
      expect(name).not.toBe(".npmrc");
      expect(name).not.toMatch(/^id_rsa/);
    }
  });

  it("ships no husky-internal .husky/_ hook-runner directory", () => {
    expect(existsSync(path.join(outDir, ".husky", "_"))).toBe(false);
  });
});

describe("compose demo — gitignore stays undotted in the template", () => {
  it('ships "gitignore" (undotted) at root, not ".gitignore"', () => {
    expect(existsSync(path.join(outDir, "gitignore"))).toBe(true);
    expect(existsSync(path.join(outDir, ".gitignore"))).toBe(false);
  });
});

describe("compose demo — root package.json variant", () => {
  it('has name "fabulous-factory-app" (the install-time stamp placeholder)', () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.name).toBe("fabulous-factory-app");
  });

  it("scripts target the renamed app via --filter web, not --filter demo", () => {
    const pkg = JSON.parse(read("package.json"));
    const scripts = Object.values(pkg.scripts ?? {}) as string[];
    expect(scripts.some((script) => script.includes("--filter web"))).toBe(true);
    expect(scripts.some((script) => script.includes("--filter demo"))).toBe(false);
  });
});

describe("compose demo — other root variants", () => {
  it("ships a Dockerfile (payload/variants/Dockerfile)", () => {
    expect(existsSync(path.join(outDir, "Dockerfile"))).toBe(true);
  });

  it("ships .github/workflows/ci.yml (payload/variants/ci.yml)", () => {
    expect(existsSync(path.join(outDir, ".github/workflows/ci.yml"))).toBe(true);
  });

  it("ships a README.md (payload/variants/README.md)", () => {
    expect(existsSync(path.join(outDir, "README.md"))).toBe(true);
  });
});

describe("compose demo — compose warnings", () => {
  it("only ever warns about the lockfile (never a silent required-source skip)", () => {
    for (const warning of warnings) {
      expect(warning).toMatch(/pnpm-lock\.captured\.yaml/);
    }
  });
});
