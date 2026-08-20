/**
 * Demo domain constants (plan G.4/G.10.7). `make-it-yours` deletes this file with the
 * rest of the demo.
 */

/** Per-user monitor cap (plan G.2.6) — M7 replaces this with real billing plans.
 * Enforced inside `createMonitorRow` (review fix — see its own comment), not at the
 * action layer, to close a check-then-insert race between concurrent creates. */
export const MAX_MONITORS = 20;

/** Friendly message for the `monitor_limit_reached` `ApiError` thrown by
 * `createMonitorRow` at the cap — shared so the action layer and any other caller never
 * drift from `createMonitorRow`'s own wording. */
export const MONITOR_LIMIT_MESSAGE = `You've reached the ${MAX_MONITORS}-monitor limit for this demo. Delete one to add another.`;

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
