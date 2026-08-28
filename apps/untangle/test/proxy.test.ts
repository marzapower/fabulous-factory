import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { createLocaleRouting } from "@factory/i18n/middleware";
import { createAuthProxy } from "@factory/ui/middleware";

// `@factory/ui/test/proxy-assertions` is not a public package export (it's a `test/`
// helper, not part of `packages/ui/package.json#exports`) — imported by relative
// filesystem path, same as the plan's own note that this is the fallback when the
// helper isn't exported. dependency-cruiser's DAG table allows a preset app to "import
// anything", so this crosses no boundary.
import {
  expectApiPassThrough,
  expectPassThrough,
  expectRedirectToLogin,
} from "../../../packages/ui/test/proxy-assertions";
import { config, proxy } from "../proxy";

function request(pathname: string): NextRequest {
  return new NextRequest(`https://example.com${pathname}`);
}

// The shared allowlist logic (isPublicPath/createAuthProxy) and the locale-routing
// composition itself are covered exhaustively in @factory/ui's and @factory/i18n's own
// test suites (packages/ui/test/middleware.test.ts, packages/i18n/test/middleware.test.ts).
// This file covers ONLY what's specific to this app: its two `extraExactAllowlist`
// entries, wired through the real `../proxy` module (a single-locale, "en"-only
// `i18n/config.ts`, per i18n plan D6), plus one locale-redirect case (M6) exercised
// against a synthetic two-locale fixture built the same way `packages/ui`'s own suite
// does — untangle ships one locale today, but the redirect behaviour this proxy composes
// on top of next-intl's own middleware doesn't depend on how many locales a given app
// happens to declare.
describe("untangle proxy — matcher", () => {
  it("uses the standard matcher excluding _next/static, _next/image, and favicon.ico", () => {
    expect(config.matcher).toBe("/((?!_next/static|_next/image|favicon.ico).*)");
  });
});

describe("untangle proxy — extraExactAllowlist (default locale)", () => {
  it.each(["/api/billing/webhook", "/api/inngest"])(
    "treats %s as public (server-to-server route)",
    (pathname) => {
      const result = proxy(request(pathname));
      expectApiPassThrough(result);
    },
  );

  it("does NOT treat a same-prefix sibling of an extra entry as public", () => {
    const result = proxy(request("/api/billing/webhook-evil"));
    expectRedirectToLogin(result);
  });

  it("still treats a shared-allowlist path (e.g. /login) as public", () => {
    const result = proxy(request("/login"));
    expectPassThrough(result, { bare: "/login" });
  });

  it("redirects a protected, non-allowlisted path with no session cookie to /login", () => {
    const result = proxy(request("/dashboard"));
    expectRedirectToLogin(result);
  });
});

describe("untangle proxy — locale redirect (M6, synthetic two-locale fixture)", () => {
  // Mirrors this app's own extraExactAllowlist against a two-locale routing config —
  // exercises the same composition `../proxy` builds, at a locale this app doesn't ship
  // today, without needing a second `i18n/config.ts` locale declaration just for a test.
  const i18n = createLocaleRouting({
    locales: ["en", "it"],
    defaultLocale: "en",
    cookieName: "NEXT_LOCALE",
  });
  const twoLocaleProxy = createAuthProxy({
    i18n,
    extraExactAllowlist: ["/api/billing/webhook", "/api/inngest"],
  });

  it("redirects /it/dashboard (no session) to /it/login", () => {
    const result = twoLocaleProxy(request("/it/dashboard"));
    expectRedirectToLogin(result, { locale: "it" });
  });
});
