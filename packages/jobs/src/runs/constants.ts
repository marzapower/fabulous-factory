import type { RunStatus } from "./engine";

/**
 * Constants for the run engine (`packages/jobs/src/runs/`). This half of the milestone
 * is domain-agnostic by design (see `engine.ts`'s header comment) — nothing here knows
 * or cares what a "run" is FOR.
 */

/**
 * Absolute per-user daily run ceiling, enforced in EVERY profile and for EVERY run kind
 * — including a caller that never asked for a plan limit at all (`runsPerDay: null`,
 * e.g. billing disabled, or a scheduled run created with `enforceLimit: false`). This is
 * an abuse floor, not a product limit: it must never be worded as a plan restriction
 * (see `dailyCeilingMessage`), and a plan limit above it is still clamped to it.
 */
export const RUN_HARD_CEILING_PER_DAY = 300;

/**
 * Message for the `run_limit_reached` error when the cap that actually fired is a PLAN
 * limit (i.e. `runsPerDay` was set and at or below `RUN_HARD_CEILING_PER_DAY`) — see
 * `dailyCeilingMessage` for the abuse-floor case, which must never share this wording.
 */
export function runLimitMessage(limit: number): string {
  return `You've reached your plan's limit of ${limit} runs today.`;
}

/**
 * Message for the `run_limit_reached` error when the cap that fired is the absolute
 * `RUN_HARD_CEILING_PER_DAY` — a caller with no plan limit, or a plan limit above the
 * ceiling, hits this floor. Never says "plan": upgrading cannot raise it, so implying a
 * plan restriction here would simply be false.
 */
export function dailyCeilingMessage(): string {
  return `You've reached the daily safety ceiling of ${RUN_HARD_CEILING_PER_DAY} runs.`;
}

/**
 * A run left `'running'` past this age reads as `'interrupted'` in the UI rather than
 * stuck forever — stale runs are DERIVED (via `isStaleRun`), never reaped by a background
 * job, because a reaper wouldn't exist in the baseline (jobs-disabled) profile anyway.
 * Ten minutes, not five: a pipeline making a handful of LLM calls at the default
 * generation timeout, plus normal overhead, sits too close to five minutes for that to be
 * a safe margin.
 */
export const RUN_STALE_AFTER_MS = 10 * 60_000;

/**
 * Pure derivation of whether a still-`'running'` run should be presented as
 * `'interrupted'`. No I/O, no side effect — every caller (UI, API) computes this fresh
 * from the row it already has.
 */
export function isStaleRun(status: RunStatus, startedAt: Date, now: Date = new Date()): boolean {
  return status === "running" && now.getTime() - startedAt.getTime() > RUN_STALE_AFTER_MS;
}
