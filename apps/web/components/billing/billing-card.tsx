import { CreditCard, TriangleAlert } from "lucide-react";

import type { Entitlement } from "@factory/billing";
import { FREE_PLAN_ID, PLANS } from "@factory/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ManageSubscriptionButton, UpgradeButton } from "@/components/billing/billing-actions";

export interface BillingCardProps {
  // The pinned `@factory/billing` type (H.10 review fix) — a locally re-declared
  // structural duplicate of it could silently drift out of sync (an added `source`
  // variant, a renamed field) without either side's compiler ever catching it.
  entitlement: Entitlement;
  monitorCount: number;
}

/**
 * Dashboard billing card (m7-billing.md H.10.12) — mounted by the dashboard page ONLY
 * when `isEnabled("billing")` (the milestone's exit criterion: zero billing UI when
 * billing is off). Reads the same mono-chip / grayscale vocabulary as `MonitorsCard`
 * and `FeedCard` (rounded-full `bg-muted` chips, `font-mono` numerics) and extends it
 * with one new element for this card specifically — a thin usage meter — since this is
 * the one card in the dashboard representing a paid-product moment, not boilerplate.
 */
export function BillingCard({ entitlement, monitorCount }: BillingCardProps) {
  const isSubscribed = entitlement.source === "subscription";

  if (entitlement.planId === "unknown") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CreditCard className="size-5 text-muted-foreground" aria-hidden="true" />
            Billing
          </CardTitle>
          <CardDescription>Plan not recognized.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Your subscription doesn&apos;t match a plan in the catalog. Check the price IDs in{" "}
            <code className="font-mono">packages/config/src/plans.ts</code> against your Stripe
            account.
          </p>
          {/* Catalog/Stripe drift must never strand a paying customer (H.10 review fix) —
              `entitlement.source === "subscription"` here means a real, entitled Stripe
              subscription IS on file, just against a price the catalog no longer
              recognizes; the portal (unlike Checkout) never depends on plan resolution. */}
          {isSubscribed && <ManageSubscriptionButton />}
        </CardContent>
      </Card>
    );
  }

  const plan = PLANS[entitlement.planId];
  const limit = entitlement.monitorLimit;
  const uncapped = limit === null;
  const overLimit = limit !== null && monitorCount > limit;
  const fillPercent = uncapped
    ? 0
    : Math.min(100, Math.round((monitorCount / Math.max(limit, 1)) * 100));

  const upgradeTarget = Object.values(PLANS).find((candidate) => candidate.id !== FREE_PLAN_ID);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CreditCard className="size-5 text-muted-foreground" aria-hidden="true" />
              Billing
            </CardTitle>
            <CardDescription>You&apos;re on the {plan.name} plan.</CardDescription>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
            {monitorCount}/{uncapped ? <span aria-label="unlimited">&#8734;</span> : limit}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tracking-tight">
            {plan.priceUsdMonthly === null ? "Free" : `$${plan.priceUsdMonthly}`}
          </span>
          {plan.priceUsdMonthly !== null && (
            <span className="text-sm text-muted-foreground">/mo</span>
          )}
        </div>

        {!uncapped && (
          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  overLimit ? "bg-destructive" : "bg-foreground",
                )}
                style={{ width: `${overLimit ? 100 : fillPercent}%` }}
              />
            </div>
            {overLimit && (
              <p className="text-xs text-muted-foreground">
                You&apos;re over the {plan.name} plan&apos;s {limit}-monitor limit. Existing
                monitors keep running — remove one or upgrade to add another.
              </p>
            )}
          </div>
        )}

        {isSubscribed ? (
          <ManageSubscriptionButton />
        ) : upgradeTarget ? (
          <UpgradeButton plan={upgradeTarget.id} planName={upgradeTarget.name} />
        ) : null}
      </CardContent>
    </Card>
  );
}
