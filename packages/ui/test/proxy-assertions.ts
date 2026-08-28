import { expect } from "vitest";

/**
 * Shared assertions for the proxy test suite (i18n plan §2.5, M6): every pass-through
 * case must positively assert next-intl's rewrite target, and every redirect-to-login
 * case must assert the exact localized destination — a bare `toBeInstanceOf(Response)`
 * check can't tell a pass-through from a redirect, so it was hiding real bugs. Both
 * helpers assume `createAuthProxy`'s new contract: it always returns a `Response`, never
 * `undefined`.
 */

/**
 * Asserts `result` is a next-intl pass-through response: always HTTP 200.
 *
 * Under `localePrefix: "as-needed"`, next-intl's rewrite behaviour depends on whether
 * the *requested* URL was already locale-prefixed (verified empirically against the real
 * `next-intl@4.13.7` middleware, and pinned by `packages/i18n/test/middleware.test.ts`'s
 * own "rewrites a default-locale path" / "passes an already-prefixed non-default-locale
 * path straight through" pair):
 *  - an unprefixed default-locale request ("/login") is rewritten internally to the
 *    fully-prefixed path ("/en/login"), carried via the `x-middleware-rewrite` header —
 *    the visible URL stays unprefixed;
 *  - an already-prefixed non-default-locale request ("/it/login") already IS the internal
 *    path, so there is no rewrite header at all, just a plain 200.
 * `locale` defaults to "en" — the fixture default locale used throughout this test
 * suite — so `locale === "en"` doubles as "this was an unprefixed request" and
 * `locale !== "en"` as "this was an already-prefixed request"; every caller in this
 * suite's proxy composition only ever reaches a non-default-locale pass-through through
 * an already-prefixed URL (an unprefixed non-default-locale URL is redirected to its
 * prefixed form first, never passed through directly).
 */
export function expectPassThrough(
  result: Response,
  { bare, locale = "en" }: { bare: string; locale?: string },
): void {
  expect(result.status).toBe(200);
  const rewrite = result.headers.get("x-middleware-rewrite");
  if (locale === "en") {
    expect(rewrite).not.toBeNull();
    const rewrittenPathname = new URL(rewrite as string).pathname;
    const expectedPathname = bare === "/" ? "/en" : `/en${bare}`;
    expect(rewrittenPathname).toBe(expectedPathname);
  } else {
    expect(rewrite).toBeNull();
  }
}

/**
 * Asserts `result` is a redirect to the locale-appropriate `/login` — HTTP 307, with the
 * `Location` header's pathname exactly `/login` (default locale) or `/<locale>/login`.
 */
export function expectRedirectToLogin(
  result: Response,
  { locale = "en" }: { locale?: string } = {},
): void {
  expect(result.status).toBe(307);
  const location = result.headers.get("location");
  expect(location).not.toBeNull();
  const pathname = new URL(location as string).pathname;
  expect(pathname).toBe(locale === "en" ? "/login" : `/${locale}/login`);
}
