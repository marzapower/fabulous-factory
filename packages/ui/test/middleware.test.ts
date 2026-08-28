import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { createLocaleRouting } from "@factory/i18n/middleware";

import { createAuthProxy, isPublicPath } from "../src/middleware";
import { expectPassThrough, expectRedirectToLogin } from "./proxy-assertions";

describe("isPublicPath", () => {
  it.each([
    "/",
    "/features",
    "/features/auth",
    "/features/kernel",
    "/api/auth/callback/google",
    "/login",
    "/signup",
    "/terms",
    "/privacy",
    "/api/health",
    "/api/demo/kernel-echo",
    "/api/demo/security-check",
    "/forgot-password",
    "/reset-password",
  ])("treats %s as public", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each([
    "/features-secret",
    "/featuresx",
    "/dashboard",
    "/api/billing/webhook-evil",
    "/api/demo/kernel-echo-evil",
    "/api/demo/security-check-evil",
    "/api/health-check",
    "/projects/123",
    "/api/chat",
  ])("treats %s as NOT public", (pathname) => {
    expect(isPublicPath(pathname)).toBe(false);
  });

  it("treats an extraExact entry as public", () => {
    expect(isPublicPath("/api/billing/webhook", ["/api/billing/webhook", "/api/inngest"])).toBe(
      true,
    );
    expect(isPublicPath("/api/inngest", ["/api/billing/webhook", "/api/inngest"])).toBe(true);
  });

  it("does NOT treat a same-prefix sibling of an extraExact entry as public", () => {
    expect(isPublicPath("/api/billing/webhook-evil", ["/api/billing/webhook"])).toBe(false);
  });

  it("does not leak extraExact entries when no extraExact is passed", () => {
    expect(isPublicPath("/api/billing/webhook")).toBe(false);
  });
});

describe("createAuthProxy", () => {
  // Two declared locales, "en" default — matches the shape every preset app's
  // `i18n/config.ts` declares (D6: apps that stay English-only pass a single-locale
  // array instead, exercised separately at the app level, not here).
  const i18n = createLocaleRouting({
    locales: ["en", "it"],
    defaultLocale: "en",
    cookieName: "NEXT_LOCALE",
  });

  // better-auth's own cookie-presence check (`getSessionCookie`, verified in the
  // installed 1.7.1 dist — see middleware.ts's doc comment) looks for
  // `better-auth.session_token`; a plausibly-valid-looking value is enough, since this
  // layer performs no DB lookup.
  const SESSION_COOKIE = "better-auth.session_token=test-session-token";

  function request(pathname: string, opts?: { cookie?: string }): NextRequest {
    return new NextRequest(
      `https://example.com${pathname}`,
      opts?.cookie ? { headers: { cookie: opts.cookie } } : undefined,
    );
  }

  describe("public pages (default locale)", () => {
    it("passes through a public path with no cookie", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/login"));
      expectPassThrough(result, { bare: "/login" });
    });

    it.each(["/forgot-password", "/reset-password"])(
      "passes through %s with no session cookie",
      (pathname) => {
        const proxy = createAuthProxy({ i18n });
        const result = proxy(request(pathname));
        expectPassThrough(result, { bare: pathname });
      },
    );

    it("passes through an app's extraExactAllowlist entry (API route)", () => {
      const proxy = createAuthProxy({ i18n, extraExactAllowlist: ["/api/billing/webhook"] });
      const result = proxy(request("/api/billing/webhook"));
      expect(result.status).toBe(200);
    });
  });

  describe("protected pages", () => {
    it("redirects a guarded path with no session cookie to /login", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/dashboard"));
      expectRedirectToLogin(result);
      const redirectUrl = new URL(result.headers.get("location") as string);
      // No `?next=` param (YAGNI): nothing reads it — see middleware.ts's comment.
      expect(redirectUrl.searchParams.has("next")).toBe(false);
    });
  });

  describe("locale-prefixed pages", () => {
    it("treats /it/login as public", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/it/login"));
      expectPassThrough(result, { bare: "/login", locale: "it" });
    });

    it("redirects /it/dashboard (no session) to /it/login", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/it/dashboard"));
      expectRedirectToLogin(result, { locale: "it" });
    });

    it("treats /itx/login as NOT public — an unrecognised first segment is not a locale, so it's an ordinary (default-locale) guarded path", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/itx/login"));
      expectRedirectToLogin(result);
    });

    it("treats /it (root) as public", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/it"));
      expectPassThrough(result, { bare: "/", locale: "it" });
    });

    it("redirects the explicitly-prefixed default locale /en/login to /login (next-intl's own step-2 redirect)", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/en/login"));
      expect([307, 308]).toContain(result.status);
      const location = result.headers.get("location");
      expect(location).not.toBeNull();
      expect(new URL(location as string).pathname).toBe("/login");
    });
  });

  describe("NEXT_LOCALE cookie redirect (D3)", () => {
    it("redirects an unprefixed page to its prefixed form, preserving the query string", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/pricing?ref=1", { cookie: "NEXT_LOCALE=it" }));
      expect(result.status).toBe(307);
      const location = result.headers.get("location");
      expect(location).not.toBeNull();
      const url = new URL(location as string);
      expect(url.pathname).toBe("/it/pricing");
      expect(url.search).toBe("?ref=1");
    });

    it("redirects the root path to exactly one 307 to /it (loop guard, M5)", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/", { cookie: "NEXT_LOCALE=it" }));
      expect(result.status).toBe(307);
      expect(result.headers.get("location")).toBe("https://example.com/it");
    });

    it("does not redirect an already-prefixed root (/it) — no double-prefixing", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/it", { cookie: "NEXT_LOCALE=it" }));
      expectPassThrough(result, { bare: "/", locale: "it" });
    });

    it("does not redirect an already-prefixed page (/it/x) with a valid session — no double-prefixing", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(
        request("/it/dashboard", { cookie: `NEXT_LOCALE=it; ${SESSION_COOKIE}` }),
      );
      expectPassThrough(result, { bare: "/dashboard", locale: "it" });
    });

    it("ignores an undeclared cookie locale (fr)", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/dashboard", { cookie: `NEXT_LOCALE=fr; ${SESSION_COOKIE}` }));
      expectPassThrough(result, { bare: "/dashboard" });
    });

    describe("open-redirect vectors (M4)", () => {
      it.each(["//evil.com/x", "/\\evil.com", "//\\evil.com", "/it//evil.com/x"])(
        "never produces a location redirecting off-origin for %s",
        (pathname) => {
          const proxy = createAuthProxy({ i18n });
          const result = proxy(request(pathname, { cookie: "NEXT_LOCALE=it" }));
          const location = result.headers.get("location");
          if (location !== null) {
            expect(new URL(location).host).toBe("example.com");
          }
        },
      );
    });
  });

  describe("step 2 same-origin assertion on next-intl's own redirect (security review fix)", () => {
    // Belt-and-braces coverage for middleware.ts's step 2 guard: even a redirect entirely
    // borrowed from `i18n.handle()` (not something this proxy builds itself) must never
    // reach the caller off-origin. These paths are today handled harmlessly by next-intl
    // one way or another; the assertion only pins the property that must hold regardless
    // of what next-intl itself decides to do with a shape like this.
    it.each(["/en//evil.com/x", "/en/\\evil.com"])(
      "never produces an off-origin location for %s",
      (pathname) => {
        const proxy = createAuthProxy({ i18n });
        const result = proxy(request(pathname));
        const location = result.headers.get("location");
        if (location !== null) {
          expect(new URL(location).host).toBe("example.com");
        }
      },
    );
  });

  describe("additional fail-closed cases (security review)", () => {
    it("redirects /it/features-secret (same-prefix sibling of /features) to /it/login", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/it/features-secret"));
      expectRedirectToLogin(result, { locale: "it" });
    });

    it("redirects /it//dashboard (double slash) to /it/login", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/it//dashboard"));
      expectRedirectToLogin(result, { locale: "it" });
    });

    it("redirects /IT/login to a same-origin location (next-intl case-normalises the locale segment)", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/IT/login"));
      expect(result.status).toBeGreaterThanOrEqual(300);
      expect(result.status).toBeLessThan(400);
      const location = result.headers.get("location");
      expect(location).not.toBeNull();
      expect(new URL(location as string).host).toBe("example.com");
    });

    it("redirects /login/ (trailing slash) to /login with 307 — documents the trailing-slash round trip as intended fail-closed behaviour", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/login/"));
      expect(result.status).toBe(307);
      const location = result.headers.get("location");
      expect(location).not.toBeNull();
      expect(new URL(location as string).pathname).toBe("/login");
    });
  });

  describe("API branch", () => {
    it("passes through /api/health unchanged (byte-identical to pre-i18n behaviour)", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/api/health"));
      expect(result.status).toBe(200);
      expect(result.headers.get("x-middleware-rewrite")).toBeNull();
    });

    it("redirects /api/billing/webhook-evil (not an exact allowlist entry) to the plain, unlocalized /login", () => {
      const proxy = createAuthProxy({ i18n, extraExactAllowlist: ["/api/billing/webhook"] });
      const result = proxy(request("/api/billing/webhook-evil"));
      expect(result.status).toBe(307);
      expect(result.headers.get("location")).toBe("https://example.com/login");
    });

    it("redirects /it/api/health to /it/login — API allowlist entries are unreachable through a locale prefix (M14)", () => {
      const proxy = createAuthProxy({ i18n });
      const result = proxy(request("/it/api/health"));
      expectRedirectToLogin(result, { locale: "it" });
    });
  });
});
