import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_URL, getAppUrl, resolveAppUrl } from "../src/app-url";
import * as envModule from "../src/env";

describe("resolveAppUrl — pure", () => {
  it("returns the given value when set", () => {
    expect(resolveAppUrl("https://example.com")).toBe("https://example.com");
  });

  it("falls back to the local-dev default when unset", () => {
    expect(resolveAppUrl(undefined)).toBe(DEFAULT_APP_URL);
  });
});

describe("getAppUrl — reads live env", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns APP_URL when getEnv() has it set", () => {
    vi.spyOn(envModule, "getEnv").mockReturnValue({ APP_URL: "https://app.example.com" } as never);
    expect(getAppUrl()).toBe("https://app.example.com");
  });

  it("falls back to the local-dev default when APP_URL is unset", () => {
    vi.spyOn(envModule, "getEnv").mockReturnValue({} as never);
    expect(getAppUrl()).toBe(DEFAULT_APP_URL);
  });
});
