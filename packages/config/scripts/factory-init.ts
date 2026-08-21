#!/usr/bin/env node
/**
 * `pnpm factory:init` — one-shot mechanical promotion from factory-dev mode to a product
 * repo (plan §J.3.e, corrected by §J.12.7). `runFactoryInit` never calls `process.exit`; the
 * CLI wrapper below sets `process.exitCode`.
 *
 * Every step is individually idempotent, so a re-run with `.factory/handoff/` still present
 * (e.g. an interrupted prior run) completes whatever remains and still returns `ok: true`.
 * Step order: copy CLAUDE.md/AGENTS.md (force-overwrite) → copy LAUNCH.md (copy-if-absent —
 * an interrupted-run re-run must never overwrite a ticked checklist with the pristine seed;
 * see docs/superpowers/specs/2026-08-21-launch-checklist-design.md §7) → move every handoff
 * skill into `.claude/skills/` (removing any stale destination first — `renameSync` can't
 * overwrite a non-empty dir) → delete the factory-dev-only skills → copy every handoff agent
 * into `.claude/agents/` → delete the factory-dev-only agents → delete `.factory/handoff/` →
 * drop the `template` flag from `.factory/config.json`.
 *
 * The skills loop and the agents loop are deliberately not factored into one helper — see
 * docs/adr/0002-stage-adopter-agents-in-handoff.md for why.
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
export const FACTORY_DEV_ONLY_SKILLS = ["add-integration-package", "write-adr", "release-template"];

/**
 * Same idea for subagents: these two build and maintain the template itself, so an adopter
 * would only ever be confused by them. The shared agents (fab-warden, fab-bastion, fab-medic)
 * are absent from this list on purpose — they ship at root and survive the handoff.
 */
export const FACTORY_DEV_ONLY_AGENTS = ["fab-forge", "fab-steward"];

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

  // LAUNCH.md is copy-if-absent, unlike CLAUDE.md/AGENTS.md above: an interrupted-run
  // re-run must never clobber a ticked checklist with the pristine seed (design spec §7).
  const launchSrc = path.join(handoffDir, "LAUNCH.md");
  const launchDest = path.join(rootDir, "LAUNCH.md");
  if (existsSync(launchSrc)) {
    if (existsSync(launchDest)) {
      messages.push("LAUNCH.md already exists at root — left untouched.");
    } else {
      cpSync(launchSrc, launchDest);
      messages.push("Copied handoff/LAUNCH.md → LAUNCH.md.");
    }
  } else {
    messages.push("handoff/LAUNCH.md not found — skipped.");
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

  // Agents are single files, not directories, so this is a plain overwriting copy — none of
  // the skills loop's `renameSync` ENOTEMPTY dance applies. `.claude/agents/` is created only
  // when there is something to put in it: an adopter with no staged agents must not inherit an
  // empty directory. Anything that isn't a top-level `.md` file is skipped, not copied.
  const agentsDestDir = path.join(rootDir, ".claude", "agents");
  const agentsSrcDir = path.join(handoffDir, "agents");
  if (existsSync(agentsSrcDir)) {
    mkdirSync(agentsDestDir, { recursive: true });
    for (const entry of readdirSync(agentsSrcDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const dest = path.join(agentsDestDir, entry.name);
      // A stale destination that is somehow a DIRECTORY would make cpSync throw
      // ERR_FS_CP_NON_DIR_TO_DIR — clear it first, mirroring the skills loop's guard.
      rmSync(dest, { recursive: true, force: true });
      cpSync(path.join(agentsSrcDir, entry.name), dest, { force: true });
      messages.push(`Installed agent '${entry.name.replace(/\.md$/, "")}'.`);
    }
  }

  // Unconditional, like the skills sweep: a re-run after a partial init still clears these,
  // and `force: true` swallows ENOENT when `.claude/agents/` was never created. Running AFTER
  // the copy loop also means a handoff agent that shadowed a factory-dev name would be
  // installed and then removed — the disjointness test in factory-agents.test.ts prevents it.
  for (const name of FACTORY_DEV_ONLY_AGENTS) {
    rmSync(path.join(agentsDestDir, `${name}.md`), { force: true });
  }
  messages.push("Removed factory-dev-only agents.");

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
