/**
 * Slim Adoption Ledger — shared, pure logic behind `pnpm factory:status`, `pnpm preflight`,
 * `pnpm factory:manifest`, and the factory section of `pnpm factory:doctor` (plan §J.3.d).
 *
 * No CLI here. Every function takes `rootDir` explicitly (never reads `process.cwd()` or
 * `process.env`) so tests can point it at a temp-dir fixture. `rootDir` is threaded VERBATIM
 * into `path.join` — never `realpath`'d (opt-23): on macOS `/tmp` is a symlink to
 * `/private/tmp`, and resolving it would break relative-path assertions in temp-dir tests.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type Stage = "prototype" | "production";
export type ItemStatus = "factory-default" | "touched" | "removed";

export interface ManifestItem {
  id: string;
  title: string;
  why: string;
  skill: string;
  blocksProduction: boolean;
  files: { path: string; hash: string }[];
}

export interface LedgerReport {
  stage: Stage;
  handoffPresent: boolean;
  items: (ManifestItem & { status: ItemStatus })[];
}

/**
 * The advisory nag shown by `factory:status`, `preflight`, and doctor's factory section
 * while `.factory/handoff/` exists — never blocking, silenced by `FACTORY_DEV=1` (spec §7,
 * plan §J.1 item 2). Kept as a single shared constant so the three surfaces never drift.
 */
export const HANDOFF_NAG =
  "This repo hasn't been initialized as a product. Run pnpm factory:init (template contributors: set FACTORY_DEV=1 to silence this).";

/**
 * Shared across doctor, preflight, and factory-status: what to print when
 * `ledgerReportSafe`/`ledgerReport` can't produce a report (missing/corrupt manifest).
 * Extracted for the same reason as `HANDOFF_NAG` — DRY the exact wording across the three
 * surfaces so they never drift. Callers prefix their own glyph (`⚠`, `✗`, …) as needed.
 */
export const LEDGER_UNAVAILABLE =
  ".factory/manifest.json missing or unreadable — ledger unavailable";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isManifestItem(value: unknown): value is ManifestItem {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.title !== "string") return false;
  if (typeof value.why !== "string") return false;
  if (typeof value.skill !== "string") return false;
  if (typeof value.blocksProduction !== "boolean") return false;
  if (!Array.isArray(value.files)) return false;
  return value.files.every(
    (file) => isRecord(file) && typeof file.path === "string" && typeof file.hash === "string",
  );
}

function isManifestShape(value: unknown): value is { comment: string; items: ManifestItem[] } {
  return (
    isRecord(value) &&
    typeof value.comment === "string" &&
    Array.isArray(value.items) &&
    value.items.every(isManifestItem)
  );
}

/** SHA-256 hex digest of a file's raw bytes (`node:crypto`, no encoding — real content hash). */
export function hashFile(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

/** Throws a clear error on a missing, unparseable, or malformed-shape manifest. */
export function loadManifest(rootDir: string): { comment: string; items: ManifestItem[] } {
  const manifestPath = path.join(rootDir, ".factory", "manifest.json");

  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch (error) {
    throw new Error(
      `factory manifest not found or unreadable at ${manifestPath}: ${(error as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `factory manifest at ${manifestPath} is not valid JSON: ${(error as Error).message}`,
    );
  }

  if (!isManifestShape(parsed)) {
    throw new Error(`factory manifest at ${manifestPath} has an unexpected shape`);
  }

  return parsed;
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

/**
 * Item status, AND-rule per plan §J.12.2 (supersedes the earlier ALL-files rule): an item is
 * `factory-default` if ANY listed file is still present with a matching hash — one untouched
 * shipped file means the item is not yet owned. `removed` only when ALL listed files are
 * missing. Otherwise `touched` (every present file differs from its shipped hash, at least
 * one file present). A manifest hash of `"PENDING"` (placeholder, filled in later) simply
 * never matches an actual digest — no special-casing needed.
 */
export function itemStatus(rootDir: string, item: ManifestItem): ItemStatus {
  let anyPresent = false;
  let anyMatch = false;

  for (const file of item.files) {
    const absPath = path.join(rootDir, file.path);
    if (!existsSync(absPath)) continue;
    anyPresent = true;
    if (hashFile(absPath) === file.hash) anyMatch = true;
  }

  if (anyMatch) return "factory-default";
  if (!anyPresent) return "removed";
  return "touched";
}

/** Throws if the manifest is missing/corrupt — use `ledgerReportSafe` for a non-throwing path. */
export function ledgerReport(rootDir: string): LedgerReport {
  const manifest = loadManifest(rootDir);
  const stage = loadStage(rootDir);
  const handoffPresent = existsSync(path.join(rootDir, ".factory", "handoff"));

  return {
    stage,
    handoffPresent,
    items: manifest.items.map((item) => ({ ...item, status: itemStatus(rootDir, item) })),
  };
}

/**
 * Non-throwing wrapper (plan §J.12.3): every CLI surface must degrade gracefully on a
 * missing/corrupt `.factory/manifest.json`, never crash. Returns `null` on any failure.
 */
export function ledgerReportSafe(rootDir: string): LedgerReport | null {
  try {
    return ledgerReport(rootDir);
  } catch {
    return null;
  }
}

/**
 * Manifest hashes vs. disk, across every listed file regardless of item — used by
 * `factory:manifest --check` to list what's stale. `actual` is `null` when the file is
 * missing on disk.
 */
export function staleEntries(
  rootDir: string,
): { path: string; expected: string; actual: string | null }[] {
  const { items } = loadManifest(rootDir);
  const stale: { path: string; expected: string; actual: string | null }[] = [];

  for (const item of items) {
    for (const file of item.files) {
      const absPath = path.join(rootDir, file.path);
      const actual = existsSync(absPath) ? hashFile(absPath) : null;
      if (actual !== file.hash) {
        stale.push({ path: file.path, expected: file.hash, actual });
      }
    }
  }

  return stale;
}

/**
 * Doctor deliberately does NOT reuse this (opt-24): its factory section is intentionally
 * terser than `factory:status`'s full per-item report.
 */
export function renderStatusLines(report: LedgerReport): string[] {
  const lines: string[] = [`stage: ${report.stage}`];

  for (const item of report.items) {
    if (item.status === "factory-default") {
      lines.push(`● ${item.id} — factory default → skill: ${item.skill}`);
    } else {
      lines.push(`✓ ${item.id} — ${item.status}`);
    }
  }

  return lines;
}
