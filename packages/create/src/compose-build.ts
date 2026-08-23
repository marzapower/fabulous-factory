#!/usr/bin/env node
/**
 * `pnpm compose` / `prepack` — build-time CLI entry for the compose engine (npx-installer
 * design spec §5, §8). With no `--preset`, composes every `status: "available"` preset
 * into its default `templates/<id>/` location and (always) regenerates
 * `templates/presets.json`, the manifest the published CLI reads at install time to
 * render the preset picker (including `coming-soon` entries, listed but not selectable).
 *
 * Usage: tsx src/compose-build.ts [--preset <id>] [--out <dir>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { composeProject } from "./compose";
import { isPathContained, listPresets, type PresetMeta } from "./presets";

interface ParsedArgs {
  preset?: string;
  out?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--preset") {
      result.preset = requireValue(argv, ++i, "--preset");
    } else if (arg === "--out") {
      result.out = requireValue(argv, ++i, "--out");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined) throw new Error(`Missing value for ${flag}`);
  return value;
}

function mustFind(presets: PresetMeta[], id: string): PresetMeta {
  const found = presets.find((preset) => preset.id === id);
  if (!found) {
    const known = presets.map((preset) => preset.id).join(", ") || "(none)";
    throw new Error(`Unknown preset "${id}". Known presets: ${known}`);
  }
  return found;
}

// The picker's default is whichever entry lands first in the manifest. `listPresets`
// returns presets alphabetically by id, which would put "Fabulous Brainstorm Chat" first
// by accident — the intended pitch order is the gentlest on-ramp (Nothing) first, then
// the flagship demo (Untangle, the "keepable base" preset the root `dev` script targets),
// then Brainstorm — so the manifest is built from this explicit order, not whatever
// preset happens to sort first.
const PRESET_ORDER = ["nothing", "untangle", "brainstorm"];

function toManifest(presets: PresetMeta[]) {
  const ordered = [...presets].sort(
    (a, b) => PRESET_ORDER.indexOf(a.id) - PRESET_ORDER.indexOf(b.id),
  );
  return ordered.map(({ id, label, description, status }) => ({ id, label, description, status }));
}

/**
 * Rejects an `--out` that resolves inside the repo's own tracked tree — composing over
 * live source (or `.git`) would be silently destructive — EXCEPT under
 * `packages/create/templates`, the default, legitimate output location. Mirrors
 * `presets.ts`'s `appDir` containment check with the polarity flipped: that one requires
 * containment, this one forbids it (bar the one carve-out).
 */
export function assertOutDirSafe(repoRoot: string, outDir: string): void {
  const templatesRoot = path.join(path.resolve(repoRoot), "packages", "create", "templates");
  if (isPathContained(templatesRoot, outDir)) return;
  if (isPathContained(repoRoot, outDir)) {
    throw new Error(
      `--out "${outDir}" resolves inside the repo's tracked tree — compose output must go ` +
        "outside the repo (e.g. a temp dir) or under packages/create/templates.",
    );
  }
}

export function run(repoRoot: string, argv: string[]): void {
  const { preset: presetId, out } = parseArgs(argv);
  if (out) assertOutDirSafe(repoRoot, out);
  const templatesRoot = path.join(repoRoot, "packages/create/templates");
  const allPresets = listPresets(repoRoot);

  mkdirSync(templatesRoot, { recursive: true });
  writeFileSync(
    path.join(templatesRoot, "presets.json"),
    `${JSON.stringify(toManifest(allPresets), null, 2)}\n`,
  );

  const targets = presetId
    ? [mustFind(allPresets, presetId)]
    : allPresets.filter((preset) => preset.status === "available");

  if (targets.length === 0) {
    console.warn("[compose] No available presets to compose.");
  }

  for (const preset of targets) {
    const outDir = out ?? path.join(templatesRoot, preset.id);
    const { warnings } = composeProject({ repoRoot, preset, outDir });
    console.log(`[compose] ${preset.id} -> ${path.relative(repoRoot, outDir)}`);
    for (const warning of warnings) console.warn(`[compose]   warning: ${warning}`);
  }
}

const __filename = fileURLToPath(import.meta.url);
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);

if (invokedDirectly) {
  const repoRoot = path.resolve(path.dirname(__filename), "../../..");
  try {
    run(repoRoot, process.argv.slice(2));
    process.exitCode = 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
