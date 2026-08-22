import { createElement } from "react";

import type { Capabilities, Env } from "@factory/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { send, sendRendered } from "../src/send";

// Tracks whether the `resend` module was ever imported (module-registry check, E.8/E.9.5)
// and whether `new Resend(...)` was actually constructed (per-test, reset in beforeEach).
// `everImported` only flips true the first time something actually does
// `await import("resend")` — vitest resolves a mocked module's factory lazily, exactly
// once, on first import — so as long as the disabled/console-path tests run before any
// resend-enabled test (true here: they're declared first), asserting it's still `false`
// proves the disabled/console paths never touched the module at all, not just that they
// didn't construct a client from it.
const resendState = vi.hoisted(() => ({
  everImported: false,
  constructed: false,
  sendMock: vi
    .fn<
      (args: Record<string, unknown>) => Promise<{
        data: { id: string } | null;
        error: { name: string; message: string } | null;
      }>
    >()
    .mockResolvedValue({ data: { id: "email_123" }, error: null }),
}));

vi.mock("resend", () => {
  resendState.everImported = true;
  class Resend {
    constructor(public key?: string) {
      resendState.constructed = true;
    }
    emails = { send: resendState.sendMock };
  }
  return { Resend };
});

vi.mock("@factory/config", () => ({
  getCapabilities: vi.fn(),
  getEnv: vi.fn(),
}));

import { getCapabilities, getEnv } from "@factory/config";

const mockedGetCapabilities = vi.mocked(getCapabilities);
const mockedGetEnv = vi.mocked(getEnv);

const BASE_CAPABILITIES: Capabilities = {
  billing: "disabled",
  llm: "disabled",
  email: "disabled",
  jobs: "disabled",
  analytics: "disabled",
  errors: "disabled",
};

function capabilitiesWith(email: Capabilities["email"]): Capabilities {
  return { ...BASE_CAPABILITIES, email };
}

const BASE_ENV = {} as Env;

beforeEach(() => {
  resendState.constructed = false;
  resendState.sendMock.mockClear();
  mockedGetCapabilities.mockReset();
  mockedGetEnv.mockReset();
  // `.mockClear()` matters here, not just `.mockImplementation()`: `vi.spyOn` on an
  // already-spied method returns the SAME mock instance rather than wrapping it again,
  // so a prior test's call count otherwise leaks into this one — any test asserting
  // `toHaveBeenCalledTimes` would only pass by accident of declaration order.
  vi.spyOn(console, "log")
    .mockImplementation(() => {})
    .mockClear();
  vi.spyOn(console, "error")
    .mockImplementation(() => {})
    .mockClear();
});

describe("send — disabled", () => {
  it("returns the typed no-op and loads no resend module", async () => {
    mockedGetCapabilities.mockReturnValue(capabilitiesWith("disabled"));

    const result = await send("verify-email", "user@example.com", {
      url: "https://example.com/verify",
    });

    expect(result).toEqual({ delivered: false, reason: "disabled" });
    expect(resendState.everImported).toBe(false);
    expect(mockedGetEnv).not.toHaveBeenCalled();
  });
});

describe("send — console", () => {
  it("logs the rendered output and returns the typed no-op, loading no resend module", async () => {
    mockedGetCapabilities.mockReturnValue(capabilitiesWith("console"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await send("magic-link", "user@example.com", {
      url: "https://example.com/magic",
    });

    expect(result).toEqual({ delivered: false, reason: "console" });
    expect(resendState.everImported).toBe(false);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = logSpy.mock.calls[0]?.[0] as string;
    expect(logged).toContain("console transport");
    expect(logged).toContain("https://example.com/magic");
  });
});

// `sendRendered` is the generic escape hatch a preset domain package (e.g.
// `@factory/untangle`'s daily-plan template) uses to reach the same transport/
// degradation path `send()` uses, for a React element it built itself rather than one
// registered in this package's own `TEMPLATES` map. It funnels through the exact same
// `deliver()` internals, so only the disabled/console paths get their own coverage here
// — the resend-branch behavior (render, guarded dynamic import, provider-error mapping)
// is already exercised above via `send()`, and duplicating it would just be testing the
// shared internals twice. Declared BEFORE any resend-enabled test (same ordering
// constraint the file header documents for `send`'s own disabled/console tests) — module
// resolution of "resend" is cached process-wide, so `everImported` only proves anything
// asserted before the first real import happens anywhere in this file.
describe("sendRendered — disabled", () => {
  it("returns the typed no-op and loads no resend module", async () => {
    mockedGetCapabilities.mockReturnValue(capabilitiesWith("disabled"));

    const result = await sendRendered({
      to: "user@example.com",
      subject: "Your plan for today",
      react: createElement("p", null, "hello"),
    });

    expect(result).toEqual({ delivered: false, reason: "disabled" });
    expect(resendState.everImported).toBe(false);
    expect(mockedGetEnv).not.toHaveBeenCalled();
  });
});

describe("sendRendered — console", () => {
  it("logs the rendered output under the caller's own subject, loading no resend module", async () => {
    mockedGetCapabilities.mockReturnValue(capabilitiesWith("console"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendRendered({
      to: "user@example.com",
      subject: "Your plan for today",
      react: createElement("p", null, "Call Marco"),
    });

    expect(result).toEqual({ delivered: false, reason: "console" });
    expect(resendState.everImported).toBe(false);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = logSpy.mock.calls[0]?.[0] as string;
    expect(logged).toContain("console transport");
    expect(logged).toContain("Your plan for today");
    expect(logged).toContain("Call Marco");
  });
});

describe("send — resend, not configured", () => {
  it("returns not-configured when EMAIL_FROM is missing, without importing resend", async () => {
    mockedGetCapabilities.mockReturnValue(capabilitiesWith("resend"));
    mockedGetEnv.mockReturnValue({ ...BASE_ENV, EMAIL_FROM: undefined } as Env);

    const result = await send("verify-email", "user@example.com", {
      url: "https://example.com/verify",
    });

    expect(result).toEqual({ delivered: false, reason: "not-configured" });
    expect(resendState.constructed).toBe(false);
  });
});

describe("send — resend, success", () => {
  it("imports resend, sends html+text (never react), and reports delivered", async () => {
    mockedGetCapabilities.mockReturnValue(capabilitiesWith("resend"));
    mockedGetEnv.mockReturnValue({
      ...BASE_ENV,
      EMAIL_FROM: "Fabulous Factory <hello@example.com>",
      RESEND_API_KEY: "re_test_key",
    } as Env);

    const result = await send("verify-email", "user@example.com", {
      url: "https://example.com/verify",
    });

    expect(result).toEqual({ delivered: true });
    expect(resendState.everImported).toBe(true);
    expect(resendState.constructed).toBe(true);
    expect(resendState.sendMock).toHaveBeenCalledTimes(1);
    const args = resendState.sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.from).toBe("Fabulous Factory <hello@example.com>");
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toBe("Verify your email address");
    expect(typeof args.html).toBe("string");
    expect(args.html as string).toContain("https://example.com/verify");
    expect(typeof args.text).toBe("string");
    expect(args.text as string).toContain("https://example.com/verify");
    expect(args.react).toBeUndefined();
  });
});

describe("send — resend, provider error", () => {
  it("maps a provider error to the typed no-op", async () => {
    mockedGetCapabilities.mockReturnValue(capabilitiesWith("resend"));
    mockedGetEnv.mockReturnValue({
      ...BASE_ENV,
      EMAIL_FROM: "Fabulous Factory <hello@example.com>",
      RESEND_API_KEY: "re_test_key",
    } as Env);
    resendState.sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "invalid recipient" },
    } as never);

    const result = await send("magic-link", "user@example.com", {
      url: "https://example.com/magic",
    });

    expect(result).toEqual({ delivered: false, reason: "provider-error" });
  });
});
