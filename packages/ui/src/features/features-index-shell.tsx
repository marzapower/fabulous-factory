// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { ReactNode } from "react";

import { useTranslations } from "@factory/i18n";

import { getClientConfig } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import {
  AlreadyWorks,
  ControlPanel,
  FeatureCard,
  FEATURE_LIST,
  KernelCode,
  QuickstartStrip,
  SiteFooter,
  SiteHeader,
  StatusLight,
  WhyItHolds,
  featureMeta,
} from "../marketing";

export function FeaturesIndexShell({
  brand,
  emoji,
  heroParagraph,
  degradationStrip,
}: {
  brand: string;
  emoji?: string;
  /** The one hero paragraph that names the preset by role ("sample product" vs.
   * "blank-slate preset") — everything else on this page is identical prose. */
  heroParagraph: ReactNode;
  /** Per-preset "the same run/board/chat, twice" strip — genuinely divergent
   * implementations per preset (T5's territory for the component itself; this shell
   * only renders whatever the app hands it). */
  degradationStrip: ReactNode;
}) {
  const t = useTranslations("ui.featurePages.index");
  const tf = useTranslations("ui.features");
  const config = getClientConfig();

  return (
    <ClientConfigProvider config={config}>
      <div className="fab-hub flex min-h-svh flex-col">
        <SiteHeader brand={brand} emoji={emoji} />

        <main className="flex-1">
          <section className="mx-auto max-w-6xl px-6 pt-16 pb-4">
            <div className="max-w-2xl">
              <p className="font-mono text-sm text-fab-marker">{t("eyebrow")}</p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight text-balance text-foreground">
                {t("heading")}
              </h1>
              <p className="mt-4 text-lg text-muted-foreground">{heroParagraph}</p>
              <p className="mt-4 text-lg text-muted-foreground">{t("argumentParagraph")}</p>
            </div>
          </section>

          <AlreadyWorks />

          <KernelCode />

          <WhyItHolds />

          <section className="mx-auto max-w-6xl px-6 py-20">
            <div className="mb-10 max-w-2xl">
              <p className="font-mono text-sm text-fab-marker">{t("liveEyebrow")}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                {t("liveHeading")}
              </h2>
              <p className="mt-3 text-muted-foreground">{t("liveBody")}</p>
            </div>
            <ControlPanel />
          </section>

          {degradationStrip}

          <QuickstartStrip />

          <section className="mx-auto max-w-6xl px-6 py-20">
            <div className="mb-10 max-w-2xl">
              <p className="font-mono text-sm text-fab-marker">{t("builtEyebrow")}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                {t("builtHeading")}
              </h2>
              <p className="mt-3 text-muted-foreground">{t("builtBody")}</p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_LIST.map((feature) => (
                <FeatureCard key={feature.key} feature={featureMeta(tf, feature.key)}>
                  <div className="flex flex-col gap-1">
                    {feature.services.map((s) => (
                      <StatusLight key={s} service={s} />
                    ))}
                  </div>
                </FeatureCard>
              ))}
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </ClientConfigProvider>
  );
}
