"use client";

import { createContext, useContext, type JSX, type ReactNode } from "react";

import { useLocale } from "./index";
import { isLocale, localizeHref, type Locale, type LocaleRouting } from "./routing";

// NO next-intl hook re-exports here — they live in the isomorphic root (./index.ts).
// Re-exporting a next-intl hook from a "use client" module would strip it of its ability
// to run inside a plain server component (it would become a client reference).

const I18nRoutingContext = createContext<LocaleRouting | null>(null);

export interface I18nProviderProps {
  routing: LocaleRouting;
  children: ReactNode;
}

/**
 * React context carrying only the app's `LocaleRouting` shape. `NextIntlClientProvider`
 * (locale + messages) is rendered separately by the root layout — this provider exists so
 * `useI18nRouting` / `useLocalizedHref` / the `./navigation` helpers can localize hrefs
 * without threading `routing` through every component.
 */
export function I18nProvider({ routing, children }: I18nProviderProps): JSX.Element {
  return <I18nRoutingContext.Provider value={routing}>{children}</I18nRoutingContext.Provider>;
}

/** Throws when rendered outside an `<I18nProvider>`. */
export function useI18nRouting(): LocaleRouting {
  const routing = useContext(I18nRoutingContext);
  if (!routing) {
    throw new Error(
      "useI18nRouting() was called outside an <I18nProvider>. Wrap the tree with " +
        "<I18nProvider routing={i18n.routing}> in the root layout first.",
    );
  }
  return routing;
}

/** `localizeHref(routing, useLocale(), href)` — CLIENT ONLY. Server code uses
 *  `@factory/i18n/server`'s `localizedHref()` instead. */
export function useLocalizedHref(): (href: string) => string {
  const routing = useI18nRouting();
  const locale = useLocale();
  return (href: string) => localizeHref(routing, locale, href);
}

/** Writes the locale-switcher cookie. Called only by the switcher — the proxy never
 *  writes this cookie itself (D3: no Accept-Language detection, no implicit writes).
 *
 *  The writer enforces the same invariant as the reader (`isLocale`, checked by the proxy
 *  before ever trusting the cookie — `packages/ui/src/middleware.ts` step 3): the cookie
 *  only ever holds a declared locale. An undeclared `locale` is a caller bug (the switcher
 *  only ever offers `routing.locales`), not untrusted input, but this still refuses to
 *  write it rather than let a stray value sit in the cookie jar until the reader discards
 *  it anyway. `encodeURIComponent` keeps the cookie value a single well-formed token even
 *  though every declared locale is expected to already be a plain identifier. */
export function setLocaleCookie(routing: LocaleRouting, locale: Locale): void {
  if (!isLocale(routing, locale)) {
    return;
  }
  const secure =
    typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${routing.cookieName}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}
