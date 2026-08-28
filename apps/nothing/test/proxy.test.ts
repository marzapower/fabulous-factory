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

// The shared allowlist logic (isPublicPath/createAuthProxy) is covered exhaustively in
// @factory/ui's own test suite (packages/ui/test/middleware.test.ts). This file covers
// ONLY what's specific to this app: `apps/nothing/proxy.ts` calls `createAuthProxy()`
// with NO `extraExactAllowlist` at all (unlike untangle, which adds its own
// server-to-server webhook routes), composed with this app's own two-locale
// `i18n/config.ts` (en default, it) — see the doc comment on `../proxy`.
describe("nothing proxy — default shape, no extra allowlist entries", () => {
  it("uses the standard matcher excluding _next/static, _next/image, and favicon.ico", () => {
    expect(config.matcher).toBe("/((?!_next/static|_next/image|favicon.ico).*)");
  });

  it("a protected, non-allowlisted path with no session cookie redirects to /login", () => {
    const request = new NextRequest("https://example.com/dashboard");
    const result = proxy(request);
    expectRedirectToLogin(result);
  });

  it("a protected, non-allowlisted /it path with no session cookie redirects to /it/login", () => {
    const request = new NextRequest("https://example.com/it/dashboard");
    const result = proxy(request);
    expectRedirectToLogin(result, { locale: "it" });
  });

  // untangle's proxy adds these two paths via `extraExactAllowlist` — nothing's proxy
  // must NOT treat them as public, since it never passes that option at all.
  it.each(["/api/billing/webhook", "/api/inngest"])(
    "does NOT treat %s (another app's extra-allowlist entry) as public here",
    (pathname) => {
      const request = new NextRequest(`https://example.com${pathname}`);
      const result = proxy(request);
      expectRedirectToLogin(result);
    },
  );

  // Sanity: the shared allowlist itself still applies (proves the proxy is wired to the
  // real `createAuthProxy()`, not a stub) — full coverage of this logic lives in
  // packages/ui/test/middleware.test.ts.
  it("still treats a shared-allowlist path (e.g. /login) as public", () => {
    const request = new NextRequest("https://example.com/login");
    expectPassThrough(proxy(request), { bare: "/login" });
  });

  it("treats the localized shared-allowlist path (/it/login) as public too", () => {
    const request = new NextRequest("https://example.com/it/login");
    expectPassThrough(proxy(request), { bare: "/login", locale: "it" });
  });
});
