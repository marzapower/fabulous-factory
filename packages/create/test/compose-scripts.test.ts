/**
 * Focused counterpart to compose.golden.test.ts (npx-installer design spec §5): asserts
 * `composeVariants`' `db:generate:<domain>` package.json stamp (conventions.md's
 * `pnpm db:generate:<domain>`) lands exactly per preset — one command per domain package
 * the preset claims, none for a preset that claims none. Composes every REAL "available"
 * preset from this repo into a TEMP dir, same convention as the golden test.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { composeProject } from "../src/compose";
import { listPresets, type PresetMeta } from "../src/presets";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const availablePresets: PresetMeta[] = listPresets(repoRoot).filter(
  (preset) => preset.status === "available",
);

const outDirs = new Map<string, string>();

beforeAll(() => {
  if (availablePresets.length === 0) {
    throw new Error('No "available" presets found under presets/ — cannot run this test.');
  }
  for (const preset of availablePresets) {
    const outDir = mkdtempSync(
      path.join(tmpdir(), `fabulous-factory-compose-scripts-${preset.id}-`),
    );
    composeProject({ repoRoot, preset, outDir });
    outDirs.set(preset.id, outDir);
  }
});

afterAll(() => {
  for (const outDir of outDirs.values()) {
    rmSync(outDir, { recursive: true, force: true });
  }
});

function readComposedPackageJson(presetId: string): { scripts?: Record<string, string> } {
  const outDir = outDirs.get(presetId);
  if (!outDir) throw new Error(`No composed output for preset "${presetId}".`);
  return JSON.parse(readFileSync(path.join(outDir, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
}

function findPreset(id: string): PresetMeta {
  const preset = availablePresets.find((p) => p.id === id);
  if (!preset) throw new Error(`Preset "${id}" is not an available preset in this repo.`);
  return preset;
}

describe("compose — package.json db:generate:<domain> stamp", () => {
  it("untangle composes with db:generate:untangle exactly", () => {
    findPreset("untangle"); // fails loudly if the preset is ever renamed/removed
    const { scripts } = readComposedPackageJson("untangle");
    expect(scripts?.["db:generate:untangle"]).toBe(
      "pnpm --filter @factory/untangle exec drizzle-kit generate",
    );
  });

  it("brainstorm composes with db:generate:brainstorm exactly", () => {
    findPreset("brainstorm");
    const { scripts } = readComposedPackageJson("brainstorm");
    expect(scripts?.["db:generate:brainstorm"]).toBe(
      "pnpm --filter @factory/brainstorm exec drizzle-kit generate",
    );
  });

  it("nothing composes with no db:generate:* beyond the generic db:generate (claims no domain packages)", () => {
    const preset = findPreset("nothing");
    expect(preset.packages).toEqual([]);
    const { scripts } = readComposedPackageJson("nothing");
    const dbGenerateKeys = Object.keys(scripts ?? {}).filter((key) =>
      key.startsWith("db:generate"),
    );
    expect(dbGenerateKeys).toEqual(["db:generate"]);
  });

  it("every composed preset keeps the generic db:generate script untouched", () => {
    for (const preset of availablePresets) {
      const { scripts } = readComposedPackageJson(preset.id);
      expect(scripts?.["db:generate"]).toBe("pnpm --filter @factory/db exec drizzle-kit generate");
    }
  });

  it("stamps every domain package a preset claims, in claim order, right after db:generate", () => {
    for (const preset of availablePresets) {
      if (preset.packages.length === 0) continue;
      const { scripts } = readComposedPackageJson(preset.id);
      const keys = Object.keys(scripts ?? {});
      const generateIndex = keys.indexOf("db:generate");
      expect(generateIndex).toBeGreaterThanOrEqual(0);
      const stampedKeys = preset.packages.map((pkgName) => `db:generate:${pkgName}`);
      expect(keys.slice(generateIndex + 1, generateIndex + 1 + stampedKeys.length)).toEqual(
        stampedKeys,
      );
      for (const pkgName of preset.packages) {
        expect(scripts?.[`db:generate:${pkgName}`]).toBe(
          `pnpm --filter @factory/${pkgName} exec drizzle-kit generate`,
        );
      }
    }
  });
});
