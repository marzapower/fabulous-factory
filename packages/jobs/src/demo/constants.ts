/**
 * Demo domain constants (plan G.4/G.10.7). `make-it-yours` deletes this file with the
 * rest of the demo.
 */

/** Absolute per-user monitor ceiling (plan H.10.16/9/12), enforced in EVERY profile
 * regardless of the caller's resolved plan limit — including the "unlimited" (`null`)
 * limit billing-disabled entitlement returns (spec §6 verbatim: unlimited-when-disabled
 * is a declared trade-off, not a bug, but it still needs an abuse floor). Plan-driven
 * caps live in `packages/config`'s `plans.ts`; this is deliberately NOT plan-aware — an
 * abuse ceiling, not a product limit. `createMonitorRow`'s effective cap is
 * `min(callerLimit ?? MONITOR_HARD_CEILING, MONITOR_HARD_CEILING)`. */
export const MONITOR_HARD_CEILING = 200;

/** Friendly message for the `monitor_limit_reached` `ApiError` thrown by
 * `createMonitorRow` at the cap — a function (not a static string, plan-aware wording)
 * so every caller of `createMonitorRow` gets identical wording for whatever the
 * EFFECTIVE cap for that call turned out to be, never a value that drifts from what was
 * actually enforced. Used when the cap that actually fired is a PLAN limit — see
 * `hardCeilingMessage` for the abuse-floor case, which must never be worded as if it
 * were a plan restriction. */
export function monitorLimitMessage(limit: number): string {
  return `You've reached your plan's limit of ${limit} monitors.`;
}

/** Friendly message for the `monitor_limit_reached` `ApiError` when the cap that fired is
 * the ABSOLUTE `MONITOR_HARD_CEILING` (H.10 review fix) — a caller with `monitorLimit:
 * null` (billing disabled, or an unlimited plan) or a plan limit ABOVE the ceiling hits
 * this floor, not a plan restriction, and "plan's limit" would be actively misleading:
 * upgrading can't raise it, so telling an unlimited-plan user they've hit their "plan's
 * limit" is simply false. */
export function hardCeilingMessage(): string {
  return `You've reached the safety ceiling of ${MONITOR_HARD_CEILING} monitors.`;
}

/** Skip the change-digest email when the previous 'change' event for a monitor is
 * younger than this (plan G.10.9). The feed always records regardless. */
export const EMAIL_THROTTLE_SECONDS = 3600;

/** Cap on `monitors.last_content` post-normalization (plan G.10.1/7) — raw HTML with
 * nonces/timestamps would grow (and churn) unbounded otherwise. */
export const MAX_STORED_CONTENT_CHARS = 200_000;

/** Cap per side (old/new) of the `diffLines` excerpt fed to the LLM or used as the diff
 * fallback summary (plan G.10.7). */
export const MAX_EXCERPT_CHARS = 2_000;

/** Cap on a `monitor_events.summary` value, whichever source produced it (plan
 * G.10.7). */
export const MAX_SUMMARY_CHARS = 500;
