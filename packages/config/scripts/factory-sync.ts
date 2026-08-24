#!/usr/bin/env node
/**
 * `pnpm factory:sync` — the patch-channel side of ADR-0006: pulls the manifest-scoped
 * files this repo doesn't own the way `packages/config` owns `ENV_REGISTRY` (currently
 * `packages/core/` and `eslint.factory-rules.mjs` — see `.factory/sync-manifest.json`)
 * forward from the factory version this repo was scaffolded at to a newer one, via a
 * three-way merge against the adopter's own edits. Never touches anything outside the
 * manifest, and never touches itself (`factory-sync.ts` ships with every scaffold but
 * isn't in the manifest — see ADR-0006's self-update limitation).
 *
 * Runs `npm pack fabulous-factory@<version>` for both the "from" and "to" version,
 * extracts each tarball, and diffs their `templates/<preset>/` trees against this repo's
 * working tree. `factory-sync-plan.ts`'s `planSyncActions` is the pure decision logic;
 * everything here is the fs/exec/git side of applying it.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
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

import {
  planSyncActions,
  parseSyncManifest,
  type FileSnapshot,
  type SyncAction,
  type SyncManifest,
} from "./factory-sync-plan";

export interface ParsedSyncArgs {
  to?: string;
  from?: string;
  preset?: string;
  dryRun: boolean;
  allowDirty: boolean;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined) throw new Error(`Missing value for ${flag}`);
  return value;
}

/** Pure — exported for tests. */
export function parseSyncArgs(argv: string[]): ParsedSyncArgs {
  const args: ParsedSyncArgs = { dryRun: false, allowDirty: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--to":
        args.to = requireValue(argv, ++i, "--to");
        break;
      case "--from":
        args.from = requireValue(argv, ++i, "--from");
        break;
      case "--preset":
        args.preset = requireValue(argv, ++i, "--preset");
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--allow-dirty":
        args.allowDirty = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads `.factory/config.json`'s `preset`/`factoryVersion` (ADR-0006's install-time
 * provenance stamp) — missing/unparseable/non-string fields degrade to `undefined`,
 * never throw; `main` turns "still undefined after CLI overrides" into the actionable
 * error. Module-private: `runSync` is the only caller, real fs behavior only, not
 * injectable — see `SyncRunDeps`. */
function readLocalProvenance(repoRoot: string): {
  preset?: string;
  factoryVersion?: string;
} {
  const configPath = path.join(repoRoot, ".factory", "config.json");
  if (!existsSync(configPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    if (!isRecord(parsed)) return {};
    return {
      preset: typeof parsed.preset === "string" ? parsed.preset : undefined,
      factoryVersion: typeof parsed.factoryVersion === "string" ? parsed.factoryVersion : undefined,
    };
  } catch {
    return {};
  }
}

/** Reads and validates `.factory/sync-manifest.json` — missing entirely means this repo
 * predates the sync channel (a pre-ADR-0006 scaffold), a distinct error from a malformed
 * manifest. Module-private, real fs only — see `SyncRunDeps`. */
function readLocalManifest(repoRoot: string): SyncManifest {
  const manifestPath = path.join(repoRoot, ".factory", "sync-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      ".factory/sync-manifest.json is missing — this repo predates the factory:sync channel " +
        "(ADR-0006) and has nothing to sync against.",
    );
  }
  return parseSyncManifest(readFileSync(manifestPath, "utf8"));
}

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z]+\.\d+)?$/;

/** Rejects any version string that isn't strict `major.minor.patch` (optionally
 * `-prerelease.N`) semver or the literal `"latest"` — `fetchPackedVersion` interpolates
 * this straight into `npm pack fabulous-factory@<version>`, and `npm` itself accepts
 * URLs/`git:`/`file:` specs there, so a hand-edited `.factory/config.json` or a `--to`/
 * `--from` flag must not be able to smuggle an arbitrary tarball in as a "version".
 * `source` names where the value came from, for an actionable error. */
export function validateVersionSpec(version: string, source: string): string {
  if (version === "latest" || SEMVER_RE.test(version)) return version;
  throw new Error(
    `Invalid version "${version}" from ${source} — expected strict semver (e.g. "1.2.3" or ` +
      '"1.2.3-beta.1") or the literal "latest".',
  );
}

/** `true` when `git status --porcelain` reports anything at all. Module-private — see
 * `SyncRunDeps`. */
function isGitDirty(repoRoot: string): boolean {
  const output = execFileSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return output.trim().length > 0;
}

/** Recursively collects every file under `rootDir` whose path (relative to `rootDir`,
 * posix-separated) matches one of `prefixes` — walks only the prefix subtrees themselves,
 * never the whole repo, since a `packages/core/`-style prefix can sit inside an otherwise
 * enormous monorepo checkout. Module-private — see `SyncRunDeps`. */
function collectFilesUnderPrefixes(rootDir: string, prefixes: readonly string[]): FileSnapshot {
  const out: Record<string, string> = {};
  for (const prefix of prefixes) {
    if (prefix.endsWith("/")) {
      const absDir = path.join(rootDir, prefix);
      if (!existsSync(absDir)) continue;
      for (const relPath of walkFiles(absDir, prefix)) {
        out[relPath] = readFileSync(path.join(rootDir, relPath), "utf8");
      }
    } else {
      const absFile = path.join(rootDir, prefix);
      // lstatSync (never existsSync + readFileSync, which follows symlinks): an
      // extracted tarball entry could be a symlink pointing outside the extraction dir
      // (e.g. at the adopter's ~/.ssh/id_rsa) — skip anything that isn't a real file,
      // rather than slurping whatever it resolves to into the repo.
      let stat;
      try {
        stat = lstatSync(absFile);
      } catch {
        continue;
      }
      if (stat.isFile()) out[prefix] = readFileSync(absFile, "utf8");
    }
  }
  return out;
}

/** Directory names never descended into during the walk, regardless of depth — generated
 * or installed output that can appear inside a manifest prefix (e.g. `packages/core/`)
 * once dependencies are installed or the app has been built, none of which is source this
 * repo owns or `factory-sync` should ever diff/merge. */
const WALK_EXCLUDED_DIRS = new Set(["node_modules", "dist", ".next", ".turbo"]);

function walkFiles(absDir: string, relPrefix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const relPath = `${relPrefix}${entry.name}`;
    // Dirent#isDirectory()/isFile() report the entry's on-disk dirent type without
    // following it — a symlinked entry (DT_LNK) returns false for both, so it's already
    // silently skipped here, same fix as the exact-file branch above needed explicitly.
    if (entry.isDirectory()) {
      if (WALK_EXCLUDED_DIRS.has(entry.name)) continue;
      out.push(...walkFiles(path.join(absDir, entry.name), `${relPath}/`));
    } else if (entry.isFile()) {
      out.push(relPath);
    }
  }
  return out;
}

/** `npm pack fabulous-factory@<version>` into `workDir`, then extracts the resulting
 * tarball there — returns the extracted package root (`workDir/package`). */
export function fetchPackedVersion(version: string, workDir: string): string {
  mkdirSync(workDir, { recursive: true });
  const output = execFileSync(
    "npm",
    ["pack", `fabulous-factory@${version}`, "--pack-destination", workDir],
    { cwd: workDir, encoding: "utf8" },
  ).trim();
  const lines = output.split("\n").filter((line) => line.length > 0);
  const tarballName = lines[lines.length - 1];
  execFileSync("tar", ["-xzf", path.join(workDir, tarballName), "-C", workDir], { cwd: workDir });
  return path.join(workDir, "package");
}

interface MergeResult {
  content: string;
  conflict: boolean;
}

/** Three-way merge via `git merge-file --stdout` against temp files — never mutates a
 * real file itself; the caller decides whether/where to write the result. A missing
 * `base` (a file added independently on both sides, absent from the common ancestor) is
 * treated as an empty file, same as `git merge-file` would treat a genuinely empty one.
 * Module-private — exercised only indirectly, through `applyActions`/`runSync`. */
function mergeFile(base: string | undefined, target: string, local: string): MergeResult {
  const workDir = mkdtempSync(path.join(tmpdir(), "factory-sync-merge-"));
  try {
    const oursPath = path.join(workDir, "ours");
    const basePath = path.join(workDir, "base");
    const theirsPath = path.join(workDir, "theirs");
    writeFileSync(oursPath, local);
    writeFileSync(basePath, base ?? "");
    writeFileSync(theirsPath, target);

    try {
      const stdout = execFileSync(
        "git",
        [
          "merge-file",
          "--stdout",
          "-L",
          "local",
          "-L",
          "base",
          "-L",
          "upstream",
          oursPath,
          basePath,
          theirsPath,
        ],
        { encoding: "utf8" },
      );
      return { content: stdout, conflict: false };
    } catch (error) {
      const err = error as { stdout?: string; status?: number | null };
      if (typeof err.stdout === "string" && typeof err.status === "number" && err.status > 0) {
        return { content: err.stdout, conflict: true };
      }
      throw error;
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

interface ApplyResult {
  applied: string[];
  skipped: string[];
  conflicts: string[];
}

/** Executes `actions` against `repoRoot` — the only impure counterpart to
 * `planSyncActions`. `dryRun: true` still runs merges (to detect conflicts, via temp
 * files only) but writes nothing to `repoRoot`. Module-private — see `SyncRunDeps`. */
function applyActions(
  actions: readonly SyncAction[],
  repoRoot: string,
  base: FileSnapshot,
  target: FileSnapshot,
  local: FileSnapshot,
  options: { dryRun: boolean },
): ApplyResult {
  const applied: string[] = [];
  const skipped: string[] = [];
  const conflicts: string[] = [];

  for (const action of actions) {
    const absPath = path.join(repoRoot, action.path);
    switch (action.kind) {
      case "skip":
        skipped.push(action.path);
        break;
      case "add":
        if (!options.dryRun) {
          mkdirSync(path.dirname(absPath), { recursive: true });
          writeFileSync(absPath, target[action.path]);
        }
        applied.push(action.path);
        break;
      case "delete":
        if (!options.dryRun) rmSync(absPath, { force: true });
        applied.push(action.path);
        break;
      case "keep-deleted":
        conflicts.push(action.path);
        break;
      case "merge": {
        const result = mergeFile(base[action.path], target[action.path], local[action.path]);
        if (!options.dryRun) {
          mkdirSync(path.dirname(absPath), { recursive: true });
          writeFileSync(absPath, result.content);
        }
        if (result.conflict) conflicts.push(action.path);
        else applied.push(action.path);
        break;
      }
    }
  }

  return { applied, skipped, conflicts };
}

/** Reads the actual resolved version off an extracted package root's own
 * `package.json` — `--to`'s default is the literal string `"latest"`, so this is what
 * actually gets stamped into `.factory/config.json`'s `factoryVersion`. Module-private —
 * see `SyncRunDeps`. */
function readPackedVersion(packageRoot: string): string {
  const pkg = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
    version?: string;
  };
  if (!pkg.version) throw new Error(`${packageRoot}/package.json has no "version" field.`);
  return pkg.version;
}

/** Updates `.factory/config.json`'s `factoryVersion` in place, preserving every other
 * field (`stage`, `preset`) — mirrors `provenance-stamp.ts`'s posture in `packages/create`
 * (never throws on a missing/malformed file; a missing file just becomes `{}` first).
 * Module-private — see `SyncRunDeps`. */
function stampFactoryVersion(repoRoot: string, version: string): void {
  const configPath = path.join(repoRoot, ".factory", "config.json");
  let parsed: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
      if (isRecord(raw)) parsed = raw;
    } catch {
      parsed = {};
    }
  }
  parsed.factoryVersion = version;
  writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function printSummary(result: ApplyResult, dryRun: boolean): void {
  console.log(`factory:sync${dryRun ? " (dry run)" : ""}`);
  console.log(`  applied:   ${result.applied.length}`);
  for (const relPath of result.applied) console.log(`    ${relPath}`);
  console.log(`  skipped:   ${result.skipped.length}`);
  console.log(`  conflicts: ${result.conflicts.length}`);
  for (const relPath of result.conflicts) console.log(`    ${relPath}`);
}

/** The one effectful collaborator `runSync` needs injectable so its orchestration —
 * notably the version-bump rule — is unit-testable without `npm pack`/network. Every
 * other collaborator (`isGitDirty`, `readLocalProvenance`, `readLocalManifest`,
 * `collectFilesUnderPrefixes`, `applyActions`, `stampFactoryVersion`,
 * `readPackedVersion`) is real-fs-backed and module-private; a test fakes only
 * `fetchPackedVersion` (the network call) and exercises the rest for real against a
 * throwaway repo root. */
export interface SyncRunDeps {
  fetchPackedVersion: typeof fetchPackedVersion;
}

const defaultSyncRunDeps: SyncRunDeps = {
  fetchPackedVersion,
};

export interface RunSyncResult {
  applied: string[];
  skipped: string[];
  conflicts: string[];
  /** Exit code `main` should surface: 1 when any conflict remains, 0 otherwise. */
  exitCode: number;
  /** The version `.factory/config.json`'s `factoryVersion` was stamped to —
   * `undefined` only for a `--dry-run`, which never stamps. */
  stampedVersion?: string;
}

/** The apply-and-stamp orchestration `main` used to run inline: resolves provenance,
 * fetches both snapshots, plans and applies the sync, then stamps `factoryVersion`.
 * `deps` defaults to the real implementations — `main` calls this with no overrides. */
export function runSync(
  repoRoot: string,
  args: ParsedSyncArgs,
  deps: Partial<SyncRunDeps> = {},
): RunSyncResult {
  const d: SyncRunDeps = { ...defaultSyncRunDeps, ...deps };

  if (!args.allowDirty && isGitDirty(repoRoot)) {
    throw new Error(
      "factory:sync refuses to run on a dirty working tree — commit or stash first, or pass " +
        "--allow-dirty.",
    );
  }

  const provenance = readLocalProvenance(repoRoot);
  const presetId = args.preset ?? provenance.preset;
  const fromVersion = args.from ?? provenance.factoryVersion;

  if (!presetId || !fromVersion) {
    throw new Error(
      "factory:sync couldn't determine this repo's preset/factoryVersion from " +
        ".factory/config.json (a pre-provenance 0.2.0 scaffold, or a hand-edited file) — " +
        "pass both --from <version> and --preset <id> explicitly.",
    );
  }

  validateVersionSpec(
    fromVersion,
    args.from !== undefined ? "--from flag" : ".factory/config.json's factoryVersion",
  );
  const toVersion = args.to ?? "latest";
  validateVersionSpec(toVersion, args.to !== undefined ? "--to flag" : "default value");
  const manifest = readLocalManifest(repoRoot);

  const workDir = mkdtempSync(path.join(tmpdir(), "factory-sync-"));
  try {
    const baseRoot = d.fetchPackedVersion(fromVersion, path.join(workDir, "from"));
    const targetRoot = d.fetchPackedVersion(toVersion, path.join(workDir, "to"));

    const baseTemplateDir = path.join(baseRoot, "templates", presetId);
    const targetTemplateDir = path.join(targetRoot, "templates", presetId);
    if (!existsSync(baseTemplateDir)) {
      throw new Error(`fabulous-factory@${fromVersion} has no template for preset "${presetId}".`);
    }
    if (!existsSync(targetTemplateDir)) {
      throw new Error(`fabulous-factory@${toVersion} has no template for preset "${presetId}".`);
    }

    const base = collectFilesUnderPrefixes(baseTemplateDir, manifest.paths);
    const target = collectFilesUnderPrefixes(targetTemplateDir, manifest.paths);
    const local = collectFilesUnderPrefixes(repoRoot, manifest.paths);

    const actions = planSyncActions(manifest.paths, base, target, local);
    const result = applyActions(actions, repoRoot, base, target, local, { dryRun: args.dryRun });

    printSummary(result, args.dryRun);

    // Every non-dry-run sync stamps `factoryVersion` to the resolved target version —
    // applied changes, unresolved conflicts, or a clean zero-action no-op alike, since
    // the local tree now corresponds to `target` as far as the manifest's concerned in
    // all three cases (ADR-0006): re-diffing a no-op against a stale base next time would
    // just repeat the same no-op, and re-diffing a conflicted file against a stale base
    // would reopen an already-resolved conflict.
    let stampedVersion: string | undefined;
    if (!args.dryRun) {
      stampedVersion = readPackedVersion(targetRoot);
      stampFactoryVersion(repoRoot, stampedVersion);
    }

    return {
      applied: result.applied,
      skipped: result.skipped,
      conflicts: result.conflicts,
      exitCode: result.conflicts.length > 0 ? 1 : 0,
      stampedVersion,
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function main(): void {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const args = parseSyncArgs(process.argv.slice(2));
  const result = runSync(repoRoot, args);
  process.exitCode = result.exitCode;
}

const __filename = fileURLToPath(import.meta.url);
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
