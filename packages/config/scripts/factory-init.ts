#!/usr/bin/env node
/**
 * `pnpm factory:init` — one-shot mechanical promotion from factory-dev mode to a product
 * repo (plan §J.3.e, corrected by §J.12.7). `runFactoryInit` never calls `process.exit`; the
 * CLI wrapper below sets `process.exitCode`.
 *
 * Every step is individually idempotent, so a re-run with `.factory/handoff/` still present
 * (e.g. an interrupted prior run) completes whatever remains and still returns `ok: true`.
 * Step order: copy CLAUDE.md/AGENTS.md → move every handoff skill into `.claude/skills/`
 * (removing any stale destination first — `renameSync` can't overwrite a non-empty dir) →
 * delete the factory-dev-only skills → delete `.factory/handoff/` → drop the `template` flag
 * from `.factory/config.json`.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Adopters never see these — they're the template maintainer's own tooling (plan §J.4.c). */
export const FACTORY_DEV_ONLY_SKILLS = [
  "add-integration-package",
  "update-ledger-hashes",
  "write-adr",
  "release-template",
];

export function runFactoryInit(rootDir: string): { ok: boolean; messages: string[] } {
  const messages: string[] = [];
  const handoffDir = path.join(rootDir, ".factory", "handoff");

  if (!existsSync(handoffDir)) {
    messages.push("already initialized — .factory/handoff/ is not present.");
    return { ok: false, messages };
  }

  for (const name of ["CLAUDE.md", "AGENTS.md"]) {
    const src = path.join(handoffDir, name);
    const dest = path.join(rootDir, name);
    if (existsSync(src)) {
      cpSync(src, dest, { force: true });
      messages.push(`Copied handoff/${name} → ${name}.`);
    } else {
      messages.push(`handoff/${name} not found — skipped.`);
    }
  }

  const skillsDestDir = path.join(rootDir, ".claude", "skills");
  mkdirSync(skillsDestDir, { recursive: true });

  const skillsSrcDir = path.join(handoffDir, "skills");
  if (existsSync(skillsSrcDir)) {
    for (const entry of readdirSync(skillsSrcDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const src = path.join(skillsSrcDir, entry.name);
      const dest = path.join(skillsDestDir, entry.name);
      // rename() cannot overwrite a non-empty directory (ENOTEMPTY) — clear the
      // destination first so this step is idempotent across re-runs.
      rmSync(dest, { recursive: true, force: true });
      renameSync(src, dest);
      messages.push(`Installed skill '${entry.name}'.`);
    }
  }

  for (const name of FACTORY_DEV_ONLY_SKILLS) {
    rmSync(path.join(skillsDestDir, name), { recursive: true, force: true });
  }
  messages.push("Removed factory-dev-only skills.");

  rmSync(handoffDir, { recursive: true, force: true });

  const configPath = path.join(rootDir, ".factory", "config.json");
  writeFileSync(configPath, `${JSON.stringify({ stage: "prototype" }, null, 2)}\n`, "utf8");
  messages.push("Wrote .factory/config.json (stage: prototype).");

  messages.push('Initialized as a product repo. Ask your agent: "what\'s left to make this mine?"');

  return { ok: true, messages };
}

const __filename = fileURLToPath(import.meta.url);
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);

if (invokedDirectly) {
  const repoRoot = path.resolve(path.dirname(__filename), "../../..");
  const { ok, messages } = runFactoryInit(repoRoot);
  for (const message of messages) console.log(message);
  process.exitCode = ok ? 0 : 1;
}
