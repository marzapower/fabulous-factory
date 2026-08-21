// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CodeBlock } from "@/components/marketing/code-block";
import { EnvTable } from "@/components/marketing/env-table";
import { FeaturePageShell } from "@/components/marketing/feature-page-shell";
import { FEATURES } from "@/components/marketing/features-meta";
import { StatusLight } from "@/components/marketing/status-light";

// Capability-conditional UI (design spec §5.1) — the status light below reads a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

const entitlementSnippet = `export async function getEntitlement(userId: string): Promise<Entitlement> {
  if (getCapabilities().billing === "disabled") {
    // Free mode: unlimited monitors, never a paywall for a disabled service.
    return freeEntitlement("disabled");
  }

  // Billing enabled reads ONLY the Postgres subscriptions cache — never the
  // provider API on this hot path.
  const [winner] = await db.select(...).from(schema.subscriptions)...;
  ...
}`;

export default function BillingFeaturePage() {
  const config = getClientConfig();
  const vars = FEATURES.billing.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell feature={FEATURES.billing} statusSlot={<StatusLight service="billing" />}>
        <section>
          <h2 className="text-xl font-semibold">What you get</h2>
          <p className="mt-2 text-muted-foreground">
            A <code className="font-mono">BillingProvider</code> seam with a Stripe adapter wired
            end to end — Checkout to start a subscription, a webhook that keeps a Postgres cache of
            it current, and an entitlement resolver every paywalled action reads. The template ships
            Free (3 monitors) and Pro (25 monitors) as a placeholder catalog; swap the price ids and
            you have a real plan structure. With billing off, nothing is gated — the product still
            demos itself in full.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">How it works here</h2>
          <p className="mt-2 text-muted-foreground">
            <code className="font-mono">getEntitlement()</code> is the one function every paywalled
            action calls. It never talks to the billing provider directly — only the cached
            subscription row in Postgres — so a slow or down provider can never slow down or break a
            request that just needs to know a plan limit.
          </p>
          <CodeBlock
            code={entitlementSnippet}
            caption="packages/billing/src/entitlement.ts — getEntitlement()"
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold">Turn it on</h2>
          <p className="mt-2 text-muted-foreground">
            Set both Stripe keys and checkout, webhooks, and the dashboard billing card switch on
            together. Leave them unset and every account gets the free plan&rsquo;s limit lifted
            entirely — <code className="font-mono">monitorLimit: null</code>, unlimited, never a
            hard stop.
          </p>
          <div className="mt-4">
            <EnvTable vars={vars} />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Try it</h2>
          <p className="mt-2 text-muted-foreground">
            Sign in and open the dashboard — the billing card shows your plan and monitor usage.
            With Stripe configured, upgrading to Pro raises the monitor limit from 3 to 25 the
            moment the webhook lands.
          </p>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
