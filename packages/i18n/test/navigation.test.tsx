// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockPrefetch = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: mockPrefetch,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/settings",
}));

import { NextIntlClientProvider } from "../src/index";
import { I18nProvider } from "../src/client";
import { Link, useRouter } from "../src/navigation";
import type { LocaleRouting } from "../src/routing";

const routing: LocaleRouting = {
  locales: ["en", "it"],
  defaultLocale: "en",
  cookieName: "NEXT_LOCALE",
};

function wrapper(locale: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={{}}>
        <I18nProvider routing={routing}>{children}</I18nProvider>
      </NextIntlClientProvider>
    );
  };
}

describe("Link", () => {
  it("renders a bare href for the default locale", () => {
    render(<Link href="/settings">Settings</Link>, { wrapper: wrapper("en") });
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
  });

  it("renders a locale-prefixed href for a non-default locale", () => {
    render(<Link href="/settings">Settings</Link>, { wrapper: wrapper("it") });
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      "/it/settings",
    );
  });

  it("honours an explicit locale prop over the ambient locale", () => {
    render(
      <Link href="/settings" locale="it">
        Settings
      </Link>,
      { wrapper: wrapper("en") },
    );
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      "/it/settings",
    );
  });
});

describe("useRouter", () => {
  function Consumer() {
    const router = useRouter();
    return (
      <>
        <button onClick={() => router.push("/settings")}>push</button>
        <button onClick={() => router.replace("/settings", { locale: "it" })}>replace</button>
      </>
    );
  }

  it("push() localizes the href with the ambient locale", () => {
    render(<Consumer />, { wrapper: wrapper("it") });
    fireEvent.click(screen.getByRole("button", { name: "push" }));
    expect(mockPush).toHaveBeenCalledWith("/it/settings", { scroll: undefined });
  });

  it("replace() localizes the href with the requested locale, overriding the ambient one", () => {
    render(<Consumer />, { wrapper: wrapper("en") });
    fireEvent.click(screen.getByRole("button", { name: "replace" }));
    expect(mockReplace).toHaveBeenCalledWith("/it/settings", { scroll: undefined });
  });
});
