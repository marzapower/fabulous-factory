import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { defineI18n, NextIntlClientProvider } from "@factory/i18n";
import { I18nProvider } from "@factory/i18n/client";
import type { LocaleRouting } from "@factory/i18n/routing";

import { uiCatalog } from "../src/messages";

// Real config, built once via defineI18n() — mirrors what every app's i18n/config.ts
// does (plan §2.3): a two-locale routing so tests can exercise the locale-prefixed
// branch (`locale-switcher.test.tsx`) without a real app config, and `messagesFor()`
// exercised for real instead of a raw-catalog stand-in. `en` stays the default so every
// existing assertion on English copy is unaffected by this wrapper's introduction.
export const i18n = defineI18n({
  locales: ["en", "it"],
  defaultLocale: "en",
  catalogs: [uiCatalog],
});

export interface RenderI18nOptions extends Omit<RenderOptions, "wrapper"> {
  locale?: string;
}

/**
 * Test-only wrapper mirroring the real provider tree every app's root layout mounts
 * (`NextIntlClientProvider` + `I18nProvider`, plan §2.3) — a component under test calls
 * `useTranslations`/`useLocale`/`useI18nRouting`/`Link`/`useRouter` exactly as it does at
 * runtime. `routing` defaults to the shared two-locale `i18n.routing` but can be
 * overridden (e.g. `locale-switcher.test.tsx`'s single-locale D8 case) without needing a
 * second `defineI18n()` config just for a test; messages always come from the one real
 * `i18n.messagesFor(locale)`.
 */
export function i18nWrapper(
  locale: string = i18n.defaultLocale,
  routing: LocaleRouting = i18n.routing,
): ({ children }: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={i18n.messagesFor(locale)}>
        <I18nProvider routing={routing}>{children}</I18nProvider>
      </NextIntlClientProvider>
    );
  };
}

export function renderI18n(ui: ReactElement, options: RenderI18nOptions = {}): RenderResult {
  const { locale = i18n.defaultLocale, ...renderOptions } = options;

  return render(ui, {
    wrapper: i18nWrapper(locale),
    ...renderOptions,
  });
}
