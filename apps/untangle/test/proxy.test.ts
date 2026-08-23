import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "../proxy";

// The shared allowlist logic (isPublicPath/createAuthProxy) is covered exhaustively in
// @factory/ui's own test suite (packages/ui/test/middleware.test.ts). This file covers
// ONLY what's specific to this app: its two `extraExactAllowlist` entries.
describe("untangle proxy — extraExactAllowlist", () => {
  it.each(["/api/billing/webhook", "/api/inngest"])(
    "treats %s as public (server-to-server route)",
    (pathname) => {
      const request = new NextRequest(`https://example.com${pathname}`);
      expect(proxy(request)).toBeUndefined();
    },
  );

  it("does NOT treat a same-prefix sibling of an extra entry as public", () => {
    const request = new NextRequest("https://example.com/api/billing/webhook-evil");
    const result = proxy(request);
    expect(result).toBeInstanceOf(Response);
  });
});
