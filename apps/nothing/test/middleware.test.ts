import { describe, expect, it } from "vitest";

import { isPublicPath } from "../middleware";

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
  ])("treats %s as public", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each([
    "/features-secret",
    "/featuresx",
    "/dashboard",
    "/api/demo/kernel-echo-evil",
    "/api/demo/security-check-evil",
    "/api/health-check",
  ])("treats %s as NOT public", (pathname) => {
    expect(isPublicPath(pathname)).toBe(false);
  });
});
