import { createHash } from "node:crypto";
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

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function writeConfig(config: unknown): void {
  writeFile(".factory/config.json", JSON.stringify(config, null, 2));
}

/** A one-item manifest whose file is either untouched (factory-default) or edited. */
function writeManifest(opts: { blocksProduction: boolean; factoryDefault: boolean }): void {
  writeFile("demo.txt", opts.factoryDefault ? "shipped" : "edited by adopter");
  writeFile(
    ".factory/manifest.json",
    JSON.stringify(
      {
        comment: "test manifest",
        items: [
          {
            id: "demo",
            title: "Demo",
            why: "why",
            skill: "make-it-yours",
            blocksProduction: opts.blocksProduction,
            files: [{ path: "demo.txt", hash: sha256("shipped") }],
          },
        ],
      },
      null,
      2,
    ),
  );
}

function writePointerFiles(includePointer: boolean): void {
  const content = includePointer
    ? "Canonical conventions: docs/agents/conventions.md\n"
    : "no pointer here\n";
  writeFile("CLAUDE.md", content);
  writeFile("AGENTS.md", content);
}

describe("evaluatePreflight — prototype stage", () => {
  it("never fails, even with a blocksProduction item still factory-default", () => {
    writeConfig({ stage: "prototype" });
    writeManifest({ blocksProduction: true, factoryDefault: true });
    writePointerFiles(true);

    const { failures, warnings } = evaluatePreflight(rootDir, {});
    expect(failures).toEqual([]);
    expect(warnings.some((w) => w.includes("would block production"))).toBe(true);
  });

  it("reports handoff presence and a test Stripe key as advisory only", () => {
    writeConfig({ stage: "prototype" });
    writeManifest({ blocksProduction: false, factoryDefault: false });
    writePointerFiles(true);
    mkdirSync(path.join(rootDir, ".factory", "handoff"), { recursive: true });

    const { failures, warnings } = evaluatePreflight(rootDir, {
      STRIPE_SECRET_KEY: "sk_test_abc123",
    });
    expect(failures).toEqual([]);
    expect(warnings.some((w) => w.includes(".factory/handoff"))).toBe(true);
    expect(warnings.some((w) => w.includes("sk_test_"))).toBe(true);
  });

  it("warns (does not fail) on a missing pointer string", () => {
    writeConfig({ stage: "prototype" });
    writeManifest({ blocksProduction: false, factoryDefault: true });
    writePointerFiles(false);

    const { failures, warnings } = evaluatePreflight(rootDir, {});
    expect(failures).toEqual([]);
    expect(warnings.some((w) => w.includes("CLAUDE.md"))).toBe(true);
    expect(warnings.some((w) => w.includes("AGENTS.md"))).toBe(true);
  });
});

describe("evaluatePreflight — production stage", () => {
  it("fails when a blocksProduction item is still factory-default", () => {
    writeConfig({ stage: "production" });
    writeManifest({ blocksProduction: true, factoryDefault: true });
    writePointerFiles(true);

    const { failures } = evaluatePreflight(rootDir, {});
    expect(failures.some((f) => f.includes("demo"))).toBe(true);
  });

  it("does not fail on a non-blocksProduction item left factory-default", () => {
    writeConfig({ stage: "production" });
    writeManifest({ blocksProduction: false, factoryDefault: true });
    writePointerFiles(true);

    const { failures } = evaluatePreflight(rootDir, {});
    expect(failures).toEqual([]);
  });

  it("fails when .factory/handoff/ is present", () => {
    writeConfig({ stage: "production" });
    writeManifest({ blocksProduction: false, factoryDefault: false });
    writePointerFiles(true);
    mkdirSync(path.join(rootDir, ".factory", "handoff"), { recursive: true });

    const { failures } = evaluatePreflight(rootDir, {});
    expect(failures.some((f) => f.includes(".factory/handoff"))).toBe(true);
  });

  it("FACTORY_DEV=1 does NOT suppress the handoff blocker (§J.12.13)", () => {
    writeConfig({ stage: "production" });
    writeManifest({ blocksProduction: false, factoryDefault: false });
    writePointerFiles(true);
    mkdirSync(path.join(rootDir, ".factory", "handoff"), { recursive: true });

    const { failures } = evaluatePreflight(rootDir, { FACTORY_DEV: "1" });
    expect(failures.some((f) => f.includes(".factory/handoff"))).toBe(true);
  });

  it("fails on a Stripe key that starts with sk_test_", () => {
    writeConfig({ stage: "production" });
    writeManifest({ blocksProduction: false, factoryDefault: false });
    writePointerFiles(true);

    const { failures } = evaluatePreflight(rootDir, { STRIPE_SECRET_KEY: "sk_test_abc123" });
    expect(failures.some((f) => f.includes("sk_test_"))).toBe(true);
  });

  it("skips the Stripe key check when unset", () => {
    writeConfig({ stage: "production" });
    writeManifest({ blocksProduction: false, factoryDefault: false });
    writePointerFiles(true);

    const { failures } = evaluatePreflight(rootDir, {});
    expect(failures.some((f) => f.includes("STRIPE_SECRET_KEY"))).toBe(false);
  });

  it("does not fail on a live-looking Stripe key", () => {
    writeConfig({ stage: "production" });
    writeManifest({ blocksProduction: false, factoryDefault: false });
    writePointerFiles(true);

    const { failures } = evaluatePreflight(rootDir, { STRIPE_SECRET_KEY: "sk_live_abc123" });
    expect(failures.some((f) => f.includes("STRIPE_SECRET_KEY"))).toBe(false);
  });

  it("fails on a missing pointer string (blocking in production)", () => {
    writeConfig({ stage: "production" });
    writeManifest({ blocksProduction: false, factoryDefault: false });
    writePointerFiles(false);

    const { failures } = evaluatePreflight(rootDir, {});
    expect(failures.some((f) => f.includes("CLAUDE.md"))).toBe(true);
    expect(failures.some((f) => f.includes("AGENTS.md"))).toBe(true);
  });
});

describe("evaluatePreflight — non-blocking warnings at both stages", () => {
  it("warns when the email capability is disabled (no RESEND_API_KEY)", () => {
    writeConfig({ stage: "prototype" });
    writeManifest({ blocksProduction: false, factoryDefault: false });
    writePointerFiles(true);

    const { warnings } = evaluatePreflight(rootDir, {});
    expect(warnings.some((w) => w.includes("email"))).toBe(true);
  });

  it("does not warn about email when RESEND_API_KEY is set", () => {
    writeConfig({ stage: "prototype" });
    writeManifest({ blocksProduction: false, factoryDefault: false });
    writePointerFiles(true);

    const { warnings } = evaluatePreflight(rootDir, { RESEND_API_KEY: "re_abc123" });
    expect(warnings.some((w) => w.includes("email"))).toBe(false);
  });
});

describe("evaluatePreflight — missing/corrupt manifest", () => {
  it("never fails on a missing manifest", () => {
    // The manifest-missing sentence itself is printed once, by the CLI's own
    // ledgerReportSafe() call in main() — evaluatePreflight no longer duplicates it as a
    // warning (review finding 10).
    writeConfig({ stage: "production" });
    writePointerFiles(true);

    const { failures } = evaluatePreflight(rootDir, {});
    expect(failures).toEqual([]);
  });

  it("still runs the handoff/stripe/pointer checks when the manifest is missing", () => {
    writeConfig({ stage: "production" });
    writePointerFiles(false);
    mkdirSync(path.join(rootDir, ".factory", "handoff"), { recursive: true });

    const { failures } = evaluatePreflight(rootDir, { STRIPE_SECRET_KEY: "sk_test_x" });
    expect(failures.some((f) => f.includes(".factory/handoff"))).toBe(true);
    expect(failures.some((f) => f.includes("sk_test_"))).toBe(true);
    expect(failures.some((f) => f.includes("CLAUDE.md"))).toBe(true);
  });
});
