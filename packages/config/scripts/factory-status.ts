#!/usr/bin/env node
/**
 * `pnpm factory:status` — prints the Adoption Ledger report: stage, one line per item, a
 * defaults-remaining count, and (while `.factory/handoff/` exists) the advisory nag. Always
 * exits 0 — this is a report, not a gate (`pnpm preflight` is the gate).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HANDOFF_NAG,
  LEDGER_UNAVAILABLE,
  ledgerReportSafe,
  renderStatusLines,
} from "./factory-ledger";

/** Pure — exported for tests/reuse. Never touches `process.env` itself. */
export function renderFactoryStatus(
  rootDir: string,
  env: Record<string, string | undefined>,
): string[] {
  const report = ledgerReportSafe(rootDir);
  if (!report) {
    return [`⚠ ${LEDGER_UNAVAILABLE}`];
  }

  const lines = renderStatusLines(report);
  const defaultCount = report.items.filter((item) => item.status === "factory-default").length;
  lines.push(`${defaultCount} of ${report.items.length} factory defaults still in place`);

  if (report.handoffPresent) {
    if (!env.FACTORY_DEV) {
      lines.push(HANDOFF_NAG);
    }
    lines.push(
      "Adopter skills (define-product, add-a-feature, enable-billing, swap-llm-provider, brand-it, make-it-yours, pre-ship-check) install into .claude/skills/ when you run `pnpm factory:init`.",
    );
    lines.push(
      "Adopter agents (fab-scribe, fab-smith, fab-muse, fab-preflight) install into .claude/agents/ at the same time; the shared agents (fab-warden, fab-bastion, fab-medic) are already there.",
    );
  }

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
