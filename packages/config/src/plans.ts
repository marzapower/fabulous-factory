/**
 * Plan catalog (spec §5.3, H.2.2). Pure data — NO imports, DAG-root safe: `packages/db`
 * (subscriptions cache), `packages/billing` (entitlement resolution, checkout price
 * lookup), and `packages/jobs` (monitor cap) all read this without creating an edge back
 * to anything else.
 *
 * This is a PLACEHOLDER catalog for the template — one free plan, one paid plan wired to
 * a fake Stripe price id. Adopters replace `pro`'s `providerRefs.stripe` with a real
 * Stripe Price id (and are free to add/rename/remove plans entirely) before enabling
 * billing in production; `pnpm factory:doctor` warns when a paid plan's ref still looks
 * like the placeholder.
 */
export interface Plan {
  // Not `PlanId` here — `PlanId` is `keyof typeof PLANS`, and `PLANS` is validated
  // against `Plan` via `satisfies` below, so `id: PlanId` would be a circular type
  // reference (TS2502/TS2456). `string` is enough: each entry's `id` still narrows to
  // its own literal (`"free"`, `"pro"`) under `as const`, and the invariant test below
  // asserts `id === key` for every entry, which is the property `id: PlanId` would have
  // bought at the type level anyway.
  id: string;
  name: string;
  /** Monitors allowed on this plan. `null` = unlimited (subject to the separate
   * `MONITOR_HARD_CEILING` abuse ceiling in packages/jobs, enforced in every profile). */
  monitorLimit: number | null;
  /** `null` for the free plan — it is never purchased. */
  priceUsdMonthly: number | null;
  /** Provider-specific identifiers this plan maps to. Empty for the free plan (never
   * checked out through a provider). */
  providerRefs: { stripe?: string };
}

/** `satisfies` (not an annotation) so `PlanId` derives as the literal union of the
 * catalog's own keys, not the widened `string` a type annotation would force. */
export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    monitorLimit: 3,
    priceUsdMonthly: null,
    providerRefs: {},
  },
  pro: {
    id: "pro",
    name: "Pro",
    monitorLimit: 25,
    priceUsdMonthly: 9,
    providerRefs: { stripe: "price_REPLACE_ME" },
  },
} as const satisfies Record<string, Plan>;

export type PlanId = keyof typeof PLANS;

export const FREE_PLAN_ID: PlanId = "free";
