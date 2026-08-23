// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { BillingFeaturePage } from "@factory/ui/features";
import { FEATURES } from "@factory/ui/marketing";

export const metadata: Metadata = {
  title: FEATURES.billing.title,
  description: FEATURES.billing.blurb,
};

// Capability-conditional UI (design spec §5.1) — the status light below reads a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

const entitlementSnippet = `export async function getEntitlement(userId: string): Promise<Entitlement> {
  if (getCapabilities().billing === "disabled") {
    // Free mode: unlimited runs, never a paywall for a disabled service. The abuse
    // ceiling still applies — it lives in packages/untangle, out of this package's scope.
    return freeEntitlement("disabled");
  }

  // Billing enabled reads ONLY the Postgres subscriptions cache — never the
  // provider API on this hot path.
  const [winner] = await db.select(...).from(schema.subscriptions)...;
  ...
}`;

export default function Page() {
  return (
    <BillingFeaturePage
      brand="Fabulous Untangle"
      emoji="🧶"
      entitlementSnippet={entitlementSnippet}
      exampleIntro={
        <>
          Set both Stripe keys and checkout, webhooks, and the dashboard billing card switch on
          together. Leave them unset and every account gets{" "}
          <code className="font-mono">runsPerDay: null</code> — unlimited, subject only to the
          fixed, per-day abuse ceiling every profile enforces.
        </>
      }
      exampleOutro={
        <>
          Sign in and open the dashboard — the billing card shows your plan and today&rsquo;s run
          usage. With Stripe configured, upgrading to Pro raises the daily run limit from 5 to 200
          the moment the webhook lands.
        </>
      }
    />
  );
}
