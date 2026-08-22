/**
 * Reads and validates `presets/<id>/preset.json` (npx-installer design spec §5.1).
 * Build-time only — never bundled into the published CLI (see `install.ts`'s own,
 * deliberately duplicated, runtime-manifest type: it reads the much smaller
 * `templates/presets.json` this module's caller writes, not this module itself).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type PresetStatus = "available" | "coming-soon";

export interface PresetMeta {
  id: string;
  label: string;
  description: string;
  appDir: string;
  status: PresetStatus;
  packages: string[] | null;
  /** repo-root-relative source directory, e.g. `presets/demo`. */
  sourceDir: string;
}

const REQUIRED_STRING_FIELDS = ["id", "label", "description", "appDir", "status"] as const;

/**
 * True if `child` (resolved) is `parent` itself or somewhere inside it. Shared containment
 * check used both for a preset's `appDir` (must stay inside `repoRoot`, below) and for
 * `compose-build.ts`'s `--out` guard (must stay OUTSIDE `repoRoot`, except under
 * `packages/create/templates` — the mirror image of this same check).
 */
export function isPathContained(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Validates a parsed `preset.json` payload. Exported so config-validation is unit-testable. */
export function validatePresetMeta(
  raw: unknown,
  sourceDir: string,
  repoRoot: string,
  expectedId?: string,
): PresetMeta {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${sourceDir}/preset.json must be a JSON object.`);
  }
  const record = raw as Record<string, unknown>;

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof record[field] !== "string" || record[field] === "") {
      throw new Error(`${sourceDir}/preset.json: "${field}" must be a non-empty string.`);
    }
  }

  const status = record.status as string;
  if (status !== "available" && status !== "coming-soon") {
    throw new Error(
      `${sourceDir}/preset.json: "status" must be "available" or "coming-soon", got "${status}".`,
    );
  }

  const id = record.id as string;
  if (expectedId !== undefined && id !== expectedId) {
    throw new Error(
      `${sourceDir}/preset.json: "id" ("${id}") does not match its directory name ("${expectedId}").`,
    );
  }

  if (record.packages !== null && !Array.isArray(record.packages)) {
    throw new Error(
      `${sourceDir}/preset.json: "packages" must be null or an array (reserved for v2).`,
    );
  }

  const appDir = record.appDir as string;
  if (path.isAbsolute(appDir)) {
    throw new Error(`${sourceDir}/preset.json: "appDir" must be repo-relative, not absolute.`);
  }
  if (!isPathContained(repoRoot, path.resolve(repoRoot, appDir))) {
    throw new Error(
      `${sourceDir}/preset.json: "appDir" ("${appDir}") resolves outside the repo root.`,
    );
  }

  return {
    id,
    label: record.label as string,
    description: record.description as string,
    appDir,
    status,
    packages: (record.packages as string[] | null) ?? null,
    sourceDir,
  };
}

/** Reads and validates one `presets/<id>/preset.json`, `id` matching the directory name. */
export function readPreset(repoRoot: string, id: string): PresetMeta {
  const sourceDir = path.join("presets", id);
  const jsonPath = path.join(repoRoot, sourceDir, "preset.json");
  if (!existsSync(jsonPath)) {
    throw new Error(`${sourceDir}/preset.json is missing.`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch (cause) {
    throw new Error(`${sourceDir}/preset.json is not valid JSON.`, { cause });
  }

  return validatePresetMeta(raw, sourceDir, repoRoot, id);
}

/** Lists every preset under `<repoRoot>/presets/*`, sorted by id. Empty array if none. */
export function listPresets(repoRoot: string): PresetMeta[] {
  const presetsRoot = path.join(repoRoot, "presets");
  if (!existsSync(presetsRoot)) return [];

  const ids = readdirSync(presetsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return ids.map((id) => readPreset(repoRoot, id));
}
