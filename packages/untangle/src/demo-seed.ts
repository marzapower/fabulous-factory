/**
 * `seedUntangleDemo` — populates a demo workspace so `docker compose up` (or the
 * `apps/untangle/scripts/seed-demo.ts` script it's driven from) hands a visitor a
 * running, already-populated Untangle instance instead of an empty dashboard that only
 * fills in after a manual sign-up + paste.
 *
 * This function does NOT create the demo account itself — under the DAG (plan D.2:
 * config ← db ← {auth,email,observability} ← core ← llm ← jobs ← web),
 * `packages/untangle` cannot import `@factory/auth` (see
 * `dag-untangle-imports-config-db-core-llm-email-observability-jobs` in
 * `.dependency-cruiser.cjs`, which does not allowlist auth), and `packages/db` cannot
 * import `@factory/untangle` either (`dag-db-imports-only-config`). Both edges would be
 * required for a single self-contained "create the account and seed it" entry point at
 * this layer. Account creation instead lives in `apps/untangle/scripts/seed-demo.ts` —
 * an app script isn't bound by the packages/* DAG's inter-package rules the same way —
 * which calls `auth.api.signUpEmail` itself and then hands this function the resulting
 * `userId`.
 *
 * One fixed, realistic sample capture is run through the real `capturePipeline` /
 * `runPipeline` for that user (`inlineDriver`, `emit` a no-op — this is a script, not an
 * SSE-backed request), so the workspace has real captured/triaged tasks rather than
 * fixture rows inserted by hand. Idempotent: safe to call more than once for the same
 * user — skips if a capture run already exists.
 *
 * `findDemoUserId` (looking up the demo account by email, before
 * `apps/untangle/scripts/seed-demo.ts` decides whether to create it) lives here rather
 * than in that script for the same DAG reason: `.dependency-cruiser.cjs`'s
 * `no-bare-drizzle-outside-db-core-billing-brainstorm-untangle` rule confines direct
 * `drizzle-orm` imports to a fixed allowlist that includes `packages/untangle` but NOT
 * `apps/*` — an app script needing an `eq(...)` filter has to go through a package on
 * that allowlist, not import `drizzle-orm` itself.
 */
import "server-only";

import { getDb } from "@factory/db";
import { user as userTable } from "@factory/db/schema";
import { eq } from "drizzle-orm";

import { inlineDriver } from "./runs/drivers";
import { runPipeline } from "./runs/engine";
import { createRun, getLatestRunForUserByKind } from "./runs/queries";
import { capturePipeline, type CaptureState } from "./tasks/pipeline";
import { createCapture } from "./tasks/queries";

/** Must match verbatim — referenced from the README's demo-account section. */
export const DEMO_USER_EMAIL = "demo@fabulous.dev";

/**
 * Looks up the demo account's user id by its fixed email, or `null` if it doesn't exist
 * yet. `apps/untangle/scripts/seed-demo.ts` calls this before deciding whether to create
 * the account through `auth.api.signUpEmail` — see this module's doc comment for why
 * that decision can't be made in this package.
 */
export async function findDemoUserId(): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, DEMO_USER_EMAIL))
    .limit(1);
  return row?.id ?? null;
}

/**
 * A single fixed, realistic capture — meeting notes with a mix of clear action items,
 * something with a deadline, and something that reads as multi-step (so triage and, when
 * an LLM profile is configured, decomposition both have real material to work with). Kept
 * as one literal so the seeded workspace is identical across runs.
 */
const DEMO_CAPTURE_TEXT = `Notes from today's planning sync:

- Send the Q3 roadmap deck to the leadership team before Friday's board meeting.
- Fix the broken CSV export on the billing page — customers are hitting it, priority.
- Investigate why the onboarding email sometimes sends twice; get to the bottom of it.
- Redesign the settings page: consolidate the three separate tabs into one, update the
  copy, and add a proper empty state for teams with no members yet.
- Follow up with the design contractor about the illustration set.
- Renew the SSL certificate for the staging domain before it expires next month.`;

/**
 * Runs the fixed demo capture through the real pipeline for an already-existing user, the
 * first time only. Safe to call more than once for the same `userId` — the seed run is
 * looked up before being created.
 */
export async function seedUntangleDemo(userId: string): Promise<void> {
  const existingRun = await getLatestRunForUserByKind(userId, "capture");
  if (!existingRun) {
    const capture = await createCapture({ userId, source: "paste", rawText: DEMO_CAPTURE_TEXT });
    const run = await createRun({
      userId,
      kind: "capture",
      driver: "inline",
      // No plan/entitlement to resolve here — this is a one-shot seed script, not a
      // request; skip the daily-cap check entirely rather than pulling in
      // @factory/billing for a single, deterministic seed run.
      runsPerDay: null,
      enforceLimit: false,
    });
    const seed: CaptureState = {
      captureId: capture.id,
      rawText: DEMO_CAPTURE_TEXT,
      todayIso: new Date().toISOString().slice(0, 10),
      tasks: [],
    };
    await runPipeline({
      runId: run.id,
      userId,
      steps: capturePipeline,
      seed,
      driver: inlineDriver,
      // No transport to stream to — this is a script, not a request.
      emit: () => {},
    });
  }
}
