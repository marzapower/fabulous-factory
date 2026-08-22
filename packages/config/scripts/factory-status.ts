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

import { loadStage } from "./factory-stage";
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

/** Pure — exported for tests/reuse. Never touches `process.env` itself. */
export function renderFactoryStatus(rootDir: string): string[] {
  const lines: string[] = [`stage: ${loadStage(rootDir)}`];

  const launchPath = path.join(rootDir, "LAUNCH.md");
  if (!existsSync(launchPath)) {
    lines.push("no LAUNCH.md found — nothing to report");
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
  for (const line of renderFactoryStatus(repoRoot)) {
    console.log(line);
  }
  process.exitCode = 0;
}
