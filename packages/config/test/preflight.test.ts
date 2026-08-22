import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { evaluatePreflight } from "../scripts/preflight";

let rootDir: string;

beforeEach(() => {
  // Never realpath rootDir (opt-23).
  rootDir = mkdtempSync(path.join(tmpdir(), "preflight-test-"));
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string): void {
  const abs = path.join(rootDir, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

function writeConfig(config: unknown): void {
  writeFile(".factory/config.json", JSON.stringify(config, null, 2));
}

function writePointerFiles(includePointer: boolean): void {
  const content = includePointer
    ? "Canonical conventions: docs/agents/conventions.md\n"
    : "no pointer here\n";
  writeFile("CLAUDE.md", content);
  writeFile("AGENTS.md", content);
}

describe("evaluatePreflight — prototype stage", () => {
  it("reports a test Stripe key as advisory only", () => {
    writeConfig({ stage: "prototype" });
    writePointerFiles(true);

    const { failures, warnings } = evaluatePreflight(rootDir, {
      STRIPE_SECRET_KEY: "sk_test_abc123",
    });
    expect(failures).toEqual([]);
    expect(warnings.some((w) => w.includes("sk_test_"))).toBe(true);
  });

  it("warns (does not fail) on a missing pointer string", () => {
    writeConfig({ stage: "prototype" });
    writePointerFiles(false);

    const { failures, warnings } = evaluatePreflight(rootDir, {});
    expect(failures).toEqual([]);
    expect(warnings.some((w) => w.includes("CLAUDE.md"))).toBe(true);
    expect(warnings.some((w) => w.includes("AGENTS.md"))).toBe(true);
  });

  it("never fails, given a test Stripe key", () => {
    writeConfig({ stage: "prototype" });
    writePointerFiles(true);

    const { failures, warnings } = evaluatePreflight(rootDir, {
      STRIPE_SECRET_KEY: "sk_test_abc123",
    });
    expect(failures).toEqual([]);
    expect(warnings.some((w) => w.includes("would block production"))).toBe(true);
  });
});

describe("evaluatePreflight — production stage", () => {
  it("fails on a Stripe key that starts with sk_test_", () => {
    writeConfig({ stage: "production" });
    writePointerFiles(true);

    const { failures } = evaluatePreflight(rootDir, { STRIPE_SECRET_KEY: "sk_test_abc123" });
    expect(failures.some((f) => f.includes("sk_test_"))).toBe(true);
  });

  it("skips the Stripe key check when unset", () => {
    writeConfig({ stage: "production" });
    writePointerFiles(true);

    const { failures } = evaluatePreflight(rootDir, {});
    expect(failures.some((f) => f.includes("STRIPE_SECRET_KEY"))).toBe(false);
  });

  it("does not fail on a live-looking Stripe key", () => {
    writeConfig({ stage: "production" });
    writePointerFiles(true);

    const { failures } = evaluatePreflight(rootDir, { STRIPE_SECRET_KEY: "sk_live_abc123" });
    expect(failures.some((f) => f.includes("STRIPE_SECRET_KEY"))).toBe(false);
  });

  it("fails on a missing pointer string (blocking in production)", () => {
    writeConfig({ stage: "production" });
    writePointerFiles(false);

    const { failures } = evaluatePreflight(rootDir, {});
    expect(failures.some((f) => f.includes("CLAUDE.md"))).toBe(true);
    expect(failures.some((f) => f.includes("AGENTS.md"))).toBe(true);
  });
});

describe("evaluatePreflight — non-blocking warnings at both stages", () => {
  it("warns when the email capability is disabled (no RESEND_API_KEY)", () => {
    writeConfig({ stage: "prototype" });
    writePointerFiles(true);

    const { warnings } = evaluatePreflight(rootDir, {});
    expect(warnings.some((w) => w.includes("email"))).toBe(true);
  });

  it("does not warn about email when RESEND_API_KEY is set", () => {
    writeConfig({ stage: "prototype" });
    writePointerFiles(true);

    const { warnings } = evaluatePreflight(rootDir, { RESEND_API_KEY: "re_abc123" });
    expect(warnings.some((w) => w.includes("email"))).toBe(false);
  });
});
