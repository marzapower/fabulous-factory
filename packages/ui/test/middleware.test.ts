import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { createAuthProxy, isPublicPath } from "../src/middleware";

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
  function request(pathname: string): NextRequest {
    return new NextRequest(`https://example.com${pathname}`);
  }

  it("returns undefined (pass-through) for a public path with no cookie", () => {
    const proxy = createAuthProxy();
    const result = proxy(request("/login"));
    expect(result).toBeUndefined();
  });

  it.each(["/forgot-password", "/reset-password"])(
    "returns undefined (pass-through) for %s with no session cookie",
    (pathname) => {
      const proxy = createAuthProxy();
      const result = proxy(request(pathname));
      expect(result).toBeUndefined();
    },
  );

  it("returns undefined (pass-through) for an app's extraExactAllowlist entry", () => {
    const proxy = createAuthProxy({ extraExactAllowlist: ["/api/billing/webhook"] });
    const result = proxy(request("/api/billing/webhook"));
    expect(result).toBeUndefined();
  });

  it("redirects a guarded path with no session cookie to /login", () => {
    const proxy = createAuthProxy();
    const result = proxy(request("/dashboard"));
    expect(result).toBeInstanceOf(Response);
    const location = (result as Response).headers.get("location");
    expect(location).not.toBeNull();
    const redirectUrl = new URL(location as string);
    expect(redirectUrl.pathname).toBe("/login");
    // No `?next=` param (YAGNI): nothing reads it — see middleware.ts's comment.
    expect(redirectUrl.searchParams.has("next")).toBe(false);
  });
});
