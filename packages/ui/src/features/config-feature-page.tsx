// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { useTranslations } from "@factory/i18n";

import { getClientConfig } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CodeBlock, FeaturePageShell, LiveExample, featureMeta } from "../marketing";
import { CapabilityMap } from "./capability-map";

const buildClientConfigSnippet = `export interface ClientConfig {
  capabilities: Record<ServiceName, boolean>;
  appUrl: string;
  posthog: { key: string; host: string } | null;
}

// ON/OFF BOOLEANS ONLY. Adapter identities ('stripe', 'sentry', 'resend', …) are recon
// data for an attacker and must never appear here — only whether a capability is
// enabled, plus the small set of genuinely non-secret publishables.
export function buildClientConfig(env: RawEnv, capabilities: Capabilities): ClientConfig {
  ...
}`;

export function ConfigFeaturePage({ brand, emoji }: { brand: string; emoji?: string }) {
  const t = useTranslations("ui.featurePages.config");
  const tc = useTranslations("ui.featurePages.common");
  const tf = useTranslations("ui.features");
  const config = getClientConfig();

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell feature={featureMeta(tf, "config")} brand={brand} emoji={emoji}>
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
          <p className="mt-2 text-muted-foreground">{t("realSourceIntro")}</p>
          <CodeBlock
            code={buildClientConfigSnippet}
            caption="packages/config/src/public-config.ts — buildClientConfig()"
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold">{tc("workingExample")}</h2>
          <p className="mt-2 text-muted-foreground">{t("workingExampleIntro")}</p>
          <div className="mt-4">
            <LiveExample kind="live" title={t("liveExampleTitle")}>
              <CapabilityMap />
            </LiveExample>
          </div>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
