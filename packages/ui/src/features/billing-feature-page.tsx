// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { ReactNode } from "react";

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CodeBlock, EnvTable, FeaturePageShell, FEATURES, StatusLight } from "../marketing";

export function BillingFeaturePage({
  brand,
  emoji,
  entitlementSnippet,
  exampleIntro,
  exampleOutro,
}: {
  brand: string;
  emoji?: string;
  /** `getEntitlement()`, quoted per preset — the free-mode comment differs slightly by
   * preset (whether it names a separate abuse-ceiling caller). */
  entitlementSnippet: string;
  /** Paragraph before the env table — differs by whether this preset renders a billing
   * card, so the claim of what switches on together stays honest per preset. */
  exampleIntro: ReactNode;
  /** Paragraph after the env table — the one that must never claim a dashboard billing
   * card or run usage this preset doesn't actually render (K.16 truth sweep). */
  exampleOutro: ReactNode;
}) {
  const config = getClientConfig();
  const vars = FEATURES.billing.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell
        feature={FEATURES.billing}
        brand={brand}
        emoji={emoji}
        statusSlot={<StatusLight service="billing" />}
      >
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
          <p className="mt-2 text-muted-foreground">{exampleIntro}</p>
          <div className="mt-4">
            <EnvTable vars={vars} />
          </div>
          <p className="mt-4 text-muted-foreground">{exampleOutro}</p>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
