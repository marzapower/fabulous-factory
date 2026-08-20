import type { Capabilities, RawEnv } from "@factory/config";
import { describe, expect, it } from "vitest";

import { deriveAuthOptions } from "../src/options";

// A well-formed default Capabilities object. Auth itself is always-on, but since M4 the
// email capability drives verification/magic-link — tests that exercise that override the
// `email` field explicitly.
const CAPABILITIES: Capabilities = {
  billing: "disabled",
  llm: "disabled",
  email: "disabled",
  jobs: "disabled",
  analytics: "disabled",
  errors: "disabled",
};

describe("deriveAuthOptions — requireEmailVerification", () => {
  it("is false when email is disabled", () => {
    expect(deriveAuthOptions({}, CAPABILITIES).requireEmailVerification).toBe(false);

    const fullEnv: RawEnv = {
      GOOGLE_CLIENT_ID: "gid",
      GOOGLE_CLIENT_SECRET: "gsecret",
      GITHUB_CLIENT_ID: "hid",
      GITHUB_CLIENT_SECRET: "hsecret",
    };
    expect(deriveAuthOptions(fullEnv, CAPABILITIES).requireEmailVerification).toBe(false);
  });

  it("is true whenever email is enabled (console or resend), regardless of env", () => {
    const consoleCapabilities: Capabilities = { ...CAPABILITIES, email: "console" };
    const resendCapabilities: Capabilities = { ...CAPABILITIES, email: "resend" };

    expect(deriveAuthOptions({}, consoleCapabilities).requireEmailVerification).toBe(true);
    expect(deriveAuthOptions({}, resendCapabilities).requireEmailVerification).toBe(true);
  });
});

describe("deriveAuthOptions — email feature flags (plan E.9.6)", () => {
  it("both verification and magicLink are false when email is disabled", () => {
    const options = deriveAuthOptions({}, CAPABILITIES);
    expect(options.email).toEqual({ verification: false, magicLink: false });
  });

  it("both verification and magicLink are true when email is console (dev)", () => {
    const capabilities: Capabilities = { ...CAPABILITIES, email: "console" };
    const options = deriveAuthOptions({}, capabilities);
    expect(options.email).toEqual({ verification: true, magicLink: true });
  });

  it("both verification and magicLink are true when email is resend", () => {
    const capabilities: Capabilities = { ...CAPABILITIES, email: "resend" };
    const options = deriveAuthOptions({}, capabilities);
    expect(options.email).toEqual({ verification: true, magicLink: true });
  });

  it("email flags always track requireEmailVerification together", () => {
    for (const email of ["disabled", "console", "resend"] as const) {
      const capabilities: Capabilities = { ...CAPABILITIES, email };
      const options = deriveAuthOptions({}, capabilities);
      expect(options.email.verification).toBe(options.requireEmailVerification);
      expect(options.email.magicLink).toBe(options.requireEmailVerification);
    }
  });
});

describe("deriveAuthOptions — no keys", () => {
  it("enables no providers with an empty env", () => {
    const options = deriveAuthOptions({}, CAPABILITIES);
    expect(options.socialProviders).toEqual({});
    expect(options.enabledProviders).toEqual([]);
  });
});

describe("deriveAuthOptions — google", () => {
  it("does not appear with only GOOGLE_CLIENT_ID set", () => {
    const env: RawEnv = { GOOGLE_CLIENT_ID: "gid" };
    const options = deriveAuthOptions(env, CAPABILITIES);
    expect(options.socialProviders.google).toBeUndefined();
    expect(options.enabledProviders).not.toContain("google");
  });

  it("does not appear with only GOOGLE_CLIENT_SECRET set", () => {
    const env: RawEnv = { GOOGLE_CLIENT_SECRET: "gsecret" };
    const options = deriveAuthOptions(env, CAPABILITIES);
    expect(options.socialProviders.google).toBeUndefined();
    expect(options.enabledProviders).not.toContain("google");
  });

  it("appears, with clientId/clientSecret, when both keys are set", () => {
    const env: RawEnv = { GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret" };
    const options = deriveAuthOptions(env, CAPABILITIES);
    expect(options.socialProviders.google).toEqual({ clientId: "gid", clientSecret: "gsecret" });
    expect(options.enabledProviders).toContain("google");
  });
});

describe("deriveAuthOptions — github", () => {
  it("does not appear with only GITHUB_CLIENT_ID set", () => {
    const env: RawEnv = { GITHUB_CLIENT_ID: "hid" };
    const options = deriveAuthOptions(env, CAPABILITIES);
    expect(options.socialProviders.github).toBeUndefined();
    expect(options.enabledProviders).not.toContain("github");
  });

  it("does not appear with only GITHUB_CLIENT_SECRET set", () => {
    const env: RawEnv = { GITHUB_CLIENT_SECRET: "hsecret" };
    const options = deriveAuthOptions(env, CAPABILITIES);
    expect(options.socialProviders.github).toBeUndefined();
    expect(options.enabledProviders).not.toContain("github");
  });

  it("appears, with clientId/clientSecret, when both keys are set", () => {
    const env: RawEnv = { GITHUB_CLIENT_ID: "hid", GITHUB_CLIENT_SECRET: "hsecret" };
    const options = deriveAuthOptions(env, CAPABILITIES);
    expect(options.socialProviders.github).toEqual({ clientId: "hid", clientSecret: "hsecret" });
    expect(options.enabledProviders).toContain("github");
  });
});

describe("deriveAuthOptions — both providers", () => {
  it("enables google and github independently and simultaneously", () => {
    const env: RawEnv = {
      GOOGLE_CLIENT_ID: "gid",
      GOOGLE_CLIENT_SECRET: "gsecret",
      GITHUB_CLIENT_ID: "hid",
      GITHUB_CLIENT_SECRET: "hsecret",
    };
    const options = deriveAuthOptions(env, CAPABILITIES);
    expect(options.socialProviders).toEqual({
      google: { clientId: "gid", clientSecret: "gsecret" },
      github: { clientId: "hid", clientSecret: "hsecret" },
    });
    expect([...options.enabledProviders].sort()).toEqual(["github", "google"]);
  });
});

describe("deriveAuthOptions — purity", () => {
  it("is a pure function: same inputs always produce an equivalent output", () => {
    const env: RawEnv = { GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret" };
    expect(deriveAuthOptions(env, CAPABILITIES)).toEqual(deriveAuthOptions(env, CAPABILITIES));
  });

  it("never mutates the input env object", () => {
    const env: RawEnv = { GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret" };
    const snapshot = { ...env };
    deriveAuthOptions(env, CAPABILITIES);
    expect(env).toEqual(snapshot);
  });
});
