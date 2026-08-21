/**
 * Typed plan-catalog accessors (plan H.2.2/H.2.10, corrected by H.10.6). `PLANS`'s own
 * `as const satisfies Record<string, Plan>` (packages/config/src/plans.ts) narrows each
 * entry to its OWN literal shape for the catalog's internal validation — e.g. the free
 * plan's `providerRefs` narrows to `{}`, dropping the `Plan` interface's optional
 * `stripe` key from that member's type, which breaks a union-wide `.providerRefs.stripe`
 * read. `planById` re-widens a single entry back to `Plan` via plain assignability (no
 * cast) so the rest of this package can read the catalog by a runtime-computed `PlanId`.
 */
import { PLANS, type Plan, type PlanId } from "@factory/config";

export function planById(id: PlanId): Plan {
  return PLANS[id];
}

/**
 * Reverse lookup from a Stripe price id to the catalog `PlanId`. Scans `PLANS`' catalog
 * — small and static, so a linear scan needs no index. Returns `"unknown"` when no
 * plan's ref matches: the webhook's subscription upsert treats that as catalog/Stripe
 * drift (doctor-reported), never a silent entitlement upgrade.
 */
export function resolvePlanId(priceId: string): PlanId | "unknown" {
  for (const id of Object.keys(PLANS) as PlanId[]) {
    if (planById(id).providerRefs.stripe === priceId) {
      return id;
    }
  }
  return "unknown";
}
