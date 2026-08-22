/**
 * Compose engine (npx-installer design spec §5): base + payload + preset → one composed
 * project tree. Pure orchestration over `compose.config.ts`'s declarative lists; the only
 * "heuristic" is the dynamic `packages/*` / `.prettierrc*` scans, both explicitly called
 * out as dynamic in that file's comments. Never called by the published CLI at install
 * time — `compose-build.ts` (this module's only caller) runs at publish/dev time only.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  BASE_EXCLUDED_FILES,
  BASE_EXCLUDED_PACKAGES,
  BASE_STATIC_ENTRIES,
  OUTPUT_APP_DIR,
  PAYLOAD_AGENTS_DIR,
  PAYLOAD_LAUNCH_SRC,
  PAYLOAD_SKILLS_DIR,
  PAYLOAD_STATIC_ENTRIES,
  PRESET_LAUNCH_ITEMS_OVERLAY,
  PRESET_LOCKFILE_CAPTURE,
  PRESET_PRODUCT_MD_OVERLAY,
  PRETTIERRC_PREFIX,
  VARIANT_ENTRIES,
  type CopyEntry,
} from "./compose.config";
import { copyRecursive } from "./lib/fs";
import { mergeLaunchChecklist } from "./lib/launch-merge";
import type { PresetMeta } from "./presets";

export interface ComposeOptions {
  repoRoot: string;
  preset: PresetMeta;
  outDir: string;
}

export interface ComposeResult {
  warnings: string[];
}

/** `packages/*` directory names to copy verbatim (spec §5's base), sorted, excludes CLI. */
export function listBasePackages(
  repoRoot: string,
  excluded: string[] = BASE_EXCLUDED_PACKAGES,
): string[] {
  const packagesDir = path.join(repoRoot, "packages");
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !excluded.includes(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/** Root-level filenames matching the `.prettierrc*` glob (config file, not the ignore file). */
export function findPrettierrcFiles(repoRoot: string): string[] {
  return readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(PRETTIERRC_PREFIX))
    .map((entry) => entry.name)
    .sort();
}

function copyEntry(
  repoRoot: string,
  outDir: string,
  entry: CopyEntry,
  warnings: string[],
  excludeAbsolutePaths?: ReadonlySet<string>,
): void {
  const absSrc = path.join(repoRoot, entry.src);
  if (!existsSync(absSrc)) {
    if (entry.optional) {
      warnings.push(`Skipped missing (optional) compose source: ${entry.src}`);
      return;
    }
    throw new Error(`Missing required compose source: ${entry.src}`);
  }
  copyRecursive(absSrc, path.join(outDir, entry.dest), { excludeAbsolutePaths });
}

/** Absolute form of `BASE_EXCLUDED_FILES`, resolved against `repoRoot` — see that constant. */
function baseExcludedAbsolutePaths(repoRoot: string): Set<string> {
  return new Set(BASE_EXCLUDED_FILES.map((relPath) => path.resolve(repoRoot, relPath)));
}

function composeBase(repoRoot: string, outDir: string, warnings: string[]): void {
  const excludeAbsolutePaths = baseExcludedAbsolutePaths(repoRoot);

  for (const entry of BASE_STATIC_ENTRIES) {
    copyEntry(repoRoot, outDir, entry, warnings, excludeAbsolutePaths);
  }

  for (const pkgName of listBasePackages(repoRoot)) {
    copyRecursive(
      path.join(repoRoot, "packages", pkgName),
      path.join(outDir, "packages", pkgName),
      {
        excludeAbsolutePaths,
      },
    );
  }

  for (const name of findPrettierrcFiles(repoRoot)) {
    copyEntry(
      repoRoot,
      outDir,
      { src: name, dest: name, optional: true },
      warnings,
      excludeAbsolutePaths,
    );
  }
}

function composePayload(
  repoRoot: string,
  outDir: string,
  preset: PresetMeta,
  warnings: string[],
): void {
  for (const entry of PAYLOAD_STATIC_ENTRIES) copyEntry(repoRoot, outDir, entry, warnings);
  copyEntry(repoRoot, outDir, PAYLOAD_AGENTS_DIR, warnings);
  copyEntry(repoRoot, outDir, PAYLOAD_SKILLS_DIR, warnings);
  composeLaunchMd(repoRoot, outDir, preset);
}

function composeLaunchMd(repoRoot: string, outDir: string, preset: PresetMeta): void {
  const basePayload = readFileSync(path.join(repoRoot, PAYLOAD_LAUNCH_SRC), "utf8");
  const overlayPath = path.join(repoRoot, preset.sourceDir, PRESET_LAUNCH_ITEMS_OVERLAY);
  if (!existsSync(overlayPath)) {
    throw new Error(
      `Missing required compose source: ${path.join(preset.sourceDir, PRESET_LAUNCH_ITEMS_OVERLAY)}`,
    );
  }
  const fragment = readFileSync(overlayPath, "utf8");
  const merged = mergeLaunchChecklist(basePayload, fragment);
  const dest = path.join(outDir, "LAUNCH.md");
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, merged);
}

function composeVariants(repoRoot: string, outDir: string, warnings: string[]): void {
  for (const entry of VARIANT_ENTRIES) copyEntry(repoRoot, outDir, entry, warnings);
}

function composePresetApp(
  repoRoot: string,
  outDir: string,
  preset: PresetMeta,
  warnings: string[],
): void {
  const absAppDir = path.join(repoRoot, preset.appDir);
  if (!existsSync(absAppDir)) {
    throw new Error(`Preset "${preset.id}" appDir not found: ${preset.appDir}`);
  }
  const destAppDir = path.join(outDir, OUTPUT_APP_DIR);
  copyRecursive(absAppDir, destAppDir);

  const pkgPath = path.join(destAppDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
  pkg.name = "web";
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  copyEntry(
    repoRoot,
    outDir,
    { src: path.join(preset.sourceDir, PRESET_PRODUCT_MD_OVERLAY), dest: "PRODUCT.md" },
    warnings,
  );
}

function composeLockfile(
  repoRoot: string,
  outDir: string,
  preset: PresetMeta,
  warnings: string[],
): void {
  const capturePath = path.join(preset.sourceDir, PRESET_LOCKFILE_CAPTURE);
  if (existsSync(path.join(repoRoot, capturePath))) {
    copyRecursive(path.join(repoRoot, capturePath), path.join(outDir, "pnpm-lock.yaml"));
  } else {
    warnings.push(
      `No captured lockfile at ${capturePath} — the "${preset.id}" template ships without pnpm-lock.yaml.`,
    );
  }
}

/** Composes `preset` (must be `status: "available"`) into `outDir`. Never touches `repoRoot`. */
export function composeProject(options: ComposeOptions): ComposeResult {
  const { repoRoot, preset, outDir } = options;
  if (preset.status !== "available") {
    throw new Error(
      `Preset "${preset.id}" is not available (status: ${preset.status}) and cannot be composed.`,
    );
  }

  const warnings: string[] = [];
  mkdirSync(outDir, { recursive: true });

  composeBase(repoRoot, outDir, warnings);
  composePayload(repoRoot, outDir, preset, warnings);
  composeVariants(repoRoot, outDir, warnings);
  composePresetApp(repoRoot, outDir, preset, warnings);
  composeLockfile(repoRoot, outDir, preset, warnings);

  return { warnings };
}
