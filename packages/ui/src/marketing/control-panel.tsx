// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

"use client";

import type { ServiceName } from "@factory/config";

import { useTranslations } from "@factory/i18n";
import { useI18nRouting } from "@factory/i18n/client";

import { StatusLight } from "./status-light";

// Order matches the control-room "station" framing (design brief) — one row per
// `ServiceName`, read live from this deployment's runtime via `StatusLight`. Labels come
// from `ui.marketing.controlPanel.stations`.
const STATIONS: readonly ServiceName[] = ["billing", "llm", "jobs", "email", "analytics", "errors"];

// Locales are declared in code (i18n plan D4), not read from an env var — so this row
// carries no `StatusLight`. It reports what's declared, not an on/standby signal.
function LocalizationValue() {
  const t = useTranslations("ui.marketing.controlPanel");
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
      <span className="text-muted-foreground">
        {t("localizationDefault", { locale: defaultLocale })}
      </span>
    </span>
  );
}

export function ControlPanel() {
  const t = useTranslations("ui.marketing.controlPanel");

  return (
    <div className="fab-panel rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between border-b border-border pb-3 font-mono text-xs tracking-wide text-muted-foreground uppercase">
        <span>{t("header")}</span>
        <span>{t("liveMarker")}</span>
      </div>

      <ul className="flex flex-col">
        {STATIONS.map((service) => (
          <li
            key={service}
            className="fab-station flex items-center justify-between border-b border-border/60 py-2.5 last:border-b-0"
          >
            <span className="text-sm font-medium text-foreground">{t(`stations.${service}`)}</span>
            <StatusLight service={service} />
          </li>
        ))}
        <li className="fab-station flex items-center justify-between py-2.5">
          <span className="text-sm font-medium text-foreground">{t("localizationLabel")}</span>
          <LocalizationValue />
        </li>
      </ul>

      <p className="mt-4 border-t border-border pt-4 font-mono text-xs text-muted-foreground">
        {t("footer")}
      </p>
    </div>
  );
}
