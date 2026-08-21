#!/usr/bin/env node
/**
 * `pnpm preflight` — stage-aware ship gate (plan §J.3.e, corrected by §J.12.4/§J.12.13).
 * Mechanical env gate only — the semantic launch checklist (`LAUNCH.md`) is enforced by
 * agent/skill discipline, not here (design:
 * docs/superpowers/specs/2026-08-21-launch-checklist-design.md §2).
 *
 * `evaluatePreflight` is pure: no `process.env` reads inside, `env` arrives as a plain
 * object so tests can pass fixtures directly. The CLI wrapper calls it with
 * `{ ...readMergedEnv(), FACTORY_DEV: process.env.FACTORY_DEV }` — `readMergedEnv()` is
 * registry-filtered and would silently drop `FACTORY_DEV`, so it's threaded in explicitly.
 *
 * `stage: "prototype"` never fails — everything a production ship would block is reported
 * as a warning instead, so the human sees it coming. `stage: "production"` turns the same
 * checks into failures. Non-blocking warnings (email capability disabled) print at both
 * stages. `FACTORY_DEV` never suppresses the production-stage handoff-present failure
 * (§J.12.13) — a repo that still carries `.factory/handoff/` is by definition not a product
 * repo, dev override or not; it only silences the advisory nag printed alongside the report.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveCapabilities } from "../src/capabilities";
import { readMergedEnv } from "../src/env-file";
import type { RawEnv } from "../src/registry";
import { HANDOFF_NAG, isHandoffPresent, loadStage } from "./factory-stage";

const POINTER_FILES = ["CLAUDE.md", "AGENTS.md"];
const POINTER_TARGET = "docs/agents/conventions.md";

function pointerCheckMessage(file: string): string {
  return `${file} does not reference ${POINTER_TARGET} — mirror staleness (spec §8.2)`;
}

/**
 * Pure evaluation — `rootDir` is never `realpath`'d (opt-23), threaded verbatim. `env` is a
 * plain string/undefined map (not `RawEnv`): it also carries `FACTORY_DEV`, which is outside
 * the registry.
 */
export function evaluatePreflight(
  rootDir: string,
  env: Record<string, string | undefined>,
): { failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];

  const stage = loadStage(rootDir);
  const handoffPresent = isHandoffPresent(rootDir);
  const stripeKey = env.STRIPE_SECRET_KEY;
  const stripeIsTestKey = Boolean(stripeKey && stripeKey.startsWith("sk_test_"));

  const productionBlockers: string[] = [];
  if (handoffPresent) {
    productionBlockers.push(".factory/handoff/ still exists — run pnpm factory:init");
  }
  if (stripeIsTestKey) {
    productionBlockers.push(
      "STRIPE_SECRET_KEY starts with sk_test_ — a live key is required in production",
    );
  }

  if (stage === "production") {
    failures.push(...productionBlockers);
  } else {
    warnings.push(...productionBlockers.map((message) => `(would block production) ${message}`));
  }

  // Non-blocking at both stages. Capability derivation uses the "production" AppMode
  // deliberately: preflight cares whether email is REALLY deliverable (the 'resend'
  // adapter), not whether it merely degrades to the dev-only 'console' transport — so a
  // developer running preflight locally still sees the honest warning.
  const capabilities = deriveCapabilities(env as RawEnv, "production");
  if (capabilities.email === "disabled") {
    warnings.push("email capability disabled — auth runs without email verification");
  }

  // Pointer check (mirror staleness, spec §8.2): warning in prototype, failure in production.
  for (const file of POINTER_FILES) {
    const absPath = path.join(rootDir, file);
    const content = existsSync(absPath) ? readFileSync(absPath, "utf8") : "";
    if (!content.includes(POINTER_TARGET)) {
      const message = pointerCheckMessage(file);
      if (stage === "production") failures.push(message);
      else warnings.push(message);
    }
  }

  return { failures, warnings };
}

function main(): void {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  // §J.12.4: readMergedEnv() is registry-filtered and would silently drop FACTORY_DEV, so
  // it's threaded in explicitly, exactly as the plan pins.
  const env: Record<string, string | undefined> = {
    ...readMergedEnv(),
    FACTORY_DEV: process.env.FACTORY_DEV,
  };

  console.log(`stage: ${loadStage(repoRoot)}`);
  if (isHandoffPresent(repoRoot) && !env.FACTORY_DEV) {
    console.log(HANDOFF_NAG);
  }
  console.log("");

  const { failures, warnings } = evaluatePreflight(repoRoot, env);

  for (const warning of warnings) console.log(`⚠ ${warning}`);
  for (const failure of failures) console.log(`✗ ${failure}`);

  if (failures.length === 0) {
    console.log("preflight: OK");
  } else {
    console.log(`preflight: ${failures.length} blocker(s)`);
  }

  process.exitCode = failures.length > 0 ? 1 : 0;
}

const __filename = fileURLToPath(import.meta.url);
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);

if (invokedDirectly) {
  main();
}
