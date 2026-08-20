import { describe, expect, it } from "vitest";

import type { Capabilities } from "../src/capabilities";
import { buildClientConfig } from "../src/public-config";
import type { RawEnv } from "../src/registry";

const ALL_ENABLED: Capabilities = {
  billing: "stripe",
  llm: "openrouter",
  email: "resend",
  jobs: "inngest",
  analytics: "posthog",
  errors: "sentry",
};

const ALL_DISABLED: Capabilities = {
  billing: "disabled",
  llm: "disabled",
  email: "disabled",
  jobs: "disabled",
  analytics: "disabled",
  errors: "disabled",
};

describe("buildClientConfig — capabilities are booleans only", () => {
  it("every capability value is strictly a boolean, never an adapter string", () => {
    const config = buildClientConfig({}, ALL_ENABLED);
    for (const [service, value] of Object.entries(config.capabilities)) {
      expect(typeof value, `${service} should be boolean`).toBe("boolean");
    }
  });

  it("maps every non-'disabled' adapter to true", () => {
    const config = buildClientConfig({}, ALL_ENABLED);
    expect(config.capabilities).toEqual({
      billing: true,
      llm: true,
      email: true,
      jobs: true,
      analytics: true,
      errors: true,
    });
  });

  it("maps every 'disabled' adapter to false", () => {
    const config = buildClientConfig({}, ALL_DISABLED);
    expect(config.capabilities).toEqual({
      billing: false,
      llm: false,
      email: false,
      jobs: false,
      analytics: false,
      errors: false,
    });
  });

  it("never leaks an adapter identity string anywhere in the serialized output", () => {
    const config = buildClientConfig({}, ALL_ENABLED);
    const serialized = JSON.stringify(config);
    for (const identity of ["stripe", "openrouter", "resend", "inngest", "sentry"]) {
      expect(serialized, `"${identity}" leaked into ClientConfig`).not.toContain(identity);
    }
  });
});

describe("buildClientConfig — posthog", () => {
  it("is null when analytics is disabled, even if POSTHOG_KEY is somehow present", () => {
    const env: RawEnv = { POSTHOG_KEY: "phc_x" };
    const config = buildClientConfig(env, ALL_DISABLED);
    expect(config.posthog).toBeNull();
  });

  it("is null when analytics is enabled but POSTHOG_KEY is missing", () => {
    const config = buildClientConfig({}, ALL_ENABLED);
    expect(config.posthog).toBeNull();
  });

  it("is populated with the given POSTHOG_HOST when analytics is posthog", () => {
    const env: RawEnv = { POSTHOG_KEY: "phc_x", POSTHOG_HOST: "https://eu.i.posthog.com" };
    const config = buildClientConfig(env, ALL_ENABLED);
    expect(config.posthog).toEqual({ key: "phc_x", host: "https://eu.i.posthog.com" });
  });

  it("defaults the host when POSTHOG_HOST is unset", () => {
    const env: RawEnv = { POSTHOG_KEY: "phc_x" };
    const config = buildClientConfig(env, ALL_ENABLED);
    expect(config.posthog).toEqual({ key: "phc_x", host: "https://us.i.posthog.com" });
  });
});

describe("buildClientConfig — appUrl", () => {
  it("defaults to http://localhost:3000 when APP_URL is unset", () => {
    const config = buildClientConfig({}, ALL_DISABLED);
    expect(config.appUrl).toBe("http://localhost:3000");
  });

  it("uses APP_URL when set", () => {
    const env: RawEnv = { APP_URL: "https://example.com" };
    const config = buildClientConfig(env, ALL_DISABLED);
    expect(config.appUrl).toBe("https://example.com");
  });
});
