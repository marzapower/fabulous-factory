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

/** Two labeled lights, side by side — observability covers two independent
 * capabilities (analytics + errors), so one boolean can't speak for both. */
function ObservabilityStatus() {
  const t = useTranslations("ui.featurePages.observability");

  return (
    <div className="fab-status flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{t("statusAnalytics")}</span>
        <StatusLight service="analytics" />
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{t("statusErrors")}</span>
        <StatusLight service="errors" />
      </div>
    </div>
  );
}

const trackSnippet = `export function track(event: string, opts: TrackOptions): void {
  if (getCapabilities().analytics !== "posthog") return;

  const { distinctId, ...properties } = opts;
  // Fire-and-forget: never awaited, never rejects the caller's control flow.
  void getPostHogClient()
    .then((client) => client.capture({ distinctId, event, properties }))
    .catch((error) => console.error("[@factory/analytics] track failed:", error));
}`;

export function ObservabilityFeaturePage({
  brand,
  emoji,
  closingNote,
}: {
  brand: string;
  emoji?: string;
  /** The closing "A working example" paragraph — the one claim that must track what
   * this preset's own code actually does with `track()`, never a generic template
   * sentence copied from another preset (K.16 truth sweep). */
  closingNote: ReactNode;
}) {
  const t = useTranslations("ui.featurePages.observability");
  const tc = useTranslations("ui.featurePages.common");
  const tf = useTranslations("ui.features");
  const config = getClientConfig();
  const vars = FEATURES.observability.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell
        feature={featureMeta(tf, "observability")}
        brand={brand}
        emoji={emoji}
        statusSlot={<ObservabilityStatus />}
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
          <CodeBlock code={trackSnippet} caption="packages/analytics/src/track.ts — track()" />
        </section>

        <section>
          <h2 className="text-xl font-semibold">{tc("workingExample")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t.rich("workingExampleBody", {
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
          <div className="mt-4">
            <EnvTable vars={vars} />
          </div>
          <p className="mt-4 text-muted-foreground">{closingNote}</p>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
