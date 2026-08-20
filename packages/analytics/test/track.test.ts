import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Capabilities } from "@factory/config";

// `vi.hoisted` because `vi.mock` factories below are hoisted above these declarations —
// referencing plain `const`s declared after them would throw a TDZ error.
const mocks = vi.hoisted(() => ({
  moduleLoadSpy: vi.fn(),
  constructorSpy: vi.fn(),
  captureMock: vi.fn(),
  isFeatureEnabledMock: vi.fn(),
  flushMock: vi.fn(),
  getCapabilitiesMock: vi.fn(),
  getEnvMock: vi.fn(),
}));

// `moduleLoadSpy()` runs iff this factory is ever evaluated, i.e. iff something actually
// imports "posthog-node" (statically or via `await import(...)`) — the import-spy that
// proves the disabled path never loads the SDK (E.8/E.9.5).
vi.mock("posthog-node", () => {
  mocks.moduleLoadSpy();
  class FakePostHog {
    constructor(...args: unknown[]) {
      mocks.constructorSpy(...args);
    }
    capture(...args: unknown[]) {
      return mocks.captureMock(...args);
    }
    isFeatureEnabled(...args: unknown[]) {
      return mocks.isFeatureEnabledMock(...args);
    }
    flush(...args: unknown[]) {
      return mocks.flushMock(...args);
    }
  }
  return { PostHog: FakePostHog };
});

vi.mock("@factory/config", () => ({
  getCapabilities: () => mocks.getCapabilitiesMock(),
  getEnv: () => mocks.getEnvMock(),
}));

function capabilities(analytics: Capabilities["analytics"]): Capabilities {
  return {
    billing: "disabled",
    llm: "disabled",
    email: "disabled",
    jobs: "disabled",
    analytics,
    errors: "disabled",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // track.ts/shutdown.ts hold module-scoped singleton state (the lazy PostHog client) —
  // reset the module registry so each test gets a fresh singleton, then re-import inside
  // the test body.
  vi.resetModules();
});

describe("track()", () => {
  it("no-ops and loads no posthog-node when analytics is disabled", async () => {
    mocks.getCapabilitiesMock.mockReturnValue(capabilities("disabled"));
    const { track } = await import("../src/track");

    track("signup", { distinctId: "user_1" });

    expect(mocks.moduleLoadSpy).not.toHaveBeenCalled();
    expect(mocks.constructorSpy).not.toHaveBeenCalled();
    expect(mocks.captureMock).not.toHaveBeenCalled();
  });

  it("captures the event via the lazily-constructed PostHog singleton when enabled", async () => {
    mocks.getCapabilitiesMock.mockReturnValue(capabilities("posthog"));
    mocks.getEnvMock.mockReturnValue({
      POSTHOG_KEY: "phc_test",
      POSTHOG_HOST: "https://eu.i.posthog.com",
    });
    const { track } = await import("../src/track");

    track("signup", { distinctId: "user_1", plan: "pro" });

    await vi.waitFor(() => expect(mocks.captureMock).toHaveBeenCalledTimes(1));
    expect(mocks.moduleLoadSpy).toHaveBeenCalledTimes(1);
    expect(mocks.constructorSpy).toHaveBeenCalledWith("phc_test", {
      host: "https://eu.i.posthog.com",
    });
    expect(mocks.captureMock).toHaveBeenCalledWith({
      distinctId: "user_1",
      event: "signup",
      properties: { plan: "pro" },
    });
  });

  it("falls back to the default PostHog host when POSTHOG_HOST is unset", async () => {
    mocks.getCapabilitiesMock.mockReturnValue(capabilities("posthog"));
    mocks.getEnvMock.mockReturnValue({ POSTHOG_KEY: "phc_test" });
    const { track } = await import("../src/track");

    track("signup", { distinctId: "user_1" });

    await vi.waitFor(() => expect(mocks.constructorSpy).toHaveBeenCalled());
    expect(mocks.constructorSpy).toHaveBeenCalledWith("phc_test", {
      host: "https://us.i.posthog.com",
    });
  });

  it("reuses the same singleton across multiple calls", async () => {
    mocks.getCapabilitiesMock.mockReturnValue(capabilities("posthog"));
    mocks.getEnvMock.mockReturnValue({ POSTHOG_KEY: "phc_test" });
    const { track } = await import("../src/track");

    track("a", { distinctId: "u1" });
    track("b", { distinctId: "u1" });

    await vi.waitFor(() => expect(mocks.captureMock).toHaveBeenCalledTimes(2));
    expect(mocks.constructorSpy).toHaveBeenCalledTimes(1);
  });
});

describe("isFeatureEnabled()", () => {
  it("returns false and loads no posthog-node when analytics is disabled", async () => {
    mocks.getCapabilitiesMock.mockReturnValue(capabilities("disabled"));
    const { isFeatureEnabled } = await import("../src/track");

    await expect(isFeatureEnabled("beta", "user_1")).resolves.toBe(false);
    expect(mocks.moduleLoadSpy).not.toHaveBeenCalled();
  });

  it("delegates to the singleton's isFeatureEnabled when enabled", async () => {
    mocks.getCapabilitiesMock.mockReturnValue(capabilities("posthog"));
    mocks.getEnvMock.mockReturnValue({ POSTHOG_KEY: "phc_test" });
    mocks.isFeatureEnabledMock.mockResolvedValue(true);
    const { isFeatureEnabled } = await import("../src/track");

    await expect(isFeatureEnabled("beta", "user_1")).resolves.toBe(true);
    expect(mocks.isFeatureEnabledMock).toHaveBeenCalledWith("beta", "user_1");
  });

  it("defaults to false when the SDK resolves undefined", async () => {
    mocks.getCapabilitiesMock.mockReturnValue(capabilities("posthog"));
    mocks.getEnvMock.mockReturnValue({ POSTHOG_KEY: "phc_test" });
    mocks.isFeatureEnabledMock.mockResolvedValue(undefined);
    const { isFeatureEnabled } = await import("../src/track");

    await expect(isFeatureEnabled("beta", "user_1")).resolves.toBe(false);
  });
});

describe("flushAnalytics()", () => {
  it("no-ops when no singleton has been created", async () => {
    mocks.getCapabilitiesMock.mockReturnValue(capabilities("disabled"));
    const { flushAnalytics } = await import("../src/shutdown");

    await expect(flushAnalytics()).resolves.toBeUndefined();
    expect(mocks.flushMock).not.toHaveBeenCalled();
  });

  it("flushes the singleton's queue once track() has created it (flush, never shutdown — review fix M5)", async () => {
    mocks.getCapabilitiesMock.mockReturnValue(capabilities("posthog"));
    mocks.getEnvMock.mockReturnValue({ POSTHOG_KEY: "phc_test" });
    const { track } = await import("../src/track");
    const { flushAnalytics } = await import("../src/shutdown");

    track("signup", { distinctId: "user_1" });
    await vi.waitFor(() => expect(mocks.captureMock).toHaveBeenCalled());

    await flushAnalytics();

    expect(mocks.flushMock).toHaveBeenCalledTimes(1);
  });
});
