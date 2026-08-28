import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

// `@factory/ui/test/proxy-assertions` is not a public package export (it's a `test/`
// helper, not part of `packages/ui/package.json#exports`) — imported by relative
// filesystem path, same as the plan's own note that this is the fallback when the
// helper isn't exported. dependency-cruiser's DAG table allows a preset app to "import
// anything", so this crosses no boundary.
import {
  expectPassThrough,
  expectRedirectToLogin,
} from "../../../packages/ui/test/proxy-assertions";
import { config, proxy } from "../proxy";

// The shared allowlist logic (isPublicPath/createAuthProxy) and next-intl's own locale
// middleware are covered exhaustively in @factory/ui's and @factory/i18n's own test
// suites (packages/ui/test/middleware.test.ts, packages/i18n/test/middleware.test.ts).
// This file covers ONLY what's specific to this app: `apps/brainstorm/proxy.ts` calls
// `createAuthProxy({ i18n: createLocaleRouting(i18n) })` with NO `extraExactAllowlist`
// at all (unlike untangle, which adds its own server-to-server webhook routes) — see
// the doc comment on `../proxy`. This preset also declares a SINGLE locale ("en" only,
// plan D6): every case below stays at the default locale, and an unrecognised prefix
// segment like "it" is never stripped (no second locale is declared to strip it to).
describe("brainstorm proxy — default shape, single locale, no extra allowlist entries", () => {
  it("uses the standard matcher excluding _next/static, _next/image, and favicon.ico", () => {
    expect(config.matcher).toBe("/((?!_next/static|_next/image|favicon.ico).*)");
  });

  it("a protected, non-allowlisted path with no session cookie redirects to /login", () => {
    const request = new NextRequest("https://example.com/dashboard");
    const result = proxy(request);
    expectRedirectToLogin(result);
  });

  it("a protected project route with no session cookie redirects to /login", () => {
    const request = new NextRequest("https://example.com/projects/some-id");
    const result = proxy(request);
    expectRedirectToLogin(result);
  });

  // DEVIATION from the literal "/it/dashboard -> /it/login" instruction (which assumes
  // a second declared locale, as in apps/nothing): this preset declares only ["en"]
  // (plan D6), so "it" is not a member of `routing.locales` and is never stripped as a
  // locale segment — the request resolves at the default locale instead, and the
  // redirect lands on the UNPREFIXED /login, not /it/login.
  it("an unrecognised locale-looking prefix ('it', not a declared locale) is not stripped and still redirects to the unprefixed /login", () => {
    const request = new NextRequest("https://example.com/it/dashboard");
    const result = proxy(request);
    expectRedirectToLogin(result);
  });

  // untangle's proxy adds these two paths via `extraExactAllowlist` — brainstorm's
  // proxy must NOT treat them as public, since it never passes that option at all.
  it.each(["/api/billing/webhook", "/api/inngest"])(
    "does NOT treat %s (another app's extra-allowlist entry) as public here",
    (pathname) => {
      const request = new NextRequest(`https://example.com${pathname}`);
      const result = proxy(request);
      expect(result.status).toBe(307);
      expect(result.headers.get("location")).toBe("https://example.com/login");
    },
  );

  it("still treats a shared-allowlist page path (/login) as public", () => {
    const request = new NextRequest("https://example.com/login");
    const result = proxy(request);
    expectPassThrough(result, { bare: "/login" });
  });

  it("/api/health stays public — the API branch never runs locale handling at all", () => {
    const request = new NextRequest("https://example.com/api/health");
    const result = proxy(request);
    expect(result.status).toBe(200);
    // No next-intl rewrite header here — the API branch returns `NextResponse.next()`
    // directly on the raw pathname (i18n plan §2.2 step 1), never next-intl's response.
    expect(result.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
