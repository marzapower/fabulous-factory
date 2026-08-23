/**
 * Compose engine (npx-installer design spec §5): base + payload + preset → one composed
 * project tree. Pure orchestration over `compose.config.ts`'s declarative lists; the only
 * "heuristic" is the dynamic `packages/*` / `.prettierrc*` scans, both explicitly called
 * out as dynamic in that file's comments. Never called by the published CLI at install
 * time — `compose-build.ts` (this module's only caller) runs at publish/dev time only.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  BASE_EXCLUDED_FILES,
  BASE_EXCLUDED_PACKAGES,
  BASE_STATIC_ENTRIES,
  DB_MIGRATIONS_DIR,
  DB_PACKAGE_NAME,
  OUTPUT_APP_DIR,
  PAYLOAD_AGENTS_DIR,
  PAYLOAD_LAUNCH_SRC,
  PAYLOAD_SKILLS_DIR,
  PAYLOAD_STATIC_ENTRIES,
  PRESET_LAUNCH_ITEMS_OVERLAY,
  PRESET_LOCKFILE_CAPTURE,
  PRESET_PRODUCT_MD_OVERLAY,
  PRETTIERRC_PREFIX,
  VARIANT_DOCKERFILE_DEST,
  VARIANT_ENTRIES,
  type CopyEntry,
} from "./compose.config";
import { stampDockerfileDomainPackages } from "./lib/dockerfile-stamp";
import { copyRecursive } from "./lib/fs";
import { mergeLaunchChecklist } from "./lib/launch-merge";
import { listPresets, type PresetMeta } from "./presets";

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

/**
 * Union of every preset's `packages` (domain package dir names), across ALL presets, sorted.
 * These ship only via the composing preset's own claim (see `composeDomainPackages`), never
 * via `composeBase`'s generic `packages/*` scan — a preset's compose output must never leak
 * another preset's domain package.
 */
export function allDomainPackages(repoRoot: string): string[] {
  const union = new Set<string>();
  for (const preset of listPresets(repoRoot)) {
    for (const pkgName of preset.packages) union.add(pkgName);
  }
  return [...union].sort();
}

/**
 * Absolute paths of `packages/db/migrations/<domain>` subdirectories NOT claimed by `preset`
 * — excluded when copying `packages/db` so a preset never ships another preset's migration
 * chain. Discovers domain chains on disk the same way
 * `packages/db/scripts/migrate.ts`'s `discoverDomainChains` does (an immediate subdirectory
 * of `migrations/` with its own `meta/_journal.json`), rather than trusting
 * `preset.packages`/`allDomainPackages` alone — an orphan chain (a leftover directory, a
 * renamed domain package, a chain generated before its `preset.json` entry lands) has no
 * entry in any preset's `packages` list and must still be excluded, or it would ship,
 * unclaimed, into every preset's scaffold. The shared root chain (files directly under
 * `migrations/`, e.g. `meta/`) is never excluded here — only domain subdirectories.
 */
function unclaimedMigrationDirs(repoRoot: string, preset: PresetMeta): string[] {
  const migrationsDir = path.join(repoRoot, "packages", DB_PACKAGE_NAME, DB_MIGRATIONS_DIR);
  if (!existsSync(migrationsDir)) {
    return [];
  }
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(migrationsDir, name, "meta", "_journal.json")))
    .filter((name) => !preset.packages.includes(name))
    .map((name) => path.resolve(migrationsDir, name));
}

/**
 * Verifies every domain package `preset` claims actually exists under `packages/` in
 * `repoRoot` — the on-disk existence check `validatePresetMeta` deliberately skips (that
 * one is shape-only; this one has the real repo root).
 */
function assertDomainPackagesExist(repoRoot: string, preset: PresetMeta): void {
  for (const pkgName of preset.packages) {
    const dir = path.join(repoRoot, "packages", pkgName);
    if (!existsSync(dir)) {
      throw new Error(
        `Preset "${preset.id}" claims package "${pkgName}" in its "packages" list, but ` +
          `packages/${pkgName} does not exist.`,
      );
    }
  }
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

function composeBase(
  repoRoot: string,
  outDir: string,
  preset: PresetMeta,
  domainPackages: string[],
  warnings: string[],
): void {
  const excludeAbsolutePaths = baseExcludedAbsolutePaths(repoRoot);

  for (const entry of BASE_STATIC_ENTRIES) {
    copyEntry(repoRoot, outDir, entry, warnings, excludeAbsolutePaths);
  }

  // `domainPackages` (every preset's claimed dirs) never ship via this generic scan — each
  // preset's own claim ships separately, via `composeDomainPackages`.
  const basePackages = listBasePackages(repoRoot, [...BASE_EXCLUDED_PACKAGES, ...domainPackages]);
  for (const pkgName of basePackages) {
    const pkgExcludeAbsolutePaths =
      pkgName === DB_PACKAGE_NAME
        ? new Set([...excludeAbsolutePaths, ...unclaimedMigrationDirs(repoRoot, preset)])
        : excludeAbsolutePaths;
    copyRecursive(
      path.join(repoRoot, "packages", pkgName),
      path.join(outDir, "packages", pkgName),
      {
        excludeAbsolutePaths: pkgExcludeAbsolutePaths,
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

/** Copies `preset`'s own claimed domain package(s) — the pruning counterpart of the
 * `domainPackages` exclusion in `composeBase`'s generic `packages/*` scan. */
function composeDomainPackages(repoRoot: string, outDir: string, preset: PresetMeta): void {
  const excludeAbsolutePaths = baseExcludedAbsolutePaths(repoRoot);
  for (const pkgName of preset.packages) {
    copyRecursive(
      path.join(repoRoot, "packages", pkgName),
      path.join(outDir, "packages", pkgName),
      { excludeAbsolutePaths },
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

/** `VARIANT_ENTRIES`' `package.json` `dest` — like `VARIANT_DOCKERFILE_DEST`, singled out
 * because `compose.ts` doesn't copy it fully verbatim: see `composePackageJson`. */
const VARIANT_PACKAGE_JSON_DEST = "package.json";

function composeVariants(
  repoRoot: string,
  outDir: string,
  preset: PresetMeta,
  warnings: string[],
): void {
  for (const entry of VARIANT_ENTRIES) {
    if (entry.dest === VARIANT_DOCKERFILE_DEST) {
      composeDockerfile(repoRoot, outDir, preset, entry, warnings);
    } else if (entry.dest === VARIANT_PACKAGE_JSON_DEST) {
      composePackageJson(repoRoot, outDir, preset, entry, warnings);
    } else {
      copyEntry(repoRoot, outDir, entry, warnings);
    }
  }
}

/**
 * `VARIANT_ENTRIES`' `package.json` copies verbatim, then gets one `db:generate:<domain>`
 * script stamped in per domain package `preset` claims (conventions.md's
 * `pnpm db:generate:<domain>`, e.g. `db:generate:untangle`) — mirrors
 * `composeDockerfile`'s per-preset stamping, for the same reason: a preset's own claimed
 * domain package(s) aren't known until compose time. Inserted directly after the existing
 * generic `db:generate` key (stable key order) rather than appended, so the composed
 * `package.json`'s script list stays deterministic and reads top-to-bottom as "generate
 * everything, then generate this one domain". A preset claiming no domain packages (e.g.
 * `nothing`) is a no-op — the file still copies, just with no `db:generate:*` addition.
 */
function composePackageJson(
  repoRoot: string,
  outDir: string,
  preset: PresetMeta,
  entry: CopyEntry,
  warnings: string[],
): void {
  copyEntry(repoRoot, outDir, entry, warnings);
  if (preset.packages.length === 0) return;

  const destPath = path.join(outDir, entry.dest);
  const pkg = JSON.parse(readFileSync(destPath, "utf8")) as Record<string, unknown>;
  const existingScripts = (pkg.scripts ?? {}) as Record<string, string>;

  const scripts: Record<string, string> = {};
  for (const [key, value] of Object.entries(existingScripts)) {
    scripts[key] = value;
    if (key === "db:generate") {
      for (const pkgName of preset.packages) {
        scripts[`db:generate:${pkgName}`] =
          `pnpm --filter @factory/${pkgName} exec drizzle-kit generate`;
      }
    }
  }
  pkg.scripts = scripts;

  writeFileSync(destPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

/** Stamps `entry` (the Dockerfile variant) with `preset`'s claimed domain package manifest
 * COPY lines in place of the `# preset:domain-package-manifests` marker (spec §5's
 * per-preset package pruning) — everything else about the entry copies verbatim. */
function composeDockerfile(
  repoRoot: string,
  outDir: string,
  preset: PresetMeta,
  entry: CopyEntry,
  warnings: string[],
): void {
  const absSrc = path.join(repoRoot, entry.src);
  if (!existsSync(absSrc)) {
    if (entry.optional) {
      warnings.push(`Skipped missing (optional) compose source: ${entry.src}`);
      return;
    }
    throw new Error(`Missing required compose source: ${entry.src}`);
  }
  const raw = readFileSync(absSrc, "utf8");
  const stamped = stampDockerfileDomainPackages(raw, preset.packages);
  const dest = path.join(outDir, entry.dest);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, stamped);
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
  assertDomainPackagesExist(repoRoot, preset);

  const warnings: string[] = [];
  // Wipe any prior compose output before rebuilding — otherwise a file removed from the
  // source (a squashed migration, a package dropped from `packages/`) would survive as a
  // stale leftover in `outDir` across repeated composes. Safe here because this function's
  // only caller (`compose-build.ts`) has already run `assertOutDirSafe` on any `--out`
  // path, and the default per-preset `outDir` is always `templatesRoot/<preset.id>`, itself
  // under that same guarded root.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const domainPackages = allDomainPackages(repoRoot);

  composeBase(repoRoot, outDir, preset, domainPackages, warnings);
  composeDomainPackages(repoRoot, outDir, preset);
  composePayload(repoRoot, outDir, preset, warnings);
  composeVariants(repoRoot, outDir, preset, warnings);
  composePresetApp(repoRoot, outDir, preset, warnings);
  composeLockfile(repoRoot, outDir, preset, warnings);

  return { warnings };
}
