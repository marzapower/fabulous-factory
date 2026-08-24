/**
 * Asserts the `betterAuth({...})` config SHAPE `src/auth.ts` builds, in both email
 * profiles — same "mock every vendor/service boundary, assert on the plain object" idiom
 * `options.test.ts` uses for `deriveAuthOptions`, extended here to the module that
 * actually calls `betterAuth()`. `betterAuth` itself is mocked to just return its config
 * argument unchanged, so this suite inspects the exact object `src/auth.ts` assembles
 * without a real Better Auth instance or a database.
 *
 * The module under test computes its config at IMPORT time (module-scope `betterAuth(...)`
 * call), so each profile needs a fresh module registry (`vi.resetModules()`) and a fresh
 * dynamic `import("../src/auth")` — a single static import can only ever see one profile.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedGetEnv = vi.fn();
const mockedGetCapabilities = vi.fn();
const mockedSend = vi.fn();
const mockedBetterAuth = vi.fn((config: unknown) => config);
const mockedDrizzleAdapter = vi.fn<(...args: unknown[]) => object>(() => ({}));
const mockedMagicLink = vi.fn((opts: unknown) => ({ id: "magic-link", opts }));

vi.mock("@factory/config", () => ({
  getEnv: () => mockedGetEnv(),
  getCapabilities: () => mockedGetCapabilities(),
}));
vi.mock("@factory/db", () => ({ getDb: () => ({}), schema: {} }));
vi.mock("@factory/email", () => ({ send: (...args: unknown[]) => mockedSend(...args) }));
vi.mock("better-auth", () => ({ betterAuth: (config: unknown) => mockedBetterAuth(config) }));
vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: (...args: unknown[]) => mockedDrizzleAdapter(...args),
}));
vi.mock("better-auth/plugins", () => ({
  magicLink: (opts: unknown) => mockedMagicLink(opts),
}));

const BASE_ENV = { BETTER_AUTH_SECRET: "a".repeat(16) };

function setCapabilities(
  email: "disabled" | "console" | "resend",
  envOverrides: Record<string, string> = {},
) {
  mockedGetEnv.mockReturnValue({ ...BASE_ENV, ...envOverrides });
  mockedGetCapabilities.mockReturnValue({
    billing: "disabled",
    llm: "disabled",
    email,
    jobs: "disabled",
    analytics: "disabled",
    errors: "disabled",
  });
}

async function loadAuthConfig() {
  vi.resetModules();
  const mod = await import("../src/auth");
  // `betterAuth` is mocked to return its config argument verbatim.
  return mod.auth as unknown as {
    emailAndPassword: {
      sendResetPassword?: (data: { user: { email: string }; url: string }) => Promise<void>;
    };
    user?: {
      deleteUser?: {
        enabled: boolean;
        sendDeleteAccountVerification?: (data: {
          user: { email: string };
          url: string;
        }) => Promise<void>;
      };
    };
    rateLimit?: { enabled: boolean; storage: string };
    advanced?: { ipAddress?: { trustedProxies?: string[] } };
    plugins: unknown[];
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSend.mockResolvedValue({ delivered: true });
});

describe("auth config — email disabled", () => {
  it("omits sendResetPassword entirely, so better-auth falls back to its own RESET_PASSWORD_DISABLED error", async () => {
    setCapabilities("disabled");
    const config = await loadAuthConfig();

    expect(config.emailAndPassword).not.toHaveProperty("sendResetPassword");
  });

  it("rate-limits the unauthenticated, email-sending endpoints via the shared database storage — not the built-in per-instance memory store", async () => {
    setCapabilities("disabled");
    const config = await loadAuthConfig();

    expect(config.rateLimit).toEqual({ enabled: true, storage: "database" });
  });

  it("enables deleteUser but omits sendDeleteAccountVerification entirely", async () => {
    setCapabilities("disabled");
    const config = await loadAuthConfig();

    expect(config.user?.deleteUser?.enabled).toBe(true);
    expect(config.user?.deleteUser).not.toHaveProperty("sendDeleteAccountVerification");
  });
});

describe.each(["console", "resend"] as const)("auth config — email %s", (email) => {
  it("rate-limits via the shared database storage regardless of email posture", async () => {
    setCapabilities(email);
    const config = await loadAuthConfig();

    expect(config.rateLimit).toEqual({ enabled: true, storage: "database" });
  });

  it("wires sendResetPassword, sending the reset-password template", async () => {
    setCapabilities(email);
    const config = await loadAuthConfig();

    expect(typeof config.emailAndPassword.sendResetPassword).toBe("function");
    await config.emailAndPassword.sendResetPassword?.({
      user: { email: "a@example.com" },
      url: "https://example.com/reset",
    });
    expect(mockedSend).toHaveBeenCalledWith("reset-password", "a@example.com", {
      url: "https://example.com/reset",
    });
  });

  it("wires sendDeleteAccountVerification, sending the delete-account template", async () => {
    setCapabilities(email);
    const config = await loadAuthConfig();

    expect(config.user?.deleteUser?.enabled).toBe(true);
    expect(typeof config.user?.deleteUser?.sendDeleteAccountVerification).toBe("function");

    await config.user?.deleteUser?.sendDeleteAccountVerification?.({
      user: { email: "b@example.com" },
      url: "https://example.com/delete-user/callback",
    });
    expect(mockedSend).toHaveBeenCalledWith("delete-account", "b@example.com", {
      url: "https://example.com/delete-user/callback",
    });
  });

  it("does NOT throw when the reset-password email fails to deliver (anti-enumeration: response uniformity must survive a provider outage)", async () => {
    setCapabilities(email);
    mockedSend.mockResolvedValue({ delivered: false, reason: "provider-error" });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = await loadAuthConfig();

    await expect(
      config.emailAndPassword.sendResetPassword?.({
        user: { email: "a@example.com" },
        url: "https://example.com/reset",
      }),
    ).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("password reset email not delivered"),
    );
    // The logged reason, never the token/url — a live credential must never land in logs.
    expect(consoleErrorSpy.mock.calls[0]?.[0]).not.toContain("https://example.com/reset");

    consoleErrorSpy.mockRestore();
  });
});

describe("auth config — TRUSTED_PROXIES wiring", () => {
  it("omits `advanced` entirely when TRUSTED_PROXIES is unset, so Better Auth falls through to its own default", async () => {
    setCapabilities("disabled");
    const config = await loadAuthConfig();

    expect(config).not.toHaveProperty("advanced");
  });

  it("wires advanced.ipAddress.trustedProxies, split and trimmed, when TRUSTED_PROXIES is set", async () => {
    setCapabilities("disabled", { TRUSTED_PROXIES: "10.0.0.0/24, 192.0.2.10 ,203.0.113.5" });
    const config = await loadAuthConfig();

    expect(config.advanced?.ipAddress?.trustedProxies).toEqual([
      "10.0.0.0/24",
      "192.0.2.10",
      "203.0.113.5",
    ]);
  });

  it("omits `advanced` when TRUSTED_PROXIES is set but empty after trimming", async () => {
    setCapabilities("disabled", { TRUSTED_PROXIES: "  , ," });
    const config = await loadAuthConfig();

    expect(config).not.toHaveProperty("advanced");
  });
});
