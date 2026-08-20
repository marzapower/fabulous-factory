/**
 * `checkMonitor()` — THE demo pipeline (plan G.2.5, as corrected by G.10.1/2/5/6/7/8/9).
 * Both the cron-driven worker (`demo/monitor-worker.ts`) and apps/web's `checkNow`
 * server action call this ONE function — see plan G.2.2.
 *
 * `checkMonitor` NEVER records (or returns) an `'error'` outcome: on a fetch/LLM-context
 * failure it throws WITHOUT writing any event. The worker path records the single
 * `'error'` event from its `onFailure` hook (`demo/record-error.ts`, plan G.10.5) — once
 * per exhausted retry cycle, not once per attempt. `checkNow` (apps/web, no retries)
 * catches the throw itself and assembles its own failure envelope. This is a declared
 * refinement of G.10.8, whose `'error'` status belongs to that ACTION layer, not here.
 */
import { createHash } from "node:crypto";

import { diffLines } from "diff";
import { and, desc, eq, sql } from "drizzle-orm";

import { isEnabled } from "@factory/config";
import { safeFetch, untrusted } from "@factory/core";
import { getDb, schema } from "@factory/db";
import { send } from "@factory/email";
import { generate } from "@factory/llm";
import { captureException } from "@factory/observability";
import { track } from "@factory/analytics";

import {
  EMAIL_THROTTLE_SECONDS,
  MAX_EXCERPT_CHARS,
  MAX_STORED_CONTENT_CHARS,
  MAX_SUMMARY_CHARS,
} from "./constants";

export type { Monitor, FeedEvent } from "./queries";

export interface CheckOutcome {
  status: "baseline" | "unchanged" | "changed";
  summary?: string;
  source?: "llm" | "diff";
}

type Fetcher = (url: string, init?: { maxBytes?: number; timeoutMs?: number }) => Promise<Response>;

// safeFetch returns undici's own `Response` type, which is structurally close to but not
// identical to the ambient `Response` global (see packages/core/src/safe-fetch.ts's own
// comment on this) — adapted here to the pinned `deps.fetcher` contract via one explicit
// cast, rather than exposing the mismatch to every caller.
const defaultFetcher: Fetcher = (url, init) => safeFetch(url, init) as unknown as Promise<Response>;

/** Short, trusted task instruction handed to `generate()` — the untrusted page content
 * only ever arrives via `context` (plan D.4/F: never interpolated into `task`). */
const MONITOR_SUMMARY_TASK =
  "Summarize in one or two short sentences what changed on this web page between the " +
  "old and new snapshots provided as context.";

function notFoundError(): Error & { code: string } {
  const error = new Error("monitor not found") as Error & { code: string };
  error.code = "MONITOR_NOT_FOUND";
  return error;
}

/**
 * Strips `<script>`/`<style>` blocks and all remaining tags, then collapses whitespace
 * (plan G.10.6) — hashing raw HTML would cry wolf on every tick (nonces, timestamps,
 * analytics beacons churn on every response even when the visible page hasn't changed).
 * No entity decoding beyond that: best-effort only — a highly dynamic page (client-side
 * rendered content, randomized ad slots) may still produce spurious diffs. Capped to
 * `MAX_STORED_CONTENT_CHARS` since the result is stored verbatim as `last_content`.
 */
export function normalizeContent(html: string): string {
  const withoutScripts = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  const withoutStyles = withoutScripts.replace(
    /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
    " ",
  );
  const withoutTags = withoutStyles.replace(/<[^>]*>/g, " ");
  const collapsed = withoutTags.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, MAX_STORED_CONTENT_CHARS);
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Changed-line excerpts (plan G.10.7), each capped to `MAX_EXCERPT_CHARS` — the LLM
 * context and the diff-fallback summary are both built from these. */
function buildExcerpts(
  oldContent: string,
  newContent: string,
): { oldExcerpt: string; newExcerpt: string } {
  const parts = diffLines(oldContent, newContent);
  const oldExcerpt = parts
    .filter((part) => part.removed)
    .map((part) => part.value)
    .join("")
    .slice(0, MAX_EXCERPT_CHARS);
  const newExcerpt = parts
    .filter((part) => part.added)
    .map((part) => part.value)
    .join("")
    .slice(0, MAX_EXCERPT_CHARS);
  return { oldExcerpt, newExcerpt };
}

function firstNonBlankLine(excerpt: string): string {
  return (
    excerpt
      .split("\n")
      .find((line) => line.trim().length > 0)
      ?.trim() ?? ""
  );
}

/** LLM-disabled / LLM-failure fallback: the first changed line from each side, formatted
 * `- old` / `+ new` (plan G.10.6/G.2.5), capped to `MAX_SUMMARY_CHARS`. */
function buildDiffSummary(oldExcerpt: string, newExcerpt: string): string {
  const summary = `- ${firstNonBlankLine(oldExcerpt)}\n+ ${firstNonBlankLine(newExcerpt)}`;
  return summary.slice(0, MAX_SUMMARY_CHARS);
}

type TxClaim =
  | { status: "baseline" }
  | { status: "unchanged" }
  | {
      status: "changed";
      eventId: string;
      throttled: boolean;
      oldExcerpt: string;
      newExcerpt: string;
    };

export async function checkMonitor(
  monitorId: string,
  deps?: { fetcher?: Fetcher },
): Promise<CheckOutcome> {
  const db = getDb();

  // (1) Load the monitor — no user scoping (worker context; ownership was already
  // checked when the row was created/queued). Projected (review fix): only what the
  // fetch/email/track steps below actually need — `lastContent`/`lastHash` are read
  // inside the transaction, only when actually required.
  const [monitor] = await db
    .select({
      id: schema.monitors.id,
      url: schema.monitors.url,
      name: schema.monitors.name,
      userId: schema.monitors.userId,
    })
    .from(schema.monitors)
    .where(eq(schema.monitors.id, monitorId));
  if (!monitor) {
    throw notFoundError();
  }

  // Captured immediately before the fetch (review fix, staleness guard below) — used to
  // detect a newer check committing while THIS fetch was still in flight.
  const fetchStartedAt = Date.now();

  // (2) Fetch OUTSIDE the per-monitor lock (plan G.10.2) — a network call must never
  // hold `pg_advisory_xact_lock`.
  const fetcher = deps?.fetcher ?? defaultFetcher;
  const response = await fetcher(monitor.url, { maxBytes: 2_097_152, timeoutMs: 15_000 });
  if (!response.ok) {
    // An error page's body must never be hashed as monitored content (review fix) — a
    // transient 503 (or its later recovery) would otherwise fire a spurious 'change'.
    // No DB writes have happened yet, so this throw leaves nothing to unwind.
    throw new Error(`HTTP ${response.status} fetching ${monitor.url}`);
  }
  const html = await response.text();

  // (3)/(4) Normalize + hash, also outside the lock.
  const newContent = normalizeContent(html);
  const newHash = sha256Hex(newContent);

  // (5) Compare-and-CLAIM inside a per-monitor advisory-locked transaction (plan
  // G.10.2, refined by the review fix below): the feed event for a real change is now
  // written IN this transaction — atomic with the claim, so a crash/failure after
  // commit can never lose the change from the feed. Only the LLM summary upgrade and
  // the email are best-effort work that happens after commit (a network call must
  // never hold the lock); the feed itself never lies.
  const claim: TxClaim = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"monitor:" + monitorId}))`);

    // Re-read projected to just the two columns the claim decision needs (review fix).
    const [current] = await tx
      .select({ lastHash: schema.monitors.lastHash, lastCheckedAt: schema.monitors.lastCheckedAt })
      .from(schema.monitors)
      .where(eq(schema.monitors.id, monitorId));

    // Stale-fetch guard (review fix): if a newer check already committed while THIS
    // fetch was in flight, our content is older than what's already stored — claiming
    // over it would regress the monitor to stale content and could fire a spurious
    // change on the NEXT check when the newer content reappears. Bail out as
    // `unchanged` without touching anything.
    if (current?.lastCheckedAt !== null && current?.lastCheckedAt !== undefined) {
      if (current.lastCheckedAt.getTime() >= fetchStartedAt) {
        return { status: "unchanged" };
      }
    }

    const lastHash = current?.lastHash ?? null;

    if (lastHash === null) {
      await tx
        .update(schema.monitors)
        .set({ lastHash: newHash, lastContent: newContent, lastCheckedAt: new Date() })
        .where(eq(schema.monitors.id, monitorId));
      await tx.insert(schema.monitorEvents).values({
        monitorId,
        kind: "baseline",
        summary: "First snapshot captured",
        source: "none",
      });
      return { status: "baseline" };
    }

    if (lastHash === newHash) {
      await tx
        .update(schema.monitors)
        .set({ lastCheckedAt: new Date() })
        .where(eq(schema.monitors.id, monitorId));
      return { status: "unchanged" };
    }

    // Changed: read `lastContent` via a second, targeted select (review fix) — the
    // 200KB column is only ever pulled off disk on the one path that needs it.
    const [contentRow] = await tx
      .select({ lastContent: schema.monitors.lastContent })
      .from(schema.monitors)
      .where(eq(schema.monitors.id, monitorId));
    const oldContent = contentRow?.lastContent ?? "";

    // Excerpts + the diff-fallback summary are pure CPU (plan G.10.7) — safe to compute
    // while holding the lock, unlike the LLM network call below.
    const { oldExcerpt, newExcerpt } = buildExcerpts(oldContent, newContent);
    const diffSummary = buildDiffSummary(oldExcerpt, newExcerpt);

    // Email throttle (plan G.10.9): read the previous 'change' event's age BEFORE
    // inserting this one, so "previous" unambiguously means the one before this check.
    const [previousChange] = await tx
      .select({ createdAt: schema.monitorEvents.createdAt })
      .from(schema.monitorEvents)
      .where(
        and(eq(schema.monitorEvents.monitorId, monitorId), eq(schema.monitorEvents.kind, "change")),
      )
      .orderBy(desc(schema.monitorEvents.createdAt))
      .limit(1);
    const throttled =
      previousChange !== undefined &&
      (Date.now() - previousChange.createdAt.getTime()) / 1000 < EMAIL_THROTTLE_SECONDS;

    await tx
      .update(schema.monitors)
      .set({ lastHash: newHash, lastContent: newContent, lastCheckedAt: new Date() })
      .where(eq(schema.monitors.id, monitorId));

    // The feed row goes in NOW, with the diff summary — atomic with the claim (review
    // fix). A post-commit crash before the LLM upgrade below still leaves a correct,
    // never-lost feed entry; only the nicer LLM phrasing is what's at risk.
    const [insertedEvent] = await tx
      .insert(schema.monitorEvents)
      .values({ monitorId, kind: "change", summary: diffSummary, source: "diff" })
      .returning({ id: schema.monitorEvents.id });
    if (!insertedEvent) {
      throw new Error("checkMonitor: change event insert returned no row");
    }

    return { status: "changed", eventId: insertedEvent.id, throttled, oldExcerpt, newExcerpt };
  });

  if (claim.status === "baseline") {
    return { status: "baseline" };
  }
  if (claim.status === "unchanged") {
    return { status: "unchanged" };
  }

  // From here on: `claim.status === "changed"` — the feed event already exists
  // (inserted inside the transaction above with the diff summary). Everything below is
  // a post-commit UPGRADE, never a first write: the LLM summary replaces the diff
  // summary on success, and the email/track calls follow. None of this can un-happen
  // the feed entry if it fails partway.
  let summary = buildDiffSummary(claim.oldExcerpt, claim.newExcerpt);
  let source: "llm" | "diff" = "diff";

  if (isEnabled("llm")) {
    try {
      const result = await generate({
        task: MONITOR_SUMMARY_TASK,
        context: [untrusted(claim.oldExcerpt), untrusted(claim.newExcerpt)],
        quality: "cheap",
        maxCostCents: 5,
        promptId: "monitor-summary",
        maxOutputTokens: 256,
      });
      const llmSummary = result.output.slice(0, MAX_SUMMARY_CHARS);
      await db
        .update(schema.monitorEvents)
        .set({ summary: llmSummary, source: "llm" })
        .where(eq(schema.monitorEvents.id, claim.eventId));
      summary = llmSummary;
      source = "llm";
    } catch (error) {
      // A summary failure must not fail the check (declared refinement of G.2.5's
      // rethrow, which applies to FETCH errors only) — the feed keeps its diff summary
      // (already committed), no event update.
      captureException(error, { monitorId, stage: "monitor-summary" });
    }
  }

  if (isEnabled("email") && !claim.throttled) {
    const [owner] = await db
      .select({ email: schema.user.email })
      .from(schema.monitors)
      .innerJoin(schema.user, eq(schema.monitors.userId, schema.user.id))
      .where(eq(schema.monitors.id, monitorId));

    if (owner) {
      const result = await send("change-digest", owner.email, {
        monitorName: monitor.name,
        url: monitor.url,
        summary,
        source,
      });
      // Fire-and-log (plan): a failed/undelivered send must not fail the check. The
      // 'console' transport never claims delivery by design — only warn on the other
      // "should have delivered but didn't" reasons.
      if (!result.delivered && result.reason !== "console") {
        console.warn("[@factory/jobs] change-digest email not delivered:", result.reason);
      }
    }
  }

  // (9) Analytics — fire-and-forget by contract (packages/analytics/src/track.ts).
  track("monitor_change_detected", { distinctId: monitor.userId, monitorId });

  return { status: "changed", summary, source };
}
