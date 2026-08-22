/**
 * `getEntitlement()` — the degradation matrix (plan H.2.3, corrected by H.10.5/6).
 * Billing DISABLED → the free plan, `runsPerDay: null` (unlimited — spec §6 verbatim,
 * H.10.16; the abuse ceiling lives in packages/jobs as `RUN_HARD_CEILING_PER_DAY`, out of
 * this package's scope). Billing enabled reads ONLY the Postgres `subscriptions` CACHE
 * (spec hot-path rule) — never the provider API — picking the best `ENTITLED_STATUSES`
 * row for the user, tie-broken by `current_period_end desc NULLS LAST` (H.10.5: a
 * per-subscription `last_event_created` means the newest-dated entitled row wins, not
 * necessarily the most-recently-written one). A winning row whose `plan_id` no longer
 * matches the catalog (config/Stripe drift, or a stale "unknown" sentinel written by the
 * webhook) resolves to `planId: "unknown"` with the FREE plan's limit — never MORE than
 * free (H.2.3) — but is still reported `source: "subscription"` since a real entitled
 * subscription row exists. `pastDue` surfaces the winning row's dunning stance (M10 debt
 * from M7) so the UI can nudge the user without ever revoking access mid-grace-period.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { FREE_PLAN_ID, getCapabilities, PLANS, type Plan, type PlanId } from "@factory/config";
import { getDb, schema } from "@factory/db";

/** Entitled statuses (plan H.1/H.2.3): `active`/`trialing` are self-explanatory;
 * `past_due` stays entitled as a grace-period stance (H.10.17) — default Stripe dunning
 * ends at `canceled`, and `unpaid` (a non-default config) is deliberately excluded. */
export const ENTITLED_STATUSES: readonly string[] = ["active", "trialing", "past_due"];

export interface Entitlement {
  planId: PlanId | "unknown";
  runsPerDay: number | null;
  source: "disabled" | "free" | "subscription";
  pastDue: boolean;
}

function freeEntitlement(source: "disabled" | "free"): Entitlement {
  const freePlan = PLANS[FREE_PLAN_ID];
  return {
    planId: FREE_PLAN_ID,
    runsPerDay: source === "disabled" ? null : freePlan.runsPerDay,
    source,
    pastDue: false,
  };
}

export async function getEntitlement(userId: string): Promise<Entitlement> {
  if (getCapabilities().billing === "disabled") {
    return freeEntitlement("disabled");
  }

  const db = getDb();
  const rows = await db
    .select({ planId: schema.subscriptions.planId, status: schema.subscriptions.status })
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        inArray(schema.subscriptions.status, [...ENTITLED_STATUSES]),
      ),
    )
    // NULLS LAST (H.10.5): Postgres defaults DESC to NULLS FIRST, which would let a
    // never-billed entitled row (current_period_end null) beat a dated one — the raw
    // `sql` fragment is required since drizzle's `desc()` helper has no NULLS clause.
    .orderBy(sql`${schema.subscriptions.currentPeriodEnd} desc nulls last`)
    .limit(1);

  const winner = rows[0];
  if (!winner) {
    return freeEntitlement("free");
  }

  // `winner.planId` is a runtime string off the cache row, not a `PlanId` literal — look
  // it up defensively; `Plan.id` is intentionally `string` (see plans.ts), so the cast
  // back to `PlanId` here just reflects the id-equals-key invariant plans.ts's own test
  // asserts, rather than trusting the catalog blindly.
  const pastDue = winner.status === "past_due";

  const plan = (PLANS as Record<string, Plan>)[winner.planId];
  if (plan) {
    return {
      planId: winner.planId as PlanId,
      runsPerDay: plan.runsPerDay,
      source: "subscription",
      pastDue,
    };
  }
  return {
    planId: "unknown",
    runsPerDay: PLANS[FREE_PLAN_ID].runsPerDay,
    source: "subscription",
    pastDue,
  };
}
