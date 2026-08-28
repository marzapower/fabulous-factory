import { describe, expect, it } from "vitest";

import { defineI18n, getI18nConfig, type Catalog } from "../src/index";

const uiCatalog: Catalog<"ui"> = {
  namespace: "ui",
  messages: {
    en: { auth: { login: { title: "Log in", cta: "Sign in" } } },
    it: { auth: { login: { title: "Accedi" } } },
  },
};

describe("defineI18n / getI18nConfig", () => {
  // Must run before any other test in this file calls defineI18n() — the singleton slot
  // is module-level and shared for the whole test file.
  it("getI18nConfig throws before defineI18n has run", () => {
    expect(() => getI18nConfig()).toThrow(/defineI18n/);
  });

  it("throws when defaultLocale is not in locales", () => {
    expect(() =>
      defineI18n({ locales: ["en", "it"], defaultLocale: "fr" as never, catalogs: [uiCatalog] }),
    ).toThrow(RangeError);
  });

  it("throws on duplicate locales", () => {
    expect(() =>
      defineI18n({ locales: ["en", "en"], defaultLocale: "en", catalogs: [uiCatalog] }),
    ).toThrow(RangeError);
  });

  it("throws when a catalog lacks the default locale's messages", () => {
    const badCatalog: Catalog<"bad"> = { namespace: "bad", messages: { it: {} } };
    expect(() =>
      defineI18n({ locales: ["en", "it"], defaultLocale: "en", catalogs: [badCatalog] }),
    ).toThrow(RangeError);
  });

  it("messagesFor merges default-locale messages under the locale's (per-key fallback)", () => {
    const i18n = defineI18n({ locales: ["en", "it"], defaultLocale: "en", catalogs: [uiCatalog] });
    expect(i18n.messagesFor("it")).toEqual({
      ui: { auth: { login: { title: "Accedi", cta: "Sign in" } } },
    });
  });

  it("messagesFor(defaultLocale) returns the default catalog verbatim", () => {
    const i18n = defineI18n({ locales: ["en", "it"], defaultLocale: "en", catalogs: [uiCatalog] });
    expect(i18n.messagesFor("en")).toEqual({
      ui: { auth: { login: { title: "Log in", cta: "Sign in" } } },
    });
  });

  it("messagesFor throws RangeError for an unknown locale", () => {
    const i18n = defineI18n({ locales: ["en", "it"], defaultLocale: "en", catalogs: [uiCatalog] });
    expect(() => i18n.messagesFor("fr")).toThrow(RangeError);
  });

  it("missingKeys reports keys present in defaultLocale but absent in locale", () => {
    const i18n = defineI18n({ locales: ["en", "it"], defaultLocale: "en", catalogs: [uiCatalog] });
    expect(i18n.missingKeys("it")).toEqual(["ui.auth.login.cta"]);
  });

  it("missingKeys is empty for the default locale", () => {
    const i18n = defineI18n({ locales: ["en", "it"], defaultLocale: "en", catalogs: [uiCatalog] });
    expect(i18n.missingKeys("en")).toEqual([]);
  });

  it("defaults cookieName to NEXT_LOCALE", () => {
    const i18n = defineI18n({ locales: ["en"], defaultLocale: "en", catalogs: [uiCatalog] });
    expect(i18n.cookieName).toBe("NEXT_LOCALE");
    expect(i18n.routing.cookieName).toBe("NEXT_LOCALE");
  });

  it("honours a custom cookieName", () => {
    const i18n = defineI18n({
      locales: ["en"],
      defaultLocale: "en",
      catalogs: [uiCatalog],
      cookieName: "locale",
    });
    expect(i18n.cookieName).toBe("locale");
    expect(i18n.routing.cookieName).toBe("locale");
  });

  it("getI18nConfig returns the most recently defined config", () => {
    const i18n = defineI18n({ locales: ["en"], defaultLocale: "en", catalogs: [uiCatalog] });
    expect(getI18nConfig()).toBe(i18n);
  });
});
