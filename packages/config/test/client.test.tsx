// @vitest-environment jsdom
import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ClientConfigProvider, useClientConfig, type ClientConfig } from "../src/client";

const SAMPLE_CONFIG: ClientConfig = {
  capabilities: {
    billing: true,
    llm: false,
    email: true,
    jobs: false,
    analytics: true,
    errors: false,
  },
  appUrl: "https://example.com",
  posthog: { key: "phc_x", host: "https://us.i.posthog.com" },
};

function Consumer() {
  const config = useClientConfig();
  return <div data-testid="app-url">{config.appUrl}</div>;
}

describe("useClientConfig", () => {
  it("throws a clear error when rendered outside the provider", () => {
    // Swallow the expected React error-boundary console.error noise for this assertion.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useClientConfig())).toThrow(/ClientConfigProvider/);
    } finally {
      spy.mockRestore();
    }
  });

  it("returns the exact config object passed to the provider", () => {
    const { result } = renderHook(() => useClientConfig(), {
      wrapper: ({ children }) => (
        <ClientConfigProvider config={SAMPLE_CONFIG}>{children}</ClientConfigProvider>
      ),
    });
    expect(result.current).toEqual(SAMPLE_CONFIG);
    expect(result.current).toBe(SAMPLE_CONFIG);
  });
});

describe("ClientConfigProvider", () => {
  it("makes the config available to descendant client components", () => {
    render(
      <ClientConfigProvider config={SAMPLE_CONFIG}>
        <Consumer />
      </ClientConfigProvider>,
    );
    expect(screen.getByTestId("app-url").textContent).toBe("https://example.com");
  });
});
