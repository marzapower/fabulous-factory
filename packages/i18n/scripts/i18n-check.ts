#!/usr/bin/env node
/**
 * Catalog completeness check across every `{packages,apps}/<name>/messages` directory
 * that contains an `en.json`. `en.json` is the base catalog by convention: which locale is
 * actually configured as an app's `defaultLocale` isn't knowable from the filesystem
 * alone without importing app code, which this script deliberately never does (it reads
 * only the filesystem — no `@factory/*` package import beyond this package's own pure
 * `./src/check.ts`, no `process.env`). Every sibling `<locale>.json` in that directory is
 * diffed against `en.json`.
 *
 * - apps/*    : missing OR extra keys        -> exit 1 (an app's own catalog must be exact)
 * - packages/*: missing keys only warn, extra keys -> exit 1 (a package may ship a locale
 *   an app hasn't adopted yet; an app is expected to cover every locale it declares)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { diffCatalog } from "../src/check";
import type { Messages } from "../src/index";

const BASE_LOCALE_FILE = "en.json";

export type MessageDirKind = "packages" | "apps";

export interface MessageDirEntry {
  dir: string;
  kind: MessageDirKind;
}

export interface CheckResult {
  file: string;
  locale: string;
  missing: string[];
  extra: string[];
  severity: "ok" | "warn" | "error";
}

function readJson(filePath: string): Messages {
  return JSON.parse(readFileSync(filePath, "utf8")) as Messages;
}

/** Pure — every `{packages,apps}/<name>/messages` directory under `repoRoot` that
 *  contains `en.json`, paired with its `kind` (used to decide missing-key severity). */
export function findMessageDirs(repoRoot: string): MessageDirEntry[] {
  const results: MessageDirEntry[] = [];
  for (const kind of ["packages", "apps"] as const) {
    const groupDir = path.join(repoRoot, kind);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const messagesDir = path.join(groupDir, entry.name, "messages");
      if (existsSync(path.join(messagesDir, BASE_LOCALE_FILE))) {
        results.push({ dir: messagesDir, kind });
      }
    }
  }
  return results;
}

/** Pure — diffs every sibling `<locale>.json` in `dir` against `en.json`. */
export function checkMessageDir(dir: string, kind: MessageDirKind): CheckResult[] {
  const base = readJson(path.join(dir, BASE_LOCALE_FILE));
  const results: CheckResult[] = [];

  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".json") || entry === BASE_LOCALE_FILE) continue;
    const locale = entry.slice(0, -".json".length);
    const candidate = readJson(path.join(dir, entry));
    const { missing, extra } = diffCatalog(base, candidate);
    const severity: CheckResult["severity"] =
      extra.length > 0 ? "error" : missing.length > 0 ? (kind === "apps" ? "error" : "warn") : "ok";
    results.push({ file: path.join(dir, entry), locale, missing, extra, severity });
  }

  return results;
}

/** Pure — runs the check over every catalog dir found under `repoRoot`. */
export function runI18nCheck(repoRoot: string): { results: CheckResult[]; hasError: boolean } {
  const results = findMessageDirs(repoRoot).flatMap(({ dir, kind }) => checkMessageDir(dir, kind));
  return { results, hasError: results.some((result) => result.severity === "error") };
}

function formatResult(result: CheckResult): string {
  if (result.missing.length === 0 && result.extra.length === 0) {
    return `${result.file} (${result.locale}): ok`;
  }
  const parts: string[] = [];
  if (result.missing.length > 0) parts.push(`missing [${result.missing.join(", ")}]`);
  if (result.extra.length > 0) parts.push(`extra [${result.extra.join(", ")}]`);
  return `${result.file} (${result.locale}): ${parts.join(" ")}`;
}

const __filename = fileURLToPath(import.meta.url);
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);

if (invokedDirectly) {
  const repoRoot = path.resolve(path.dirname(__filename), "../../..");
  const { results, hasError } = runI18nCheck(repoRoot);

  for (const result of results) {
    const label =
      result.severity === "error" ? "ERROR" : result.severity === "warn" ? "WARN" : "OK";
    console.log(`[${label}] ${formatResult(result)}`);
  }

  if (hasError) {
    console.error("i18n:check found blocking catalog issues (see ERROR lines above).");
    process.exit(1);
  }
  console.log("i18n:check passed.");
}
