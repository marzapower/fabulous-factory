/**
 * `factory:sync`'s pure planning logic (ADR-0006) — no fs, no exec, no git. Given the
 * sync manifest's tracked path prefixes and three file-content snapshots (the base
 * install version, the target sync-to version, and the local working tree), decides what
 * to do with each tracked file. `packages/config/scripts/factory-sync.ts` is the fs/exec
 * side of this: it builds the snapshots (from an extracted `npm pack` tarball and the
 * local repo) and executes the plan this module returns.
 *
 * Mirrors `factory-stage.ts`/`launch-checklist.ts`'s split: pure logic in its own module,
 * no CLI, no `invokedDirectly` gate — the sibling script owns that.
 */
import posixPath from "node:path/posix";

export interface SyncManifest {
  version: 1;
  paths: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const WIN_DRIVE_RE = /^[A-Za-z]:/;

/** `true` for a manifest path entry that can never resolve outside `path.join(repoRoot,
 * entry)` — rejects anything `parseSyncManifest` must refuse: absolute paths (posix `/…`
 * and Windows drive-letter `C:…`), `..` segments, backslashes, empty strings, and any
 * entry whose posix-normalized form differs from itself (double slashes, `./`, trailing
 * `.` segments, …) — except the trailing `/` that marks a directory prefix, which
 * `matchesManifest`/`collectFilesUnderPrefixes` both give distinct meaning to and which
 * `path.posix.normalize` would otherwise strip. */
function isValidManifestPath(entry: string): boolean {
  if (entry.length === 0) return false;
  if (entry.includes("\\")) return false;
  if (entry.startsWith("/")) return false;
  if (WIN_DRIVE_RE.test(entry)) return false;
  if (entry.split("/").includes("..")) return false;

  const isDirPrefix = entry.endsWith("/");
  const withoutTrailingSlash = isDirPrefix ? entry.slice(0, -1) : entry;
  if (withoutTrailingSlash.length === 0) return false; // entry === "/", already rejected above
  return posixPath.normalize(withoutTrailingSlash) === withoutTrailingSlash;
}

/** Parses and shape-validates `sync-manifest.json`'s content. Throws on anything that
 * isn't exactly `{ version: 1, paths: string[] }` — a malformed manifest must fail loudly,
 * not silently sync nothing (or everything). Every path must also stay inside the repo
 * root once joined (`path.join(repoRoot, entry)`) — a manifest entry is untrusted input
 * (it ships inside the tarball `factory-sync.ts` fetches), so `"../"`, `"/etc/"`, etc.
 * are rejected here rather than trusted through to a read/write outside the repo. */
export function parseSyncManifest(raw: string): SyncManifest {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.paths)) {
    throw new Error(
      'Invalid .factory/sync-manifest.json — expected { "version": 1, "paths": string[] }',
    );
  }
  if (!parsed.paths.every((entry): entry is string => typeof entry === "string")) {
    throw new Error('Invalid .factory/sync-manifest.json — every "paths" entry must be a string');
  }
  for (const entry of parsed.paths) {
    if (!isValidManifestPath(entry)) {
      throw new Error(
        `Invalid .factory/sync-manifest.json — unsafe "paths" entry "${entry}": must be a ` +
          'repo-relative path with no leading slash, no drive letter, no ".." segment, no ' +
          'backslash, and no redundant "./" or "//" segments.',
      );
    }
  }
  return { version: 1, paths: parsed.paths };
}

/**
 * A manifest path is a prefix, never a glob (compose.ts's spec — see conventions.md):
 * an entry ending in `/` matches every file anywhere under that directory; an entry with
 * no trailing `/` matches only that exact file.
 */
export function matchesManifest(relPath: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) =>
    prefix.endsWith("/") ? relPath.startsWith(prefix) : relPath === prefix,
  );
}

export type SyncActionKind = "skip" | "add" | "delete" | "merge" | "keep-deleted";

export interface SyncAction {
  path: string;
  kind: SyncActionKind;
}

/** relative path -> file content. A path absent from the map means the file doesn't
 * exist in that snapshot. */
export type FileSnapshot = Readonly<Record<string, string>>;

/**
 * Decides, per file in the union of `base` and `target` (restricted to `prefixes`), what
 * `factory-sync.ts` should do with it:
 *
 *  - `base === target` (including both absent): `"skip"` — nothing changed upstream.
 *  - missing locally: `"add"` if `target` has it, else `"skip"` (nothing to add, and
 *    nothing to remove — the local tree already lacks it and upstream now does too).
 *  - deleted upstream (`target` absent) + local content still matches `base`: `"delete"`.
 *  - deleted upstream + local content diverged from `base`: `"keep-deleted"` — reported,
 *    left alone (never silently deleted out from under a local edit).
 *  - anything else (present, changed, in all three, or added independently on both
 *    sides): `"merge"` — a three-way merge is `factory-sync.ts`'s job, not this
 *    function's; a missing `base` entry there is treated as an empty file.
 */
export function planSyncActions(
  prefixes: readonly string[],
  base: FileSnapshot,
  target: FileSnapshot,
  local: FileSnapshot,
): SyncAction[] {
  const paths = new Set<string>();
  for (const relPath of Object.keys(base)) {
    if (matchesManifest(relPath, prefixes)) paths.add(relPath);
  }
  for (const relPath of Object.keys(target)) {
    if (matchesManifest(relPath, prefixes)) paths.add(relPath);
  }

  const actions: SyncAction[] = [];
  for (const relPath of [...paths].sort()) {
    const b = base[relPath];
    const t = target[relPath];
    const l = local[relPath];

    if (b === t) {
      actions.push({ path: relPath, kind: "skip" });
      continue;
    }

    if (l === undefined) {
      actions.push({ path: relPath, kind: t === undefined ? "skip" : "add" });
      continue;
    }

    if (t === undefined) {
      actions.push({ path: relPath, kind: l === b ? "delete" : "keep-deleted" });
      continue;
    }

    actions.push({ path: relPath, kind: "merge" });
  }
  return actions;
}
