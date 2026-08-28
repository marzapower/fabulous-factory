// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { Bot, Clock, CreditCard, KeyRound, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useTranslations } from "@factory/i18n";

// Plain-language counterpart to `FEATURE_LIST` (components/marketing/features-meta.ts):
// same underlying pieces, described by what they do for a person instead of how they're
// built. No package names, no service keys, no links out — that hand-off happens later,
// in the dedicated "how it works" section and on /features.
type AlreadyWorksKey =
  "signingIn" | "takingPayments" | "sendingEmail" | "workOnSchedule" | "aiFeatures";

const ALREADY_WORKS: ReadonlyArray<{ key: AlreadyWorksKey; icon: LucideIcon }> = [
  { key: "signingIn", icon: KeyRound },
  { key: "takingPayments", icon: CreditCard },
  { key: "sendingEmail", icon: Mail },
  { key: "workOnSchedule", icon: Clock },
  { key: "aiFeatures", icon: Bot },
];

export function AlreadyWorks() {
  const t = useTranslations("ui.marketing.alreadyWorks");

  return (
    <section className="fab-works mx-auto max-w-6xl px-6 py-20">
      <div className="mb-10 max-w-2xl">
        <p className="font-mono text-sm text-fab-marker">{t("eyebrow")}</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{t("heading")}</h2>
        <p className="mt-3 text-muted-foreground">{t("subheading")}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {ALREADY_WORKS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className="fab-card flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
            >
              <Icon aria-hidden="true" className="size-7 text-fab-marker" />
              <h3 className="text-lg font-semibold text-foreground">
                {t(`items.${item.key}.title`)}
              </h3>
              <p className="text-sm text-muted-foreground">{t(`items.${item.key}.body`)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
