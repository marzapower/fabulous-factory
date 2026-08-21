#!/usr/bin/env node
/**
 * `pnpm factory:manifest [--check]` — the template repo's hash-regeneration tool (plan
 * §J.3.e, corrected by §J.12.6).
 *
 * Default mode rewrites every hash in `.factory/manifest.json` from disk bytes; it REFUSES
 * unless `.factory/config.json` has `"template": true` — a product repo must never
 * regenerate the ledger it's supposed to be diverging from. `--check` recomputes and exits 1
 * listing stale entries, but only runs when `template === true`; otherwise it prints a skip
 * line and exits 0, so a fork that edits files before running `factory:init` doesn't go red
 * with unfollowable advice. The template marker (not handoff-dir presence) gates this —
 * §J.12.6.
 */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { hashFile, loadFactoryConfig, loadManifest, staleEntries } from "./factory-ledger";

export const REFUSE_MESSAGE =
  'factory:manifest only regenerates in the template repo (.factory/config.json has no "template": true).';

/** Recomputes and reports staleness. Pure aside from reading `.factory/*` under `rootDir`. */
export function runCheck(rootDir: string): {
  skipped: boolean;
  stale: ReturnType<typeof staleEntries>;
} {
  const { template } = loadFactoryConfig(rootDir);
  if (!template) {
    return { skipped: true, stale: [] };
  }
  return { skipped: false, stale: staleEntries(rootDir) };
}

/**
 * Rewrites every hash from disk bytes. Throws (the CLI turns this into exit 1) when the
 * manifest is missing, when a listed file is missing, or when the repo isn't the template.
 */
export function runRewrite(rootDir: string): void {
  const { template } = loadFactoryConfig(rootDir);
  if (!template) {
    throw new Error(REFUSE_MESSAGE);
  }

  const manifestPath = path.join(rootDir, ".factory", "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`factory manifest not found at ${manifestPath}`);
  }

  const manifest = loadManifest(rootDir);

  for (const item of manifest.items) {
    for (const file of item.files) {
      const absPath = path.join(rootDir, file.path);
      if (!existsSync(absPath)) {
        throw new Error(`cannot hash missing file: ${file.path}`);
      }
      file.hash = hashFile(absPath);
    }
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function main(): number {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const checkMode = process.argv.includes("--check");

  if (checkMode) {
    let skipped: boolean;
    let stale: ReturnType<typeof staleEntries>;
    try {
      ({ skipped, stale } = runCheck(repoRoot));
    } catch (error) {
      console.error((error as Error).message);
      return 1;
    }
    if (skipped) {
      console.log("– factory:manifest --check skipped (product repo)");
      return 0;
    }
    if (stale.length === 0) {
      console.log("factory manifest is up to date.");
      return 0;
    }
    console.error("factory manifest is stale:");
    for (const entry of stale) {
      console.error(
        `  - ${entry.path}: expected ${entry.expected}, actual ${entry.actual ?? "<missing>"}`,
      );
    }
    console.error("Run `pnpm factory:manifest` to regenerate it, then commit the result.");
    return 1;
  }

  try {
    runRewrite(repoRoot);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  console.log(`Wrote ${path.join(repoRoot, ".factory", "manifest.json")}`);
  return 0;
}

const __filename = fileURLToPath(import.meta.url);
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);

if (invokedDirectly) {
  process.exitCode = main();
}
