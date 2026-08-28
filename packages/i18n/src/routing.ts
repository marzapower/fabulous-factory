// Pure — deliberately imports nothing (no `next-intl`, no other file in this package)
// so it's safe to import from the proxy (`packages/ui/src/middleware.ts`, a guarded
// zone) and from client code alike, with zero transitive weight.

export type Locale = string;

export interface LocaleRouting {
  locales: readonly Locale[];
  defaultLocale: Locale;
  cookieName: string;
}

/** Type guard: true iff `candidate` is a string present in `routing.locales`. */
export function isLocale(routing: LocaleRouting, candidate: unknown): candidate is Locale {
  return typeof candidate === "string" && routing.locales.includes(candidate);
}

// Matches "/<segment>" or "/<segment>/<rest>" — a strict, single-segment match. A
// pathname whose first segment isn't in `routing.locales` (e.g. "/itx/login") is left
// completely unchanged, at the default locale — never partially stripped.
const FIRST_SEGMENT = /^\/([^/]+)(\/.*)?$/;

/**
 * "/it/login" -> { locale: "it", pathname: "/login", prefixed: true }
 * "/login" -> { locale: defaultLocale, pathname: "/login", prefixed: false }
 * "/it" -> { locale: "it", pathname: "/", prefixed: true }
 * "/itx/login" -> default locale, pathname unchanged (strict segment match)
 */
export function stripLocale(
  routing: LocaleRouting,
  pathname: string,
): { locale: Locale; pathname: string; prefixed: boolean } {
  const match = FIRST_SEGMENT.exec(pathname);
  if (match) {
    const [, first, rest] = match;
    if (isLocale(routing, first)) {
      return { locale: first, pathname: rest && rest.length > 0 ? rest : "/", prefixed: true };
    }
  }
  return { locale: routing.defaultLocale, pathname, prefixed: false };
}

/**
 * localizeHref(r, "it", "/login") -> "/it/login"; default locale -> "/login";
 * external/hash-only/query-only hrefs untouched; already-prefixed hrefs are re-prefixed
 * (stripped first). localizeHref(r, "it", "/") === "/it" and
 * localizeHref(r, "en", "/") === "/" (root path, both directions).
 *
 * MUST NOT be handed a raw, unvalidated request pathname — the "external -> untouched"
 * branch (anything not starting with a single "/") is an open-redirect gadget for inputs
 * like "//evil.com/x" or "/\evil.com". The caller (the proxy) validates the path shape
 * BEFORE calling this function; this function itself performs no such validation.
 */
export function localizeHref(routing: LocaleRouting, locale: Locale, href: string): string {
  // Not a same-origin absolute path (external URL, protocol-relative "//host/...",
  // "mailto:", "tel:", relative path without a leading slash, or empty string) -> untouched.
  if (!href.startsWith("/") || href.startsWith("//")) {
    return href;
  }
  // Hash-only ("#section") and query-only ("?q=1") hrefs never start with "/" and are
  // already caught by the check above.

  const hashIndex = href.indexOf("#");
  const withoutHash = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : href.slice(hashIndex);

  const queryIndex = withoutHash.indexOf("?");
  const path = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : withoutHash.slice(queryIndex);

  const { pathname: bare } = stripLocale(routing, path);
  const targetLocale = isLocale(routing, locale) ? locale : routing.defaultLocale;

  if (targetLocale === routing.defaultLocale) {
    return `${bare}${query}${hash}`;
  }
  const prefixed = bare === "/" ? `/${targetLocale}` : `/${targetLocale}${bare}`;
  return `${prefixed}${query}${hash}`;
}
