/**
 * `.env` file parsing, extracted from `scripts/doctor.ts` so `scripts/migrate.ts` (and any
 * other Node-only script — `packages/db`, future CLIs) can load the same merged env
 * without duplicating the parser or importing the doctor script itself.
 *
 * Two primitives:
 * - `loadEnvFile`: a raw, unfiltered parse of a `.env`-style file. No dotenv dependency.
 * - `readMergedEnv`: doctor's exact original semantics — parse `.env` at the repo root,
 *   merge UNDER real `process.env` (shell-exported vars always win), filter to registered
 *   var names, drop empty strings.
 *
 * This module never imports `server-only` — it is safe for both the poisoned "." entry
 * and the unpoisoned "./node" entry to re-export it.
 */
import { existsSync, readFileSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { ENV_REGISTRY, type RawEnv } from "./registry";

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = nodePath.resolve(__dirname, "../../..");
const DEFAULT_DOTENV_PATH = nodePath.join(REPO_ROOT, ".env");

/**
 * Raw parse of a `.env`-style file — a tiny hand-rolled parser, no dotenv dependency.
 * Returns every key/value pair found in the file, unfiltered against the registry.
 * Returns `{}` when the file doesn't exist. Defaults to `.env` at the repo root.
 */
export function loadEnvFile(path: string = DEFAULT_DOTENV_PATH): Record<string, string> {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, "utf8");
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Doctor's exact original semantics: parse `.env` at the repo root, merge UNDER real
 * `process.env` (shell-exported vars always win over the file), filter to registered var
 * names only, and drop empty strings (`NAME=` in a `.env` file means "unset").
 */
export function readMergedEnv(): RawEnv {
  const fromFile = loadEnvFile();
  const merged: RawEnv = {};
  for (const spec of ENV_REGISTRY) {
    const value = process.env[spec.name] ?? fromFile[spec.name];
    if (value !== undefined && value !== "") merged[spec.name] = value;
  }
  return merged;
}
