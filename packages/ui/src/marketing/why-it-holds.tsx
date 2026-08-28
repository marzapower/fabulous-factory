// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { useTranslations } from "@factory/i18n";

export function WhyItHolds() {
  const t = useTranslations("ui.marketing.whyItHolds");

  return (
    <section className="fab-safety border-y border-border bg-muted/20">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <p className="font-mono text-sm text-fab-marker">{t("eyebrow")}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{t("heading")}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{t("paragraph1")}</p>
          <p className="mt-4 text-lg text-muted-foreground">{t("paragraph2")}</p>
        </div>
      </div>
    </section>
  );
}
