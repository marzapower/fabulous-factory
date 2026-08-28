/**
 * Pure formatting helpers for the workspace's mono (machine) voice — model names,
 * tokens, cents, milliseconds, due dates. No DOM, no `Intl` locale surprises beyond
 * what's needed, unit-tested directly (`apps/web/test/format.test.ts`) since
 * `apps/web/test/` runs in a node environment with no DOM (m11-untangle-workspace.md
 * K.8.4).
 */

/** `costCents` is `numeric(14, 6)` — fractions of a cent are the norm (a single LLM call
 * routinely costs less than 1¢), so this always renders two decimal places of a CENT
 * figure, never dollars. `null` (a step that did no billable work, e.g. a heuristic
 * fallback or a skipped step) renders as an em dash, not `0.00¢` — those are different
 * facts and must not look the same. */
export function formatCents(costCents: number | null | undefined): string {
  if (costCents === null || costCents === undefined) return "—";
  return `${costCents.toFixed(2)}¢`;
}

/** Sub-second durations render in whole milliseconds (the unit the DB column is in);
 * durations at or above one second switch to seconds with one decimal, which is what a
 * human actually wants to read for an LLM call ("1.2s", not "1234ms"). */
export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) return "—";
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

const DATETIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Renders a run's `startedAt` for the run-history list (`app/[locale]/runs/page.tsx`).
 * Pinned `en-US`/UTC, like every other formatter in this module — deliberately NOT
 * `Date.prototype.toLocaleString()`, whose output depends on the server/runtime's own
 * default locale AND timezone rather than anything declared in code, so the same run
 * could render a different timestamp shape depending on where the process happens to
 * run. */
export function formatDateTime(date: Date): string {
  return DATETIME_FORMAT.format(date);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { day: "numeric" });
const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short" });

/**
 * Renders a task's `dueAt` (ISO string, per K.1.8 — pipeline state never carries a raw
 * `Date`) relative to `now` (defaults to `new Date()`, injectable for deterministic
 * tests): `null` → "no due date"; today/tomorrow get their own word; anything overdue
 * (strictly before today) is flagged "overdue"; everything else renders as
 * "fri 22 aug" — lowercase, matching the workspace's quiet mono register.
 */
export function formatDue(dueAtIso: string | null | undefined, now: Date = new Date()): string {
  if (!dueAtIso) return "no due date";
  const due = new Date(dueAtIso);
  if (Number.isNaN(due.getTime())) return "no due date";

  const today = startOfDay(now);
  const dueDay = startOfDay(due);
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / DAY_MS);

  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  const weekday = WEEKDAY_FORMAT.format(due).toLowerCase();
  const day = DAY_FORMAT.format(due);
  const month = MONTH_FORMAT.format(due).toLowerCase();
  return `${weekday} ${day} ${month}`;
}
