// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ClientConfig } from "@factory/config/client";
import { ClientConfigProvider } from "@factory/config/client";
import type { LocaleRouting } from "@factory/i18n/routing";

import { CapabilityPanel } from "../src/capability-panel";
import { i18nWrapper } from "./render";

const CONFIG: ClientConfig = {
  capabilities: {
    billing: false,
    llm: false,
    jobs: false,
    email: false,
    analytics: false,
    errors: false,
  },
  appUrl: "http://localhost:3000",
  posthog: null,
};

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

function renderWith(routing: LocaleRouting) {
  const I18nWrapper = i18nWrapper("en", routing);
  return render(
    <I18nWrapper>
      <ClientConfigProvider config={CONFIG}>
        <CapabilityPanel />
      </ClientConfigProvider>
    </I18nWrapper>,
  );
}

describe("CapabilityPanel", () => {
  it("shows a Localization row listing every declared locale with the default annotation", () => {
    renderWith(TWO_LOCALES);

    const row = screen.getByText("Localization").closest("li");
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain("en · it");
    expect(row!.textContent).toContain("(default en)");
    // Informational, not an Enabled/Disabled capability toggle.
    expect(row!.textContent).not.toContain("Enabled");
    expect(row!.textContent).not.toContain("Disabled");
    // Locale list is styled the same green as an ACTIVE/enabled capability.
    expect(screen.getByText("en · it").className).toContain("text-emerald-600");
    expect(screen.getByText("en · it").className).toContain("dark:text-emerald-400");
  });

  it("shows '<locale> only' when a single locale is declared", () => {
    renderWith(ONE_LOCALE);

    const row = screen.getByText("Localization").closest("li");
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain("en only");
    expect(screen.getByText("en only").className).toContain("text-emerald-600");
    expect(screen.getByText("en only").className).toContain("dark:text-emerald-400");
  });
});
