import "server-only";

import { redirect as nextNavigationRedirect } from "next/navigation";
import { IntlErrorCode } from "next-intl";
import {
  getFormatter,
  getLocale,
  getMessages,
  getRequestConfig,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";

import { getI18nConfig, type I18nConfig } from "./index";
import { isLocale, localizeHref, type Locale } from "./routing";

export { getFormatter, getLocale, getMessages, getTranslations, setRequestLocale };

/**
 * next-intl's request-config factory (legacy `{ requestLocale }` form — still supported
 * in 4.13.x; `next/root-params` is the newer alternative but is compiler-replaced and
 * cannot run under vitest, so this package standardizes on `setRequestLocale` + this form
 * instead, per the plan).
 *
 * `onError` swallows a missing-message error everywhere (the per-key fallback in
 * `messagesFor()` already renders the default-locale string) and rethrows anything else.
 * `pnpm i18n:check` is the intended dev-time signal for missing keys.
 */
export function createRequestConfig(config: I18nConfig): ReturnType<typeof getRequestConfig> {
  return getRequestConfig(async ({ requestLocale }) => {
    const requested = await requestLocale;
    const locale = isLocale(config.routing, requested) ? requested : config.defaultLocale;

    return {
      locale,
      messages: config.messagesFor(locale),
      onError: (error) => {
        if (error.code !== IntlErrorCode.MISSING_MESSAGE) {
          throw error;
        }
      },
      getMessageFallback: ({ namespace, key }) => [namespace, key].filter(Boolean).join("."),
    };
  });
}

/**
 * Locale-aware server redirect: `redirect(localizeHref(routing, await getLocale(), href))`.
 *
 * DEVIATION from the plan's literal `(href: string): never` signature: `next/navigation`'s
 * own `redirect()` must throw *synchronously* to preserve "call it without awaiting, ends
 * execution right here" ergonomics (a fire-and-forget async call would let the enclosing
 * function's execution continue past it). Resolving the locale via next-intl's `getLocale()`
 * genuinely requires an `await` first, so this function is declared `async` /
 * `Promise<never>` and MUST be awaited by callers — matching next-intl's own
 * `createNavigation()`-generated `redirect` helper, which has the same async contract for
 * exactly the same reason.
 */
export async function redirect(href: string): Promise<never> {
  const config = getI18nConfig();
  const locale = await getLocale();
  nextNavigationRedirect(localizeHref(config.routing, locale, href));
}

/** Server counterpart of `useLocalizedHref` (client subpath). */
export async function localizedHref(href: string): Promise<string> {
  const config = getI18nConfig();
  const locale = await getLocale();
  return localizeHref(config.routing, locale, href);
}

export function generateLocaleParams(config: I18nConfig): Array<{ locale: Locale }> {
  return config.locales.map((locale) => ({ locale }));
}
