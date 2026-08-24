import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic allowlist proxy (design spec §8.5, plan D.6 + D.9.14). Shared by every
 * preset app — each app's `proxy.ts` calls `createAuthProxy()` with only its own extra
 * exact-allowlist entries; this file owns the logic that used to be duplicated
 * byte-for-byte across every app's own `middleware.ts`.
 *
 * THIS IS NOT THE SECURITY BOUNDARY. cf. CVE-2025-29927 (the Next.js middleware-bypass
 * class): a crafted `x-middleware-subrequest` header could skip middleware entirely on
 * vulnerable Next versions, and middleware can be misconfigured, mismatched against a
 * route, or simply skipped by a proxy in front of the app. The REAL boundary is
 * `defineHandler`/`defineAction` (`packages/core`), whose mandatory `auth` mode runs
 * inside the route handler itself, on every request, regardless of what happened (or
 * didn't) upstream. This proxy exists only as a first, cheap layer: it redirects
 * obviously-unauthenticated page loads to `/login` before they render, so a signed-out
 * visitor doesn't see a flash of protected UI. It performs NO database lookup — see below.
 *
 * Cookie-presence-only check, no DB call: `getSessionCookie` only checks whether a
 * plausibly-valid session cookie is present, it does not validate the session against the
 * database. A forged or expired cookie value passes this check and is still rejected later
 * by `getSession()` inside `defineHandler`/`requireSession()`, which do hit the DB. This
 * stays true even though the proxy now runs in the `nodejs` runtime (Next 16) rather than
 * `edge` — a DB round trip here is avoidable latency on every request, not merely
 * something the runtime used to be unable to do; the rule is a design choice, not a
 * runtime limitation.
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
 */
export function isPublicPath(pathname: string, extraExact?: readonly string[]): boolean {
  if (EXACT_ALLOWLIST.has(pathname)) return true;
  if (extraExact?.includes(pathname)) return true;
  return PREFIX_ALLOWLIST.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Builds an app's `proxy` export. `extraExactAllowlist` entries are appended to the
 * shared exact allowlist, unioned with the shared prefix allowlist — same semantics as
 * `isPublicPath`'s `extraExact` parameter, above.
 */
export function createAuthProxy(opts?: {
  extraExactAllowlist?: readonly string[];
}): (req: NextRequest) => Response | undefined {
  const extraExact = opts?.extraExactAllowlist;

  return function proxy(request: NextRequest): Response | undefined {
    const { pathname } = request.nextUrl;

    if (isPublicPath(pathname, extraExact)) {
      return undefined;
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
      return undefined;
    }

    // Deliberately no `?next=` param (YAGNI): login/signup both hard-code the
    // post-auth redirect to /dashboard, so nothing reads it — reintroduce the param
    // together with a guarded consumer, not before.
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  };
}
