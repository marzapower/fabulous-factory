"use client";

import { useTranslations } from "@factory/i18n";
import { useI18nRouting } from "@factory/i18n/client";

import { useClientConfig } from "@factory/config/client";

// Keys must match the ServiceName union from @factory/config exactly (billing, llm,
// email, jobs, analytics, errors). Only on/off booleans are shown here — adapter
// identities (e.g. 'stripe', 'sentry') are recon data and never cross the server
// boundary (design spec §12).
const SERVICE_KEYS = ["billing", "llm", "email", "jobs", "analytics", "errors"] as const;

// Locales are declared in code (i18n plan D4), not read from an env var — so this row
// carries no enabled/disabled state. It reports what's declared, not an on/standby signal.
function LocalizationValue() {
  const t = useTranslations("ui.capabilityPanel");
  const { locales, defaultLocale } = useI18nRouting();

  if (locales.length < 2) {
    return (
      <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
        {t("localizationOnly", { locale: locales[0] })}
      </span>
    );
  }

  return (
    <span className="font-mono text-xs">
      <span className="text-emerald-600 dark:text-emerald-400">{locales.join(" · ")}</span>{" "}
      <span className="text-muted-foreground/70">
        {t("localizationDefault", { locale: defaultLocale })}
      </span>
    </span>
  );
}

export function CapabilityPanel() {
  const t = useTranslations("ui.capabilityPanel");
  const { capabilities } = useClientConfig();

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">{t("title")}</h2>
      <ul className="grid gap-2">
        {SERVICE_KEYS.map((service) => {
          const enabled = capabilities[service];
          return (
            <li
              key={service}
              className={
                enabled
                  ? "flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-sm text-primary"
                  : "flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
              }
            >
              <span>{t(`services.${service}`)}</span>
              <span>{enabled ? t("enabled") : t("disabled")}</span>
            </li>
          );
        })}
        <li className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          <span>{t("localizationLabel")}</span>
          <LocalizationValue />
        </li>
      </ul>
    </section>
  );
}
