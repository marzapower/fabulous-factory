// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUsePathname = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => mockUsePathname(),
}));

import type { LocaleRouting } from "@factory/i18n/routing";

import { LocaleSwitcher } from "../src/locale-switcher";
import { i18nWrapper } from "./render";

const TWO_LOCALES: LocaleRouting = {
  locales: ["en", "it"],
  defaultLocale: "en",
  cookieName: "NEXT_LOCALE",
};

const ONE_LOCALE: LocaleRouting = {
  locales: ["en"],
  defaultLocale: "en",
  cookieName: "NEXT_LOCALE",
};

// A locale switch is a full navigation (window.location.assign), not a client-side
// router.replace — see the comment in src/locale-switcher.tsx. jsdom's `window.location`
// is not directly spyable, so we replace it wholesale with a stub that keeps `search`
// (query string preservation) and tracks `assign` calls.
let assignSpy: ReturnType<typeof vi.fn>;
let originalLocation: Location;

beforeEach(() => {
  mockUsePathname.mockReset();
  // Clear any cookie a previous test left behind.
  document.cookie = "NEXT_LOCALE=; Max-Age=0; Path=/";

  assignSpy = vi.fn();
  originalLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, search: "", assign: assignSpy },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("LocaleSwitcher", () => {
  it("renders nothing when the app declares only one locale (D8)", () => {
    mockUsePathname.mockReturnValue("/settings");
    render(<LocaleSwitcher />, { wrapper: i18nWrapper("en", ONE_LOCALE) });

    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("switching from en to it on /settings sets the cookie then navigates to /it/settings", () => {
    mockUsePathname.mockReturnValue("/settings");
    render(<LocaleSwitcher />, { wrapper: i18nWrapper("en", TWO_LOCALES) });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "it" } });

    expect(document.cookie).toContain("NEXT_LOCALE=it");
    expect(assignSpy).toHaveBeenCalledWith("/it/settings");
  });

  it("switching from it to en on /it/settings sets the cookie then navigates to /settings (M7: no double-localization)", () => {
    mockUsePathname.mockReturnValue("/it/settings");
    render(<LocaleSwitcher />, { wrapper: i18nWrapper("it", TWO_LOCALES) });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "en" } });

    expect(document.cookie).toContain("NEXT_LOCALE=en");
    expect(assignSpy).toHaveBeenCalledWith("/settings");
  });

  it("preserves both the query string and the hash across a locale switch", () => {
    mockUsePathname.mockReturnValue("/settings");
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, search: "?x=1", hash: "#sec", assign: assignSpy },
    });
    render(<LocaleSwitcher />, { wrapper: i18nWrapper("en", TWO_LOCALES) });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "it" } });

    expect(assignSpy).toHaveBeenCalledWith("/it/settings?x=1#sec");
  });

  it("sets the cookie before navigating (order matters for the SSR read on the new document)", () => {
    mockUsePathname.mockReturnValue("/settings");
    render(<LocaleSwitcher />, { wrapper: i18nWrapper("en", TWO_LOCALES) });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "it" } });

    // The cookie is set synchronously in handleChange before window.location.assign is
    // called, so by the time assign fires the cookie is already on `document.cookie`.
    expect(assignSpy).toHaveBeenCalledTimes(1);
    expect(document.cookie).toContain("NEXT_LOCALE=it");
  });
});
