import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the vi.mock factories below (which run before this file's own top-level
// code, per Vitest's hoisting) can close over them.
const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  // Flips true only if something actually imports "@sentry/node" — the disabled-path
  // test asserts this stays false, which is the "loads no vendor SDK" contract test
  // plan E.9.5 asks for.
  loaded: false,
}));

vi.mock("@sentry/node", () => {
  sentry.loaded = true;
  return {
    init: sentry.init,
    captureException: sentry.captureException,
    captureMessage: sentry.captureMessage,
  };
});

const config = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
  getEnv: vi.fn(),
}));

vi.mock("@factory/config", () => config);

describe("captureException / captureMessage", () => {
  beforeEach(() => {
    // errors.ts memoizes its init promise at module scope — reset the module registry
    // so each test gets a fresh, un-initialized singleton.
    vi.resetModules();
    sentry.loaded = false;
    sentry.init.mockClear();
    sentry.captureException.mockClear();
    sentry.captureMessage.mockClear();
    config.getCapabilities.mockReset();
    config.getEnv.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no-ops and loads no @sentry/node code when the errors capability is disabled", async () => {
    config.getCapabilities.mockReturnValue({ errors: "disabled" });

    const { captureException, captureMessage } = await import("../src/errors");
    captureException(new Error("boom"));
    captureMessage("hello");

    // Disabled path returns synchronously before ever touching the dynamic import, so
    // there's no async work to flush before asserting.
    expect(sentry.loaded).toBe(false);
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(config.getEnv).not.toHaveBeenCalled();
  });

  it("initializes @sentry/node exactly once with the configured DSN, and forwards captures", async () => {
    config.getCapabilities.mockReturnValue({ errors: "sentry" });
    config.getEnv.mockReturnValue({ SENTRY_DSN: "https://example@o0.ingest.sentry.io/0" });

    const { captureException, captureMessage } = await import("../src/errors");

    const err = new Error("boom");
    // Fire multiple calls before init has had a chance to resolve — all of them must
    // still be queued onto the same init promise and reported once it settles.
    captureException(err, { userId: "u1" });
    captureMessage("first", "warning");
    captureMessage("second");

    await vi.waitFor(() => {
      expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
    });

    expect(sentry.loaded).toBe(true);
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(sentry.init).toHaveBeenCalledWith({ dsn: "https://example@o0.ingest.sentry.io/0" });
    expect(sentry.captureException).toHaveBeenCalledExactlyOnceWith(err, {
      extra: { userId: "u1" },
    });
    expect(sentry.captureMessage).toHaveBeenCalledWith("first", "warning");
    expect(sentry.captureMessage).toHaveBeenCalledWith("second", "info");
  });

  it("passes no `extra` hint when captureException is called without context", async () => {
    config.getCapabilities.mockReturnValue({ errors: "sentry" });
    config.getEnv.mockReturnValue({ SENTRY_DSN: "https://example@o0.ingest.sentry.io/0" });

    const { captureException } = await import("../src/errors");
    const err = new Error("no context");
    captureException(err);

    await vi.waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalledTimes(1);
    });
    expect(sentry.captureException).toHaveBeenCalledWith(err, undefined);
  });
});
