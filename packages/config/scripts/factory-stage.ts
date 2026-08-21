/**
 * Factory stage — shared, pure logic behind `pnpm factory:status`, `pnpm preflight`, and the
 * factory section of `pnpm factory:doctor`.
 *
 * Replaces the old hash-based Adoption Ledger (`factory-ledger.ts`, retired — see
 * `docs/superpowers/specs/2026-08-21-launch-checklist-design.md` §4/§5): this module now only
 * answers "what stage is this repo in" and "is it still carrying `.factory/handoff/`". The
 * semantic launch checklist itself lives in the sibling `launch-checklist.ts`.
 *
 * No CLI here. Every function takes `rootDir` explicitly (never reads `process.cwd()` or
 * `process.env`) so tests can point it at a temp-dir fixture. `rootDir` is threaded VERBATIM
 * into `path.join` — never `realpath`'d (opt-23): on macOS `/tmp` is a symlink to
 * `/private/tmp`, and resolving it would break relative-path assertions in temp-dir tests.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type Stage = "prototype" | "production";

/**
 * The advisory nag shown by `factory:status`, `preflight`, and doctor's factory section
 * while `.factory/handoff/` exists — never blocking, silenced by `FACTORY_DEV=1`. Kept as a
 * single shared constant so the three surfaces never drift.
 */
export const HANDOFF_NAG =
  "This repo hasn't been initialized as a product. Run pnpm factory:init (template contributors: set FACTORY_DEV=1 to silence this).";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * `.factory/config.json` reader. Missing file, unparseable JSON, or a missing/invalid
 * `stage` all degrade to the same safe defaults — never throws.
 */
export function loadFactoryConfig(rootDir: string): { stage: Stage; template: boolean } {
  const configPath = path.join(rootDir, ".factory", "config.json");
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return { stage: "prototype", template: false };
    const stage: Stage = parsed.stage === "production" ? "production" : "prototype";
    const template = parsed.template === true;
    return { stage, template };
  } catch {
    return { stage: "prototype", template: false };
  }
}

/** Missing/invalid `.factory/config.json` → `"prototype"` (never throws). */
export function loadStage(rootDir: string): Stage {
  return loadFactoryConfig(rootDir).stage;
}

/** Whether `.factory/handoff/` still exists under `rootDir` — never throws. */
export function isHandoffPresent(rootDir: string): boolean {
  return existsSync(path.join(rootDir, ".factory", "handoff"));
}
