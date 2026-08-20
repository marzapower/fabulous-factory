import { describe, expect, it } from "vitest";

import { deriveCapabilities, type Capabilities } from "../src/capabilities";
import type { AppMode, RawEnv } from "../src/registry";

const DEFAULT: Capabilities = {
  billing: "disabled",
  llm: "disabled",
  email: "disabled",
  jobs: "disabled",
  analytics: "disabled",
  errors: "disabled",
};

describe("deriveCapabilities — empty env", () => {
  it("disables everything in production", () => {
    expect(deriveCapabilities({}, "production")).toEqual(DEFAULT);
  });

  it("disables everything except email/jobs falling back to dev defaults in development", () => {
    expect(deriveCapabilities({}, "development")).toEqual({
      ...DEFAULT,
      email: "console",
      jobs: "inngest",
    });
  });

  it("disables everything in test mode (mirrors production posture)", () => {
    expect(deriveCapabilities({}, "test")).toEqual(DEFAULT);
  });
});

describe("deriveCapabilities — billing", () => {
  it("is disabled with only STRIPE_SECRET_KEY set", () => {
    const env: RawEnv = { STRIPE_SECRET_KEY: "sk_test_x" };
    expect(deriveCapabilities(env, "production").billing).toBe("disabled");
  });

  it("is disabled with only STRIPE_WEBHOOK_SECRET set", () => {
    const env: RawEnv = { STRIPE_WEBHOOK_SECRET: "whsec_x" };
    expect(deriveCapabilities(env, "production").billing).toBe("disabled");
  });

  it("is stripe when both Stripe keys are set", () => {
    const env: RawEnv = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" };
    expect(deriveCapabilities(env, "production").billing).toBe("stripe");
  });

  it("BILLING_PROVIDER=disabled forces billing off even with both keys set", () => {
    const env: RawEnv = {
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      BILLING_PROVIDER: "disabled",
    };
    expect(deriveCapabilities(env, "production").billing).toBe("disabled");
  });
});

describe("deriveCapabilities — llm auto-detection precedence", () => {
  it("picks openrouter over direct and local when all credentials are present", () => {
    const env: RawEnv = {
      OPENROUTER_API_KEY: "sk-or-x",
      ANTHROPIC_API_KEY: "sk-ant-x",
      LLM_LOCAL_BASE_URL: "http://localhost:11434/v1",
    };
    expect(deriveCapabilities(env, "production").llm).toBe("openrouter");
  });

  it("picks direct (Anthropic) over local when both are present", () => {
    const env: RawEnv = { ANTHROPIC_API_KEY: "sk-ant-x", LLM_LOCAL_BASE_URL: "http://x/v1" };
    expect(deriveCapabilities(env, "production").llm).toBe("direct");
  });

  it("picks direct via OPENAI_API_KEY alone", () => {
    const env: RawEnv = { OPENAI_API_KEY: "sk-x" };
    expect(deriveCapabilities(env, "production").llm).toBe("direct");
  });

  it("picks local when only LLM_LOCAL_BASE_URL is present", () => {
    const env: RawEnv = { LLM_LOCAL_BASE_URL: "http://localhost:11434/v1" };
    expect(deriveCapabilities(env, "production").llm).toBe("local");
  });
});

describe("deriveCapabilities — LLM_PROFILE override", () => {
  it("wins when its credentials are present", () => {
    const env: RawEnv = {
      LLM_PROFILE: "direct",
      OPENROUTER_API_KEY: "sk-or-x", // would otherwise win by precedence
      ANTHROPIC_API_KEY: "sk-ant-x",
    };
    expect(deriveCapabilities(env, "production").llm).toBe("direct");
  });

  it("degrades to disabled when its credentials are missing", () => {
    const env: RawEnv = { LLM_PROFILE: "openrouter" };
    expect(deriveCapabilities(env, "production").llm).toBe("disabled");
  });

  it("local profile is honored with LLM_LOCAL_BASE_URL present", () => {
    const env: RawEnv = { LLM_PROFILE: "local", LLM_LOCAL_BASE_URL: "http://localhost:11434/v1" };
    expect(deriveCapabilities(env, "production").llm).toBe("local");
  });

  it("explicit disabled profile always wins", () => {
    const env: RawEnv = { LLM_PROFILE: "disabled", OPENROUTER_API_KEY: "sk-or-x" };
    expect(deriveCapabilities(env, "production").llm).toBe("disabled");
  });

  it("tolerates an unrecognized LLM_PROFILE value by falling back to auto-detection", () => {
    // Contract split: this layer (deriveCapabilities) stays pure and tolerant — it never
    // throws, so doctor can always call it even on a broken env. Rejecting the typo is
    // env.ts's job (parseEnv validates LLM_PROFILE as an enum — see env.test.ts), which
    // is what surfaces it to the operator via doctor's "ENVIRONMENT ISSUES" block.
    const env: RawEnv = {
      LLM_PROFILE: "not-a-real-profile",
      OPENROUTER_API_KEY: "sk-or-x",
    };
    expect(deriveCapabilities(env, "production").llm).toBe("openrouter");
  });
});

describe("deriveCapabilities — email by mode", () => {
  it("is resend when RESEND_API_KEY is set, regardless of mode", () => {
    const env: RawEnv = { RESEND_API_KEY: "re_x" };
    expect(deriveCapabilities(env, "production").email).toBe("resend");
    expect(deriveCapabilities(env, "development").email).toBe("resend");
  });

  it("is console only in development when unconfigured", () => {
    expect(deriveCapabilities({}, "development").email).toBe("console");
  });

  it("is disabled in production when unconfigured", () => {
    expect(deriveCapabilities({}, "production").email).toBe("disabled");
  });

  it("is disabled in test mode when unconfigured", () => {
    expect(deriveCapabilities({}, "test").email).toBe("disabled");
  });
});

describe("deriveCapabilities — jobs (provisional)", () => {
  it("is inngest when both Inngest keys are set, in any mode", () => {
    const env: RawEnv = { INNGEST_EVENT_KEY: "evt_x", INNGEST_SIGNING_KEY: "sign_x" };
    expect(deriveCapabilities(env, "production").jobs).toBe("inngest");
  });

  it("defaults to inngest in development when unconfigured (local inngest dev server)", () => {
    expect(deriveCapabilities({}, "development").jobs).toBe("inngest");
  });

  it("is disabled in production when unconfigured", () => {
    expect(deriveCapabilities({}, "production").jobs).toBe("disabled");
  });

  it("is disabled with only one of the two Inngest keys set outside development", () => {
    const env: RawEnv = { INNGEST_EVENT_KEY: "evt_x" };
    expect(deriveCapabilities(env, "production").jobs).toBe("disabled");
  });
});

describe("deriveCapabilities — analytics and errors by presence", () => {
  it("analytics is posthog iff POSTHOG_KEY is set", () => {
    expect(deriveCapabilities({}, "production").analytics).toBe("disabled");
    expect(deriveCapabilities({ POSTHOG_KEY: "phc_x" }, "production").analytics).toBe("posthog");
  });

  it("errors is sentry iff SENTRY_DSN is set", () => {
    expect(deriveCapabilities({}, "production").errors).toBe("disabled");
    expect(
      deriveCapabilities({ SENTRY_DSN: "https://x@o0.ingest.sentry.io/0" }, "production").errors,
    ).toBe("sentry");
  });
});

describe("deriveCapabilities — table-driven sweep", () => {
  const modes: AppMode[] = ["development", "production", "test"];

  it("is a pure function: same inputs always produce the same output", () => {
    const env: RawEnv = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" };
    for (const mode of modes) {
      const first = deriveCapabilities(env, mode);
      const second = deriveCapabilities(env, mode);
      expect(second).toEqual(first);
    }
  });

  it("never mutates the input env object", () => {
    const env: RawEnv = { OPENROUTER_API_KEY: "sk-or-x" };
    const snapshot = { ...env };
    deriveCapabilities(env, "production");
    expect(env).toEqual(snapshot);
  });
});
