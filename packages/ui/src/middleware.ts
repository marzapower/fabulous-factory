import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { isLocale, localizeHref, stripLocale } from "@factory/i18n/routing";
import type { LocaleRoutingHandler } from "@factory/i18n/middleware";

/**
 * Optimistic allowlist proxy (design spec §8.5, plan D.6 + D.9.14; locale composition per
 * i18n plan D7/§2.2). Shared by every preset app — each app's `proxy.ts` calls
 * `createAuthProxy({ i18n: createLocaleRouting(i18n), extraExactAllowlist? })` with its own
 * `i18n/config.ts` routing and only its own extra exact-allowlist entries; this file owns
 * the logic that used to be duplicated byte-for-byte across every app's own
 * `middleware.ts`, now composed with next-intl's own locale routing (D4: `i18n` is
 * required — there is no off switch, a single-locale app is the degraded state).
 *
 * THIS IS NOT THE SECURITY BOUNDARY. cf. CVE-2025-29927 (the Next.js middleware-bypass
 * class): a crafted `x-middleware-subrequest` header could skip middleware entirely on
 * vulnerable Next versions, and middleware can be misconfigured, mismatched against a
 * route, or simply skipped by a proxy in front of the app. The REAL boundary is
 * `defineHandler`/`defineAction` (`packages/core`), whose mandatory `auth` mode runs
 * inside the route handler itself, on every request, regardless of what happened (or
 * didn't) upstream. This proxy exists only as a first, cheap layer: it redirects
 * obviously-unauthenticated page loads to `/login` (or its localized `/<locale>/login`)
 * before they render, so a signed-out visitor doesn't see a flash of protected UI. It
 * performs NO database lookup — see below.
 *
 * Cookie-presence-only check, no DB call: `getSessionCookie` only checks whether a
 * plausibly-valid session cookie is present, it does not validate the session against the
 * database. A forged or expired cookie value passes this check and is still rejected later
 * by `getSession()` inside `defineHandler`/`requireSession()`, which do hit the DB. This
 * stays true even though the proxy now runs in the `nodejs` runtime (Next 16) rather than
 * `edge` — a DB round trip here is avoidable latency on every request, not merely
 * something the runtime used to be unable to do; the rule is a design choice, not a
 * runtime limitation.
 *
 * Locale composition (i18n plan §2.2): `app/api/**` stays at root, outside `[locale]`, and
 * is handled with today's byte-identical logic on the raw pathname — no locale handling
 * applies there, and `/it/api/...` can never reach an API allowlist entry through a locale
 * prefix (see the `isApiPath` guard below, M14). Every other path is first handed to
 * next-intl's own middleware (`i18n.handle`); a redirect it returns (`/en/x` -> `/x`,
 * trailing-slash normalisation, …) is passed through unchanged, since the redirected
 * request is proxied again on its next hop. The `NEXT_LOCALE` cookie written by the
 * locale switcher is untrusted input whose only sanctioned effect is selecting a member of
 * the declared `locales` array — never a source of any part of a URL path (M15); the
 * cookie-driven redirect below validates the resulting path's shape and asserts the
 * redirect target stays on this origin before ever constructing a `Response` from it (M4),
 * and only fires once per hop (M5).
 */

// Exact entries, not prefixes (H.10 review fix): every entry below is a single flat route
// with no sub-paths of its own — unlike `/api/auth/`, which fans out to many sub-paths
// under Better Auth's `[...all]` catch-all and genuinely needs a prefix — so a prefix
// match here would be looser than its own justification, silently also allowlisting
// anything an attacker appended after one of these paths (e.g. `/api/billing/webhook-evil`
// or any other same-prefix sibling route added later would slip through unauthenticated
// for free).
const EXACT_ALLOWLIST = new Set([
  "/",
  "/login",
  "/signup",
  "/terms",
  "/privacy",
  "/api/health",
  // Both only ever reach a signed-out visitor by definition — the login form's
  // "forgot password?" link, and better-auth's own `/api/auth/reset-password/:token`
  // callback redirect landing on `/reset-password?token=…` — so gating either behind the
  // session-cookie check below would bounce every legitimate visit straight back to
  // /login before the form ever renders.
  "/forgot-password",
  "/reset-password",
  // Public template feature-explainer pages index.
  "/features",
  // Live examples backing the /features docs pages (K.15.3/K.16 T12) — exact, not
  // prefix, for the same reason documented above: neither route has sub-paths of its
  // own, and a prefix entry would allowlist any same-prefix sibling added later for free.
  "/api/demo/kernel-echo",
  "/api/demo/security-check",
]);
// Trailing slash required (H.10-style review fix): a bare "/features" prefix would also
// match "/features-secret", the exact same-prefix-sibling failure mode this file's own
// comments condemn for the exact-match entries above.
const PREFIX_ALLOWLIST = ["/api/auth/", "/features/"];

/**
 * True iff `pathname` is public under the shared allowlist, or under `extraExact` — an
 * app's own additional exact-match entries (e.g. untangle's server-to-server webhook
 * routes). `extraExact` entries are exact-only, deliberately: an app that needs a public
 * prefix of its own belongs in a shared `PREFIX_ALLOWLIST` entry instead, not a
 * per-app escape hatch that could grow into a loosely-matched hole.
 *
 * Called on locale-less paths only: the raw pathname for `/api/**` (step 1, below), and
 * `bare` (the locale-stripped pathname) everywhere else (step 4) — never on a
 * still-prefixed pathname.
 */
export function isPublicPath(pathname: string, extraExact?: readonly string[]): boolean {
  if (EXACT_ALLOWLIST.has(pathname)) return true;
  if (extraExact?.includes(pathname)) return true;
  return PREFIX_ALLOWLIST.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Builds an app's `proxy` export. `i18n` (required, D4) is the app's own
 * `createLocaleRouting(i18n)` handler; `extraExactAllowlist` entries are appended to the
 * shared exact allowlist, unioned with the shared prefix allowlist — same semantics as
 * `isPublicPath`'s `extraExact` parameter, above.
 *
 * Always returns a `Response` (never `undefined`, unlike the pre-i18n signature): every
 * path is either the API branch's own pass-through/redirect, next-intl's rewrite/redirect
 * response (page branch), or this proxy's own locale/login redirect built on top of it.
 */
export function createAuthProxy(opts: {
  i18n: LocaleRoutingHandler;
  extraExactAllowlist?: readonly string[];
}): (req: NextRequest) => Response {
  const { i18n } = opts;
  const extraExact = opts.extraExactAllowlist;

  return function proxy(request: NextRequest): Response {
    const { pathname } = request.nextUrl;

    // Step 1 — API branch: exactly today's logic on the raw, unlocalized pathname.
    // `app/api/**` stays at root, outside `[locale]`, so no locale handling applies here.
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      if (isPublicPath(pathname, extraExact)) {
        return NextResponse.next();
      }
      if (getSessionCookie(request)) {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Step 2 — page branch: hand off to next-intl's own middleware first. `intl.ok` is
    // false only for a redirect (`/en/x` -> `/x`, trailing-slash normalisation, …) —
    // return it unchanged; the redirected request is proxied again on its next hop, so
    // nothing downstream needs to special-case it. A rewrite is a 200 carrying the
    // resolved locale in the `x-middleware-rewrite` header, and is safe to keep composing.
    const intl = i18n.handle(request);
    if (!intl.ok) {
      // Same-origin assertion on next-intl's OWN redirect, belt-and-braces: step 3 below
      // owns its own origin guards (M4) for the cookie-driven redirect this file builds
      // itself, but this one is entirely borrowed from `i18n.handle()`. Today it's always
      // same-origin (relative redirects built from `request.nextUrl`), so this can never
      // fire — it exists so a future next-intl change, or a `domains` config that honours
      // an attacker-controlled `x-forwarded-host`, can never turn that borrowed redirect
      // into an open redirect without this proxy silently forwarding it.
      const loc = intl.headers.get("location");
      if (loc && new URL(loc, request.url).origin !== request.nextUrl.origin) {
        return NextResponse.redirect(new URL("/", request.url));
      }
      return intl;
    }

    // Step 3 — cookie-driven locale redirect (D3): the switcher's `NEXT_LOCALE` cookie
    // bounces an unprefixed page URL to its prefixed equivalent.
    const { locale, pathname: bare, prefixed } = stripLocale(i18n, pathname);
    const cookieLocale = request.cookies.get(i18n.cookieName)?.value;
    if (isLocale(i18n, cookieLocale) && cookieLocale !== i18n.defaultLocale && !prefixed) {
      // Path-shape guard (M4): `bare` must be a single, absolute, backslash-free path —
      // "/x", never "//evil.com/x" or "/\evil.com" — before it is ever handed to
      // `localizeHref`, whose "external href -> untouched" branch is an open-redirect
      // gadget for exactly those shapes. Anything else falls through to step 3b.
      if (bare.startsWith("/") && bare[1] !== "/" && bare[1] !== "\\") {
        const target = localizeHref(i18n, cookieLocale, bare) + request.nextUrl.search;
        // Loop guard (M5): only redirect if the target actually differs from the
        // current request URL, so a no-op localization never causes an infinite bounce.
        if (target !== pathname + request.nextUrl.search) {
          const url = new URL(target, request.url);
          // Origin assertion (M4): belt-and-braces alongside the path-shape guard above
          // — the redirect target must resolve to this same origin.
          if (url.origin === request.nextUrl.origin) {
            return NextResponse.redirect(url);
          }
        }
      }
    }

    // Step 3b (M14): API entries are unreachable from the page branch — a locale prefix
    // can never smuggle a request into the API allowlist. `extraExactAllowlist` is
    // server-to-server only and was never meant to be reachable through `/it/api/...`.
    const isApiPath = bare === "/api" || bare.startsWith("/api/");

    // Step 4 — public page: pass next-intl's response through untouched.
    if (!isApiPath && isPublicPath(bare, extraExact)) {
      return intl;
    }

    // Step 5 — cookie-presence-only check (see file-level doc comment) -> pass through.
    if (getSessionCookie(request)) {
      return intl;
    }

    // Step 6 — redirect to the locale-appropriate /login (default locale -> "/login",
    // "it" -> "/it/login"; existing pass-through tests at the default locale stay valid).
    return NextResponse.redirect(new URL(localizeHref(i18n, locale, "/login"), request.url));
  };
}
