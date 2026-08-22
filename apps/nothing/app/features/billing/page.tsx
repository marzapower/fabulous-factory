// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CodeBlock } from "@/components/marketing/code-block";
import { EnvTable } from "@/components/marketing/env-table";
import { FeaturePageShell } from "@/components/marketing/feature-page-shell";
import { FEATURES } from "@/components/marketing/features-meta";
import { StatusLight } from "@/components/marketing/status-light";

export const metadata: Metadata = {
  title: FEATURES.billing.title,
  description: FEATURES.billing.blurb,
};

// Capability-conditional UI (design spec §5.1) — the status light below reads a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

const entitlementSnippet = `export async function getEntitlement(userId: string): Promise<Entitlement> {
  if (getCapabilities().billing === "disabled") {
    // Free mode: unlimited runs, never a paywall for a disabled service. Any per-day
    // abuse ceiling on top of that is your action layer's own call — @factory/billing
    // only resolves the entitlement, it never enforces usage itself.
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
          <h2 className="text-xl font-semibold">What it does</h2>
          <p className="mt-2 text-muted-foreground">
            From a paywalled action&rsquo;s side: one call,{" "}
            <code className="font-mono">getEntitlement(userId)</code>, answers &quot;what is this
            user allowed today&quot; — a plan id and a <code className="font-mono">runsPerDay</code>{" "}
            limit, whether billing is configured or not.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">The rule it enforces</h2>
          <p className="mt-2 text-muted-foreground">
            <code className="font-mono">getEntitlement()</code> never talks to the billing provider
            directly — only the cached subscription row in Postgres — so a slow or down provider can
            never slow down or break a request that just needs to know a plan limit. With billing
            off, nothing is gated: every account gets the free plan&rsquo;s limit lifted entirely.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Real source</h2>
          <CodeBlock
            code={entitlementSnippet}
            caption="packages/billing/src/entitlement.ts — getEntitlement()"
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold">A working example</h2>
          <p className="mt-2 text-muted-foreground">
            Set both Stripe keys and checkout and webhooks switch on together. Leave them unset and
            every account gets <code className="font-mono">runsPerDay: null</code> — unlimited,
            subject only to the fixed, per-day abuse ceiling every profile enforces.
          </p>
          <div className="mt-4">
            <EnvTable vars={vars} />
          </div>
          <p className="mt-4 text-muted-foreground">
            This preset ships no billing card yet —{" "}
            <code className="font-mono">getEntitlement()</code> is the one call a paywalled feature
            needs to check a plan limit, whichever way you choose to render it. With Stripe
            configured, an upgrade raises that limit the moment the webhook lands.
          </p>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
