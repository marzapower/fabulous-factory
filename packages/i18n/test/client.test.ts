// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { setLocaleCookie } from "../src/client";
import type { LocaleRouting } from "../src/routing";

/**
 * `setLocaleCookie` is the write side of the same invariant `isLocale` enforces on the
 * read side (the proxy, `packages/ui/src/middleware.ts` step 3): the cookie only ever
 * holds a declared locale. These tests exercise that directly, independent of the
 * `LocaleSwitcher` component that's the only production caller today
 * (`packages/ui/test/locale-switcher.test.tsx` covers the same invariant end to end
 * through the component).
 */

const routing: LocaleRouting = {
  locales: ["en", "it"],
  defaultLocale: "en",
  cookieName: "NEXT_LOCALE",
};

beforeEach(() => {
  // Clear any cookie a previous test left behind.
  document.cookie = "NEXT_LOCALE=; Max-Age=0; Path=/";
});

describe("setLocaleCookie", () => {
  it("does not write the cookie for an undeclared locale", () => {
    setLocaleCookie(routing, "fr");
    expect(document.cookie).not.toContain("NEXT_LOCALE=");
  });

  it("writes the cookie for a declared locale", () => {
    setLocaleCookie(routing, "it");
    expect(document.cookie).toContain("NEXT_LOCALE=it");
  });
});
