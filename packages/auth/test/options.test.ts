import type { Capabilities, RawEnv } from "@factory/config";
import { describe, expect, it } from "vitest";

import { deriveAuthOptions } from "../src/options";

// Auth is always-on and, in M2, independent of every capability flag — content doesn't
// matter for these tests, only that a well-formed Capabilities object is passed through.
const CAPABILITIES: Capabilities = {
  billing: "disabled",
  llm: "disabled",
  email: "disabled",
  jobs: "disabled",
  analytics: "disabled",
  errors: "disabled",
};

describe("deriveAuthOptions — requireEmailVerification", () => {
  it("is always false (TODO(M4))", () => {
    expect(deriveAuthOptions({}, CAPABILITIES).requireEmailVerification).toBe(false);

    const fullEnv: RawEnv = {
      GOOGLE_CLIENT_ID: "gid",
      GOOGLE_CLIENT_SECRET: "gsecret",
      GITHUB_CLIENT_ID: "hid",
      GITHUB_CLIENT_SECRET: "hsecret",
    };
    expect(deriveAuthOptions(fullEnv, CAPABILITIES).requireEmailVerification).toBe(false);
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
