// Isomorphic — NO "use client", NO "server-only". Every next-intl hook re-exported below
// MUST come from next-intl's root entry (imported right here, not from a "use client"
// file) so the dual-environment implementation (react-server vs. client) is selected by
// whichever graph imports THIS file — re-exporting a hook from a "use client" module would
// turn it into a client reference that throws when a server component imports it.
import type { LocaleRouting } from "./routing";

export type Locale = string;

export interface Catalog<NS extends string = string> {
  namespace: NS;
  /** locale -> nested message tree (JSON). Must contain the app's defaultLocale. */
  messages: Record<Locale, Messages>;
}

export type Messages = { [key: string]: string | Messages };

export interface I18nConfigInput<L extends readonly [Locale, ...Locale[]]> {
  locales: L;
  defaultLocale: L[number];
  catalogs: readonly Catalog[];
  /** Cookie name, default "NEXT_LOCALE". Read by the proxy + written by the switcher. */
  cookieName?: string;
}

export interface I18nConfig<
  L extends readonly [Locale, ...Locale[]] = readonly [Locale, ...Locale[]],
> {
  locales: L;
  defaultLocale: L[number];
  cookieName: string;
  // Serialisable, no next-intl types inside — passed to createAuthProxy and I18nProvider.
  routing: LocaleRouting;
  /**
   * Merged, namespaced messages for `locale`, with per-key fallback to defaultLocale.
   * Throws RangeError for an unknown locale. Memoized per locale — repeat calls for the
   * same locale return the same object reference.
   */
  messagesFor(locale: Locale): Messages;
}

const DEFAULT_COOKIE_NAME = "NEXT_LOCALE";

function isPlainObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep-merges `override` onto `base`: every key in `override` wins, recursively for
 *  nested objects; keys present only in `base` survive — this is what gives `messagesFor`
 *  real per-key fallback to the default locale. */
function deepMerge(base: Messages, override: Messages): Messages {
  const result: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    result[key] =
      isPlainObject(value) && isPlainObject(existing) ? deepMerge(existing, value) : value;
  }
  return result;
}

// Module-level singleton, set by defineI18n(). The app's i18n/request.ts imports the
// app's i18n/config.ts (which calls defineI18n) eagerly, so by the time any server
// helper in ./server.ts runs during a request, this slot is already populated. It is
// NOT populated in app/api/** route handlers, which don't import that graph — server
// helpers that read it (redirect(), localizedHref()) must not be called from API code.
let currentConfig: I18nConfig | undefined;

/**
 * - Throws if defaultLocale is not in locales, if locales has duplicates, or if a
 *   catalog lacks messages for the default locale.
 * - messagesFor(l) = for each catalog: { [ns]: deepMerge(messages[default], messages[l] ?? {}) }
 * - Registers the config in the module-level slot read by getI18nConfig().
 */
export function defineI18n<L extends readonly [Locale, ...Locale[]]>(
  input: I18nConfigInput<L>,
): I18nConfig<L> {
  const { locales, defaultLocale, catalogs, cookieName = DEFAULT_COOKIE_NAME } = input;

  if (!locales.includes(defaultLocale)) {
    throw new RangeError(
      `defineI18n: defaultLocale "${defaultLocale}" is not one of the declared locales [${locales.join(", ")}].`,
    );
  }

  const seen = new Set<Locale>();
  for (const locale of locales) {
    if (seen.has(locale)) {
      throw new RangeError(`defineI18n: duplicate locale "${locale}" in [${locales.join(", ")}].`);
    }
    seen.add(locale);
  }

  for (const catalog of catalogs) {
    if (!(defaultLocale in catalog.messages)) {
      throw new RangeError(
        `defineI18n: catalog "${catalog.namespace}" is missing messages for the default locale "${defaultLocale}".`,
      );
    }
  }

  // Memoized per locale (M8-equivalent review fix): messagesFor is called on every
  // request via createRequestConfig, and missingKeys's removal leaves messagesFor as the
  // only consumer of the merged catalogs, so there's no other reason to recompute the
  // same deep-merge on every call for a locale already seen.
  const messagesCache = new Map<Locale, Messages>();

  function messagesFor(locale: Locale): Messages {
    if (!locales.includes(locale)) {
      throw new RangeError(
        `messagesFor: unknown locale "${locale}"; declared locales are [${locales.join(", ")}].`,
      );
    }
    const cached = messagesCache.get(locale);
    if (cached) return cached;

    const merged: Messages = {};
    for (const catalog of catalogs) {
      const base = catalog.messages[defaultLocale] ?? {};
      merged[catalog.namespace] =
        locale === defaultLocale ? base : deepMerge(base, catalog.messages[locale] ?? {});
    }
    messagesCache.set(locale, merged);
    return merged;
  }

  const routing: LocaleRouting = { locales, defaultLocale, cookieName };

  const config: I18nConfig<L> = {
    locales,
    defaultLocale,
    cookieName,
    routing,
    messagesFor,
  };

  currentConfig = config;
  return config;
}

/** Throws if defineI18n() has not run yet (server misuse guard). */
export function getI18nConfig(): I18nConfig {
  if (!currentConfig) {
    throw new Error(
      "getI18nConfig() was called before defineI18n() ran. Make sure the app's " +
        "i18n/config.ts module (which calls defineI18n) is imported eagerly ahead of any " +
        "server helper that needs it — e.g. via i18n/request.ts and app/[locale]/layout.tsx.",
    );
  }
  return currentConfig;
}

// Message-registry interface — packages augment it via declaration merging (each
// package's messages/index.ts adds its own namespace key), the app reads the merged
// result. An index signature, not `{}` — `@typescript-eslint/no-empty-object-type` is an
// error under tseslint recommended, and the signature also satisfies next-intl's own
// `AppConfig["Messages"]` constraint.
export interface MessageRegistry {
  [namespace: string]: unknown;
}

declare module "next-intl" {
  interface AppConfig {
    Messages: MessageRegistry;
  }
}

// next-intl root re-exports (the ONLY sanctioned import path for these, in every package
// and app — see the file-level comment above).
export {
  useTranslations,
  useLocale,
  useFormatter,
  useMessages,
  useNow,
  useTimeZone,
  NextIntlClientProvider,
  hasLocale,
} from "next-intl";
