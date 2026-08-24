/**
 * Golden test (npx-installer design spec §8.2/§9): composes every REAL "available"
 * preset from this repo into a TEMP dir — never the tracked tree (see compose.config.ts's
 * comment on why: nested packages/* copies would otherwise be crawled by the root
 * vitest/eslint/dependency-cruiser configs with regexes that no longer match).
 *
 * Runs the preset-invariant assertions once per preset via `describe.each`, so a new
 * preset is covered automatically the moment it's `listPresets`-visible and "available" —
 * except the LAUNCH.md item count, which is intentionally pinned per preset id in
 * `LAUNCH_ITEM_COUNTS` below: a preset missing from that map fails loudly instead of
 * silently skipping the drift guard.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

/** Pinned drift guard: every "available" preset id MUST have an entry here, or the
 * relevant test below fails explicitly rather than silently passing an undefined check. */
const LAUNCH_ITEM_COUNTS: Record<string, number> = {
  untangle: 9,
  nothing: 8,
  brainstorm: 9,
};

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

const availablePresets: PresetMeta[] = listPresets(repoRoot).filter(
  (preset) => preset.status === "available",
);

const outDirs = new Map<string, string>();
const warningsByPreset = new Map<string, string[]>();

beforeAll(() => {
  if (availablePresets.length === 0) {
    throw new Error('No "available" presets found under presets/ — cannot run the golden test.');
  }
  for (const preset of availablePresets) {
    const outDir = mkdtempSync(
      path.join(tmpdir(), `fabulous-factory-compose-golden-${preset.id}-`),
    );
    const result = composeProject({ repoRoot, preset, outDir });
    outDirs.set(preset.id, outDir);
    warningsByPreset.set(preset.id, result.warnings);
  }
});

afterAll(() => {
  for (const outDir of outDirs.values()) {
    rmSync(outDir, { recursive: true, force: true });
  }
});

function read(presetId: string, relPath: string): string {
  const outDir = outDirs.get(presetId);
  if (!outDir) throw new Error(`No composed output for preset "${presetId}".`);
  return readFileSync(path.join(outDir, relPath), "utf8");
}

describe.each(availablePresets)("compose $id — adopter instruction set", (preset) => {
  it("ships an adopter CLAUDE.md at root (not the factory-dev one)", () => {
    const content = read(preset.id, "CLAUDE.md");
    expect(content).toContain("docs/agents/conventions.md");
    expect(content).not.toContain("factory-dev");
  });

  it("ships AGENTS.md with the conventions pointer", () => {
    expect(read(preset.id, "AGENTS.md")).toContain("docs/agents/conventions.md");
  });

  it('ships .factory/config.json exactly {"stage":"prototype"}', () => {
    // Provenance (preset/factoryVersion) is stamped at INSTALL time (`install.ts`'s
    // `stampProvenance`), not compose time — the composed template output is unchanged.
    expect(JSON.parse(read(preset.id, ".factory/config.json"))).toEqual({ stage: "prototype" });
  });

  it("ships .factory/sync-manifest.json (payload/.factory/sync-manifest.json)", () => {
    expect(JSON.parse(read(preset.id, ".factory/sync-manifest.json"))).toEqual({
      version: 1,
      paths: ["packages/core/", "eslint.factory-rules.mjs"],
    });
  });
});

describe.each(availablePresets)("compose $id — LAUNCH.md merge", (preset) => {
  it("parses to the pinned item count (shape-generic + the preset's overlay fragment)", () => {
    const count = LAUNCH_ITEM_COUNTS[preset.id];
    expect(
      count,
      `no pinned LAUNCH_ITEM_COUNTS entry for preset "${preset.id}" — add one (this is the drift guard)`,
    ).toBeDefined();
    expect(countLaunchItems(read(preset.id, "LAUNCH.md"))).toBe(count);
  });
});

describe.each(availablePresets)("compose $id — skills and agents tiering", (preset) => {
  it("ships exactly the 7 adopter + 2 shared skills, none of the 3 factory-dev skills", () => {
    const skills = readdirSync(path.join(outDirs.get(preset.id)!, ".claude/skills")).sort();
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
    const agents = readdirSync(path.join(outDirs.get(preset.id)!, ".claude/agents")).sort();
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

describe.each(availablePresets)("compose $id — preset app rename", (preset) => {
  it("renames the preset app to apps/web with package.json name 'web'", () => {
    const pkg = JSON.parse(read(preset.id, "apps/web/package.json"));
    expect(pkg.name).toBe("web");
  });
});

describe.each(availablePresets)("compose $id — never-shipped paths", (preset) => {
  it("ships none of payload/, presets/, packages/create*, docs/superpowers, docs/adr", () => {
    for (const forbidden of [
      "payload",
      "presets",
      "packages/create",
      "packages/create-alias",
      "docs/superpowers",
      "docs/adr",
    ]) {
      expect(existsSync(path.join(outDirs.get(preset.id)!, forbidden))).toBe(false);
    }
  });
});

describe.each(availablePresets)("compose $id — factory-maintainer-only exclusions", (preset) => {
  it("ships none of the factory-only test/doc files (BASE_EXCLUDED_FILES)", () => {
    for (const excluded of [
      "packages/config/test/factory-docs.test.ts",
      "packages/config/test/factory-agents.test.ts",
      "packages/config/test/launch-checklist-drift.test.ts",
      "docs/guides/release-checklist.md",
    ]) {
      expect(existsSync(path.join(outDirs.get(preset.id)!, excluded))).toBe(false);
    }
  });

  it("no file under packages/config/test references payload/ or presets/", () => {
    const testDir = path.join(outDirs.get(preset.id)!, "packages/config/test");
    for (const file of collectFiles(testDir)) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(/payload\//);
      expect(content).not.toMatch(/presets\//);
    }
  });
});

describe.each(availablePresets)("compose $id — security & docker config", (preset) => {
  it("ships .gitleaks.toml", () => {
    expect(existsSync(path.join(outDirs.get(preset.id)!, ".gitleaks.toml"))).toBe(true);
  });

  it("ships .dockerignore", () => {
    expect(existsSync(path.join(outDirs.get(preset.id)!, ".dockerignore"))).toBe(true);
  });
});

describe.each(availablePresets)("compose $id — secret hygiene", (preset) => {
  it("ships .env.example but sweeps clean of every other secret-shaped file", () => {
    const outDir = outDirs.get(preset.id)!;
    expect(existsSync(path.join(outDir, ".env.example"))).toBe(true);

    for (const file of collectFiles(outDir)) {
      const name = path.basename(file);
      if (name === ".env.example") continue;
      expect(name).not.toMatch(/^\.env(\..+)?$/);
      expect(name).not.toMatch(/\.(pem|key|p12)$/);
      // The one sanctioned exception: the adopter variant `.npmrc` (payload/variants/.npmrc)
      // carries no secret — just a why-comment plus `engine-strict=true` — pinned exactly,
      // so any future content drift (e.g. a registry token accidentally added) fails this
      // test loudly.
      if (name === ".npmrc") {
        expect(readFileSync(file, "utf8")).toBe(
          '# Refuse installs on a Node version outside this repo\'s package.json "engines" range (>=24).\nengine-strict=true\n',
        );
        continue;
      }
      expect(name).not.toMatch(/^id_rsa/);
    }
  });

  it("ships no husky-internal .husky/_ hook-runner directory", () => {
    expect(existsSync(path.join(outDirs.get(preset.id)!, ".husky", "_"))).toBe(false);
  });
});

describe.each(availablePresets)(
  "compose $id — gitignore stays undotted in the template",
  (preset) => {
    it('ships "gitignore" (undotted) at root, not ".gitignore"', () => {
      const outDir = outDirs.get(preset.id)!;
      expect(existsSync(path.join(outDir, "gitignore"))).toBe(true);
      expect(existsSync(path.join(outDir, ".gitignore"))).toBe(false);
    });
  },
);

describe.each(availablePresets)("compose $id — root package.json variant", (preset) => {
  it('has name "fabulous-factory-app" (the install-time stamp placeholder)', () => {
    const pkg = JSON.parse(read(preset.id, "package.json"));
    expect(pkg.name).toBe("fabulous-factory-app");
  });

  it("scripts target the renamed app via --filter web, not the preset's original app name", () => {
    const pkg = JSON.parse(read(preset.id, "package.json"));
    const scripts = Object.values(pkg.scripts ?? {}) as string[];
    const originalAppName = path.basename(preset.appDir);
    expect(scripts.some((script) => script.includes("--filter web"))).toBe(true);
    expect(scripts.some((script) => script.includes(`--filter ${originalAppName}`))).toBe(false);
  });
});

describe.each(availablePresets)("compose $id — other root variants", (preset) => {
  it("ships a Dockerfile (payload/variants/Dockerfile)", () => {
    expect(existsSync(path.join(outDirs.get(preset.id)!, "Dockerfile"))).toBe(true);
  });

  it("ships .github/workflows/ci.yml (payload/variants/ci.yml)", () => {
    expect(existsSync(path.join(outDirs.get(preset.id)!, ".github/workflows/ci.yml"))).toBe(true);
  });

  it("ships a README.md (payload/variants/README.md)", () => {
    expect(existsSync(path.join(outDirs.get(preset.id)!, "README.md"))).toBe(true);
  });

  it("ships a renovate.json (payload/variants/renovate.json)", () => {
    expect(existsSync(path.join(outDirs.get(preset.id)!, "renovate.json"))).toBe(true);
  });

  it("ships .npmrc with its why-comment and engine-strict=true (payload/variants/.npmrc)", () => {
    expect(read(preset.id, ".npmrc")).toBe(
      '# Refuse installs on a Node version outside this repo\'s package.json "engines" range (>=24).\nengine-strict=true\n',
    );
  });

  it("ships .nvmrc pinning Node 24, so nvm/fnm users comply automatically (payload/variants/.nvmrc)", () => {
    expect(read(preset.id, ".nvmrc")).toBe("24\n");
  });

  // Regression guard: the root vitest config's "benchmarks" project is factory-dev-only and
  // never ships, and vitest hard-fails at startup on a projects entry that doesn't resolve —
  // an unconditional entry killed the scaffold's `pnpm test` before a single test ran, so
  // every non-glob project must be gated on the directory actually being present.
  it("ships a vitest config with no unconditional project that the scaffold lacks", () => {
    // Whitespace-normalized so the assertion pins the gate itself, not prettier's wrapping.
    const config = read(preset.id, "vitest.config.ts").replace(/\s+/g, "");
    expect(existsSync(path.join(outDirs.get(preset.id)!, "benchmarks"))).toBe(false);
    expect(config).toContain(
      'projects:["packages/*","apps/*",...(existsSync(benchmarksDir)?["benchmarks"]:[])]',
    );
  });
});

describe.each(availablePresets)("compose $id — compose warnings", (preset) => {
  it("only ever warns about the lockfile (never a silent required-source skip)", () => {
    const warnings = warningsByPreset.get(preset.id) ?? [];
    for (const warning of warnings) {
      expect(warning).toMatch(/pnpm-lock\.captured\.yaml/);
    }
  });
});

/** Union of every "available" preset's claimed domain packages — the pruning invariants
 * below assert each preset ships its own claim and nobody else's. */
const domainPackages = [...new Set(availablePresets.flatMap((preset) => preset.packages))].sort();

/** Recursively lists every DIRECTORY (never a file) directly under `dir`, by name. */
function listSubdirNames(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe.each(availablePresets)("compose $id — per-preset domain package pruning", (preset) => {
  it("ships its own claimed domain package(s), never another preset's", () => {
    const outDir = outDirs.get(preset.id)!;
    for (const pkgName of preset.packages) {
      expect(existsSync(path.join(outDir, "packages", pkgName))).toBe(true);
    }
    for (const pkgName of domainPackages) {
      if (preset.packages.includes(pkgName)) continue;
      expect(existsSync(path.join(outDir, "packages", pkgName))).toBe(false);
    }
  });

  it("packages/db/migrations ships the shared chain plus exactly its claimed domain subdirs", () => {
    const outDir = outDirs.get(preset.id)!;
    const migrationsDir = path.join(outDir, "packages/db/migrations");
    expect(existsSync(migrationsDir)).toBe(true);

    // Shared root chain (e.g. the initial migration + drizzle's meta/) always ships.
    expect(
      readdirSync(migrationsDir).length,
      "packages/db/migrations shipped empty — the shared root chain is missing",
    ).toBeGreaterThan(0);

    const claimedSubdirs = [...preset.packages].sort();
    const shippedDomainSubdirs = listSubdirNames(migrationsDir).filter((name) =>
      domainPackages.includes(name),
    );
    expect(shippedDomainSubdirs).toEqual(claimedSubdirs);
  });

  it("stamps the Dockerfile with exactly its claimed domain COPY lines, marker gone", () => {
    const dockerfile = read(preset.id, "Dockerfile");
    expect(dockerfile).not.toContain("# preset:domain-package-manifests");
    for (const pkgName of preset.packages) {
      expect(dockerfile).toContain(
        `COPY packages/${pkgName}/package.json packages/${pkgName}/package.json`,
      );
    }
    for (const pkgName of domainPackages) {
      if (preset.packages.includes(pkgName)) continue;
      expect(dockerfile).not.toContain(
        `COPY packages/${pkgName}/package.json packages/${pkgName}/package.json`,
      );
    }
  });
});

describe("compose — repeated compose wipes stale output", () => {
  it("removes files a prior compose left behind that the source no longer has", () => {
    const preset = availablePresets[0];
    const outDir = mkdtempSync(path.join(tmpdir(), `fabulous-factory-compose-stale-${preset.id}-`));
    try {
      composeProject({ repoRoot, preset, outDir });

      // Plant stray leftovers of the kind a prior compose (over a since-changed source)
      // could deposit: a domain package no longer claimed by any preset, and a
      // pre-squash migration file.
      const plantedPackageDir = path.join(outDir, "packages/planted");
      mkdirSync(plantedPackageDir, { recursive: true });
      writeFileSync(path.join(plantedPackageDir, "package.json"), "{}\n");

      const migrationsDir = path.join(outDir, "packages/db/migrations");
      mkdirSync(migrationsDir, { recursive: true });
      writeFileSync(path.join(migrationsDir, "stale.sql"), "-- stale\n");

      composeProject({ repoRoot, preset, outDir });

      expect(existsSync(plantedPackageDir)).toBe(false);
      expect(existsSync(path.join(migrationsDir, "stale.sql"))).toBe(false);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("compose — repo-level domain package guard", () => {
  it("packages/db/migrations/* domain subdirectories equal the union of every preset's packages list (an unclaimed chain fails loudly)", () => {
    const migrationsDir = path.join(repoRoot, "packages/db/migrations");
    // No `domainPackages.includes(...)` filter here — that would silently drop exactly
    // the case this guard exists to catch (an unclaimed chain directory not in any
    // preset's `packages` list). Only `meta/` (the shared chain's own journal dir, not a
    // domain subdirectory) is excluded from the comparison.
    const actualDomainSubdirs = listSubdirNames(migrationsDir).filter((name) => name !== "meta");
    expect(actualDomainSubdirs).toEqual(domainPackages);
  });
});
