import { IntlError, IntlErrorCode } from "next-intl";
import { describe, expect, it, vi } from "vitest";

// next-intl's real `getRequestConfig` (server/react-server/getRequestConfig.js) is a
// literal identity function — `(createRequestConfig) => createRequestConfig` — that only
// exists so next-intl's own request-scoped machinery can register the callback found at
// an app's `i18n/request.ts`. Under plain Vitest, `next-intl/server` resolves through the
// package's `default` (client) export condition, whose stubs all throw "is not supported
// in Client Components" when called — there's no way to opt this one file into the
// `react-server` condition without breaking every jsdom-rendered test in this same run
// (navigation.test.tsx genuinely needs the client condition; next-intl's hooks and
// providers behave completely differently — and are jsdom-incompatible — under
// `react-server`). Mocking `getRequestConfig` back to its real identity behavior lets this
// test exercise `createRequestConfig`'s own callback logic faithfully, without depending
// on next-intl's AsyncLocalStorage-backed request scoping.
vi.mock("next-intl/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl/server")>();
  return {
    ...actual,
    getRequestConfig: (createRequestConfig: unknown) => createRequestConfig,
  };
});

const { defineI18n } = await import("../src/index");
const { createRequestConfig } = await import("../src/server");

const uiCatalog = {
  namespace: "ui" as const,
  messages: {
    en: { hello: "Hello" },
    it: { hello: "Ciao" },
  },
};

function buildI18n() {
  return defineI18n({ locales: ["en", "it"], defaultLocale: "en", catalogs: [uiCatalog] });
}

describe("createRequestConfig", () => {
  it("resolves a declared, non-default locale", async () => {
    const requestConfig = createRequestConfig(buildI18n());
    const result = await requestConfig({ requestLocale: Promise.resolve("it") });
    expect(result.locale).toBe("it");
    expect(result.messages).toEqual({ ui: { hello: "Ciao" } });
  });

  it("falls back to the default locale for an undeclared locale (fr)", async () => {
    const requestConfig = createRequestConfig(buildI18n());
    const result = await requestConfig({ requestLocale: Promise.resolve("fr") });
    expect(result.locale).toBe("en");
    expect(result.messages).toEqual({ ui: { hello: "Hello" } });
  });

  it("falls back to the default locale when requestLocale resolves to undefined", async () => {
    const requestConfig = createRequestConfig(buildI18n());
    const result = await requestConfig({ requestLocale: Promise.resolve(undefined) });
    expect(result.locale).toBe("en");
  });

  it("getMessageFallback joins namespace and key", async () => {
    const requestConfig = createRequestConfig(buildI18n());
    const result = await requestConfig({ requestLocale: Promise.resolve("en") });
    expect(
      result.getMessageFallback?.({ namespace: "ui", key: "missing", error: {} as never }),
    ).toBe("ui.missing");
  });

  it("onError swallows MISSING_MESSAGE silently but rethrows everything else", async () => {
    const requestConfig = createRequestConfig(buildI18n());
    const result = await requestConfig({ requestLocale: Promise.resolve("en") });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      result.onError?.(new IntlError(IntlErrorCode.MISSING_MESSAGE, "ui.missing is missing")),
    ).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();

    expect(() => result.onError?.(new IntlError(IntlErrorCode.INSUFFICIENT_PATH, "bad"))).toThrow();
  });
});
