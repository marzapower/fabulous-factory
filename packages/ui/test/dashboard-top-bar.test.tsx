// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@factory/auth/client", () => ({
  authClient: { signOut: vi.fn() },
}));

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

import { DashboardTopBar } from "../src/dashboard/top-bar";
import { renderI18n } from "./render";

describe("DashboardTopBar", () => {
  it("renders the Settings link, theme toggle, and sign-out button", () => {
    renderI18n(<DashboardTopBar userEmail="ada@example.com" settingsHref="/settings" />);

    const settingsLink = screen.getByRole("link", { name: /settings/i });
    expect(settingsLink.getAttribute("href")).toBe("/settings");

    expect(screen.getByRole("button", { name: /sign out/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /toggle theme/i })).toBeTruthy();
  });

  it("points the Settings link at the given settingsHref", () => {
    renderI18n(<DashboardTopBar userEmail="ada@example.com" settingsHref="/account/settings" />);

    expect(screen.getByRole("link", { name: /settings/i }).getAttribute("href")).toBe(
      "/account/settings",
    );
  });
});
