/**
 * Covers doctor.ts's exported pure helpers only (`enableWithHint`, `trustedProxiesWarning`)
 * — `main()` itself is guarded behind an `invokedDirectly` check (same idiom as
 * gen-env-example.ts) specifically so importing this module in a test never also runs its
 * real-env side effects (`readMergedEnv()`, console output). Nothing in this file spies on
 * `console.log` or imports `main`.
 */
import { describe, expect, it } from "vitest";

import { enableWithHint, trustedProxiesWarning } from "../scripts/doctor";
import { serviceHints } from "../src/env-docs";
import type { AppMode } from "../src/registry";

describe("enableWithHint", () => {
  it("billing: joins the allOf group with ' + ' (both Stripe keys required together)", () => {
    expect(enableWithHint(serviceHints("billing"))).toBe(
      "STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET",
    );
  });

  it("llm: renders every anyOf var as 'any of: A, B, C, D'", () => {
    expect(enableWithHint(serviceHints("llm"))).toBe(
      "any of: LLM_LOCAL_BASE_URL, OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY",
    );
  });

  it("email: renders a single allOf var as just its own name", () => {
    expect(enableWithHint(serviceHints("email"))).toBe("RESEND_API_KEY");
  });

  it("jobs: joins the allOf group, then appends the oneOf alternative with ', or '", () => {
    expect(enableWithHint(serviceHints("jobs"))).toBe(
      "INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY, or INNGEST_DEV",
    );
  });

  it("analytics: renders a single allOf var as just its own name", () => {
    expect(enableWithHint(serviceHints("analytics"))).toBe("POSTHOG_KEY");
  });

  it("errors: renders a single allOf var as just its own name", () => {
    expect(enableWithHint(serviceHints("errors"))).toBe("SENTRY_DSN");
  });
});

describe("trustedProxiesWarning", () => {
  const PRODUCTION: AppMode = "production";
  const DEVELOPMENT: AppMode = "development";
  const TEST: AppMode = "test";

  it("fires in production mode when TRUSTED_PROXIES is unset", () => {
    const hint = trustedProxiesWarning({}, PRODUCTION);
    expect(hint).toContain("TRUSTED_PROXIES is not set");
  });

  it("states what breaks in one plain sentence, matching the APP_URL warning's voice", () => {
    const hint = trustedProxiesWarning({}, PRODUCTION);
    expect(hint).toMatch(/^⚠ TRUSTED_PROXIES is not set — .+[^.]$/);
    expect(hint).not.toMatch(/may potentially|could possibly/i);
  });

  it("does not fire in production mode once TRUSTED_PROXIES is set", () => {
    expect(trustedProxiesWarning({ TRUSTED_PROXIES: "10.0.0.0/24" }, PRODUCTION)).toBeNull();
  });

  it("does not fire outside production mode, even when unset", () => {
    expect(trustedProxiesWarning({}, DEVELOPMENT)).toBeNull();
    expect(trustedProxiesWarning({}, TEST)).toBeNull();
  });
});
