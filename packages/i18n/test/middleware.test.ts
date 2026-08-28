import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { createLocaleRouting } from "../src/middleware";
import type { LocaleRouting } from "../src/routing";

const routing: LocaleRouting = {
  locales: ["en", "it"],
  defaultLocale: "en",
  cookieName: "NEXT_LOCALE",
};

function request(pathname: string): NextRequest {
  return new NextRequest(`https://example.com${pathname}`);
}

describe("createLocaleRouting", () => {
  it("exposes the routing fields it was built from", () => {
    const handler = createLocaleRouting(routing);
    expect(handler.locales).toEqual(["en", "it"]);
    expect(handler.defaultLocale).toBe("en");
    expect(handler.cookieName).toBe("NEXT_LOCALE");
  });

  it("rewrites a default-locale path to the internal /en/... path", () => {
    const handler = createLocaleRouting(routing);
    const result = handler.handle(request("/x"));
    expect(result.status).toBe(200);
    const rewrite = result.headers.get("x-middleware-rewrite");
    expect(rewrite).not.toBeNull();
    expect(new URL(rewrite as string).pathname).toBe("/en/x");
  });

  it("passes an already-prefixed non-default-locale path straight through", () => {
    // Unlike "/x" (which must be internally rewritten to "/en/x" so the [locale]
    // dynamic segment resolves), "/it/x" already contains its own locale segment — Next's
    // file-system router matches app/[locale]/x directly from the URL as-is, so there is
    // no rewrite header at all here, just a plain 200 pass-through.
    const handler = createLocaleRouting(routing);
    const result = handler.handle(request("/it/x"));
    expect(result.status).toBe(200);
    expect(result.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("redirects an explicit default-locale prefix to the bare path (M16)", () => {
    const handler = createLocaleRouting(routing);
    const result = handler.handle(request("/en/x"));
    expect([307, 308]).toContain(result.status);
    const location = result.headers.get("location");
    expect(location).not.toBeNull();
    expect(new URL(location as string).pathname).toBe("/x");
  });

  it("never writes a Set-Cookie header (localeCookie: false, localeDetection: false)", () => {
    const handler = createLocaleRouting(routing);
    for (const pathname of ["/x", "/it/x", "/en/x"]) {
      const result = handler.handle(request(pathname));
      expect(result.headers.get("set-cookie")).toBeNull();
    }
  });

  it("accepts an I18nConfig-shaped object (reading its .routing field), not just a bare LocaleRouting", () => {
    const handler = createLocaleRouting({
      locales: routing.locales as [string, ...string[]],
      defaultLocale: routing.defaultLocale,
      cookieName: routing.cookieName,
      routing,
      messagesFor: () => ({}),
    });
    expect(handler.defaultLocale).toBe("en");
    const result = handler.handle(request("/it/x"));
    expect(result.status).toBe(200);
  });
});
