import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic allowlist middleware (design spec §8.5, plan D.6 + D.9.14).
 *
 * THIS IS NOT THE SECURITY BOUNDARY. cf. CVE-2025-29927 (the Next.js middleware-bypass
 * class): a crafted `x-middleware-subrequest` header could skip middleware entirely on
 * vulnerable Next versions, and middleware can be misconfigured, mismatched against a
 * route, or simply skipped by a proxy in front of the app. The REAL boundary is
 * `defineHandler`/`defineAction` (`packages/core`), whose mandatory `auth` mode runs
 * inside the route handler itself, on every request, regardless of what happened (or
 * didn't) upstream. This middleware exists only as a first, cheap layer: it redirects
 * obviously-unauthenticated page loads to `/login` before they render, so a signed-out
 * visitor doesn't see a flash of protected UI. It performs NO database lookup — see below.
 *
 * Cookie-presence-only check, no DB call (edge middleware cannot open a TCP connection to
 * Postgres — spec §8.5): `getSessionCookie` only checks whether a plausibly-valid session
 * cookie is present, it does not validate the session against the database. A forged or
 * expired cookie value passes this check and is still rejected later by `getSession()`
 * inside `defineHandler`/`requireSession()`, which do hit the DB.
 */

// EXACT entries, not prefixes (H.10 review fix): every entry below is a single flat
// route with no sub-paths of its own — unlike `/api/auth/`, which fans out to many
// sub-paths under Better Auth's `[...all]` catch-all and genuinely needs a prefix — so a
// prefix match here would be looser than its own justification, silently also
// allowlisting anything an attacker appended after one of these paths.
const EXACT_ALLOWLIST = new Set([
  "/",
  "/login",
  "/signup",
  "/terms",
  "/privacy",
  "/api/health",
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

export function isPublicPath(pathname: string): boolean {
  if (EXACT_ALLOWLIST.has(pathname)) return true;
  return PREFIX_ALLOWLIST.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Cookie-name finding (verified in the installed better-auth 1.7.1 dist, plan D.9.14):
  // `getSessionCookie`'s internal cookie lookup
  // (node_modules/better-auth/dist/cookies/index.mjs, `getSessionCookie`) already checks
  // BOTH the plain name and the `__Secure-`-prefixed name for every candidate —
  // `parsedCookie.get(`__Secure-${name}`) ?? parsedCookie.get(name)` — before falling
  // back to the legacy `-` separator form. There is nothing environment-specific for us
  // to configure here: the same `getSessionCookie(request)` call transparently covers the
  // dev cookie (`better-auth.session_token`) and the prod-https cookie
  // (`__Secure-better-auth.session_token`, set when `useSecureCookies`/an `https://`
  // baseURL apply) without a protocol check on our side.
  const sessionCookie = getSessionCookie(request);

  if (sessionCookie) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  // Guard at mint time (M7): `pathname` is attacker-influenceable in shape (though not in
  // an open way here — Next always hands middleware a same-origin pathname), but a
  // protocol-relative value like `//evil.com/x` would still parse as `next`'s literal
  // string and — if a future consumer ever does `redirect(next)` instead of treating it as
  // an opaque same-origin path — becomes an open redirect. Only accept a single-leading-
  // slash internal path; anything else (including `//...`) falls back to `/`.
  const safeNext = pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
  loginUrl.searchParams.set("next", safeNext);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
