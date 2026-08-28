import { describe, expect, it } from "vitest";

import { isLocale, localizeHref, stripLocale, type LocaleRouting } from "../src/routing";

const routing: LocaleRouting = {
  locales: ["en", "it"],
  defaultLocale: "en",
  cookieName: "NEXT_LOCALE",
};

describe("stripLocale", () => {
  it("strips a valid locale prefix", () => {
    expect(stripLocale(routing, "/it/login")).toEqual({
      locale: "it",
      pathname: "/login",
      prefixed: true,
    });
  });

  it("leaves an unprefixed path at the default locale", () => {
    expect(stripLocale(routing, "/login")).toEqual({
      locale: "en",
      pathname: "/login",
      prefixed: false,
    });
  });

  it("strips a bare locale root", () => {
    expect(stripLocale(routing, "/it")).toEqual({ locale: "it", pathname: "/", prefixed: true });
  });

  it("strips a locale root with a trailing slash", () => {
    expect(stripLocale(routing, "/it/")).toEqual({ locale: "it", pathname: "/", prefixed: true });
  });

  it("treats the site root as unprefixed default-locale", () => {
    expect(stripLocale(routing, "/")).toEqual({ locale: "en", pathname: "/", prefixed: false });
  });

  it("does not strip a segment that only looks like a locale (strict match)", () => {
    expect(stripLocale(routing, "/itx/login")).toEqual({
      locale: "en",
      pathname: "/itx/login",
      prefixed: false,
    });
  });
});

describe("isLocale", () => {
  it("accepts a declared locale", () => {
    expect(isLocale(routing, "it")).toBe(true);
  });

  it("rejects an undeclared locale", () => {
    expect(isLocale(routing, "fr")).toBe(false);
  });

  it("rejects non-string candidates", () => {
    expect(isLocale(routing, undefined)).toBe(false);
    expect(isLocale(routing, 42)).toBe(false);
  });
});

describe("localizeHref", () => {
  it("prefixes a non-default locale", () => {
    expect(localizeHref(routing, "it", "/login")).toBe("/it/login");
  });

  it("leaves the default locale unprefixed", () => {
    expect(localizeHref(routing, "en", "/login")).toBe("/login");
  });

  it("re-prefixes an already-prefixed href (strips first)", () => {
    expect(localizeHref(routing, "it", "/it/login")).toBe("/it/login");
    expect(localizeHref(routing, "en", "/it/login")).toBe("/login");
  });

  it("localizes the root path both directions (M5)", () => {
    expect(localizeHref(routing, "it", "/")).toBe("/it");
    expect(localizeHref(routing, "en", "/")).toBe("/");
  });

  it("preserves query and hash", () => {
    expect(localizeHref(routing, "it", "/login?next=/dashboard")).toBe("/it/login?next=/dashboard");
    expect(localizeHref(routing, "it", "/login#section")).toBe("/it/login#section");
  });

  it("leaves external and protocol-relative hrefs untouched", () => {
    expect(localizeHref(routing, "it", "https://example.com/x")).toBe("https://example.com/x");
    expect(localizeHref(routing, "it", "//evil.com/x")).toBe("//evil.com/x");
    expect(localizeHref(routing, "it", "mailto:a@b.com")).toBe("mailto:a@b.com");
  });

  it("leaves hash-only and query-only hrefs untouched", () => {
    expect(localizeHref(routing, "it", "#section")).toBe("#section");
    expect(localizeHref(routing, "it", "?q=1")).toBe("?q=1");
  });

  it("falls back to the default locale for an undeclared locale", () => {
    expect(localizeHref(routing, "fr", "/login")).toBe("/login");
  });
});
