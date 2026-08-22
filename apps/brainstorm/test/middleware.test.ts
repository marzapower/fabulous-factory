import { describe, expect, it } from "vitest";

import { isPublicPath } from "../middleware";

describe("isPublicPath", () => {
  it.each(["/", "/features", "/features/auth", "/api/auth/callback/google", "/login", "/terms"])(
    "treats %s as public",
    (pathname) => {
      expect(isPublicPath(pathname)).toBe(true);
    },
  );

  it.each(["/features-secret", "/featuresx", "/dashboard", "/projects/123", "/api/chat"])(
    "treats %s as NOT public",
    (pathname) => {
      expect(isPublicPath(pathname)).toBe(false);
    },
  );
});
