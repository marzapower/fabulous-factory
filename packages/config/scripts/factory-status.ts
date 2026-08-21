#!/usr/bin/env node
/**
 * `pnpm factory:status` — dumb, read-only renderer of `LAUNCH.md` (design:
 * docs/superpowers/specs/2026-08-21-launch-checklist-design.md §6). Renders it, never gates
 * it — `LAUNCH.md` enforcement is agent/skill discipline, not a CLI check (§2). Always exits
 * 0.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HANDOFF_NAG, isHandoffPresent, loadStage } from "./factory-stage";
import {
  countDone,
  countOpenBlockers,
  loadLaunchChecklist,
  type LaunchItem,
} from "./launch-checklist";

function renderItemLine(item: LaunchItem): string {
  if (!item.done) {
    let line = `○ ${item.title}`;
    if (item.blocksLaunch) line += " — blocks launch";
    if (item.skill) line += ` → skill: ${item.skill}`;
    if (item.humanSignoff) line += " 🔒";
    return line;
  }

  let line = `✓ ${item.title}`;
  if (item.humanSignoff) line += " 🔒";
  return line;
}

/**
 * Pure — exported for tests/reuse. Never touches `process.env` itself (`env` arrives as a
 * plain object, same discipline as `preflight.ts`'s `evaluatePreflight`).
 */
export function renderFactoryStatus(
  rootDir: string,
  env: Record<string, string | undefined>,
): string[] {
  const lines: string[] = [`stage: ${loadStage(rootDir)}`];

  // The staged-agents roster announcement (kept verbatim — asserted by
  // factory-agents.test.ts): printed whenever `.factory/handoff/agents/` exists, independent
  // of LAUNCH.md's presence. In template/fresh-clone mode this plus the nag below is the
  // whole useful output.
  if (existsSync(path.join(rootDir, ".factory", "handoff", "agents"))) {
    lines.push(
      "Adopter skills (define-product, add-a-feature, enable-billing, swap-llm-provider, brand-it, make-it-yours, pre-ship-check) install into .claude/skills/ when you run `pnpm factory:init`.",
    );
    lines.push(
      "Adopter agents (fab-scribe, fab-smith, fab-muse, fab-preflight) install into .claude/agents/ at the same time; the shared agents (fab-warden, fab-bastion, fab-medic) are already there.",
    );
  }

  const launchPath = path.join(rootDir, "LAUNCH.md");
  if (!existsSync(launchPath)) {
    if (isHandoffPresent(rootDir)) {
      if (!env.FACTORY_DEV) lines.push(HANDOFF_NAG);
    } else {
      lines.push("no LAUNCH.md found — nothing to report");
    }
    return lines;
  }

  const items = loadLaunchChecklist(rootDir);
  for (const item of items) {
    lines.push(renderItemLine(item));
  }
  lines.push(
    `${countDone(items)}/${items.length} done · ${countOpenBlockers(items)} launch blocker(s) open`,
  );

  return lines;
}

const __filename = fileURLToPath(import.meta.url);
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);

if (invokedDirectly) {
  const repoRoot = path.resolve(path.dirname(__filename), "../../..");
  for (const line of renderFactoryStatus(repoRoot, { FACTORY_DEV: process.env.FACTORY_DEV })) {
    console.log(line);
  }
  process.exitCode = 0;
}
