// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { ReactNode } from "react";

import { useTranslations } from "@factory/i18n";

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import {
  CodeBlock,
  EnvTable,
  FeaturePageShell,
  FEATURES,
  StatusLight,
  featureMeta,
} from "../marketing";

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
  const t = useTranslations("ui.featurePages.billing");
  const tc = useTranslations("ui.featurePages.common");
  const tf = useTranslations("ui.features");
  const config = getClientConfig();
  const vars = FEATURES.billing.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell
        feature={featureMeta(tf, "billing")}
        brand={brand}
        emoji={emoji}
        statusSlot={<StatusLight service="billing" />}
      >
        <section>
          <h2 className="text-xl font-semibold">{tc("whatItDoes")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t.rich("whatItDoesBody", {
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">{tc("ruleItEnforces")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t.rich("ruleBody", { code: (chunks) => <code className="font-mono">{chunks}</code> })}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">{tc("realSource")}</h2>
          <CodeBlock
            code={entitlementSnippet}
            caption="packages/billing/src/entitlement.ts — getEntitlement()"
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold">{tc("workingExample")}</h2>
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
