/**
 * Covers doctor.ts's exported pure helpers only (`enableWithHint`, `trustedProxiesWarning`,
 * `printI18nSection`) — `main()` itself is guarded behind an `invokedDirectly` check (same
 * idiom as gen-env-example.ts) specifically so importing this module in a test never also
 * runs its real-env side effects (`readMergedEnv()`, console output). Nothing in this file
 * spies on `console.log` or imports `main`, except `printI18nSection`'s own describe block
 * below, which spies only on that one function's output (i18n plan §2.6).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enableWithHint, printI18nSection, trustedProxiesWarning } from "../scripts/doctor";
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

describe("printI18nSection", () => {
  let repoRoot: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(tmpdir(), "doctor-i18n-test-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function writeMessages(relDir: string, ...locales: string[]): void {
    const dir = path.join(repoRoot, relDir);
    mkdirSync(dir, { recursive: true });
    for (const locale of locales) {
      writeFileSync(path.join(dir, `${locale}.json`), "{}\n", "utf8");
    }
  }

  function loggedLines(): string[] {
    return logSpy.mock.calls.map((call: unknown[]) => String(call[0]));
  }

  it("reports no catalogs found when neither packages/ui nor any app ships messages/", () => {
    printI18nSection(repoRoot);
    expect(loggedLines()).toContain("    no messages/ catalogs found on disk");
  });

  it("reports the union of locales and both catalogs when packages/ui and an app both ship messages/", () => {
    writeMessages("packages/ui/messages", "en", "it");
    writeMessages("apps/web/messages", "en");
    mkdirSync(path.join(repoRoot, "apps/web"), { recursive: true });

    printI18nSection(repoRoot);

    expect(loggedLines()).toContain("    en, it (catalogs: ui, app)");
  });

  it("reports only the ui catalog when no app ships its own messages/", () => {
    writeMessages("packages/ui/messages", "en", "it");

    printI18nSection(repoRoot);

    expect(loggedLines()).toContain("    en, it (catalogs: ui)");
  });

  it("unions locales across multiple apps and sorts en first", () => {
    writeMessages("apps/untangle/messages", "en");
    writeMessages("apps/nothing/messages", "en", "it");

    printI18nSection(repoRoot);

    expect(loggedLines()).toContain("    en, it (catalogs: app)");
  });

  it("degrades quietly (no throw) when apps/ doesn't exist at all", () => {
    expect(() => printI18nSection(repoRoot)).not.toThrow();
    expect(loggedLines()).toContain("    no messages/ catalogs found on disk");
  });
});
