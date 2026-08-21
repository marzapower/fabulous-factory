import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Golden-file style, per gen-env-example.test.ts's path.resolve(__dirname, ...) idiom.
// Spec §8.2's mirror-staleness check lives here, not in preflight (plan §J.12.5) — this
// runs inside `pnpm test`, so CI can actually go red on a stale pointer or an oversized
// instruction file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const POINTER_TARGET = "docs/agents/conventions.md";

function countLines(content: string): number {
  const trimmed = content.replace(/\n+$/, "");
  return trimmed === "" ? 0 : trimmed.split("\n").length;
}

describe("root CLAUDE.md / AGENTS.md — mirror staleness", () => {
  const claudePath = path.join(REPO_ROOT, "CLAUDE.md");
  const agentsPath = path.join(REPO_ROOT, "AGENTS.md");

  it("CLAUDE.md contains the literal pointer to docs/agents/conventions.md", () => {
    const content = readFileSync(claudePath, "utf8");
    expect(content).toContain(POINTER_TARGET);
  });

  it("AGENTS.md contains the literal pointer to docs/agents/conventions.md", () => {
    const content = readFileSync(agentsPath, "utf8");
    expect(content).toContain(POINTER_TARGET);
  });

  it("CLAUDE.md is under 60 lines", () => {
    const content = readFileSync(claudePath, "utf8");
    expect(countLines(content)).toBeLessThan(60);
  });

  it("AGENTS.md is 15 lines or fewer", () => {
    const content = readFileSync(agentsPath, "utf8");
    expect(countLines(content)).toBeLessThanOrEqual(15);
  });
});

// Skip-clean when .factory/handoff/ doesn't exist yet (e.g. right after `factory:init`, or
// before Worker C's handoff content has landed) — same assertions apply to the adopter
// copies while the handoff dir is present.
const handoffDir = path.join(REPO_ROOT, ".factory", "handoff");
const handoffExists = existsSync(handoffDir);
const describeHandoff = handoffExists ? describe : describe.skip;

describeHandoff("handoff CLAUDE.md / AGENTS.md — mirror staleness", () => {
  const claudePath = path.join(handoffDir, "CLAUDE.md");
  const agentsPath = path.join(handoffDir, "AGENTS.md");

  it("handoff/CLAUDE.md contains the literal pointer to docs/agents/conventions.md", () => {
    const content = readFileSync(claudePath, "utf8");
    expect(content).toContain(POINTER_TARGET);
  });

  it("handoff/AGENTS.md contains the literal pointer to docs/agents/conventions.md", () => {
    const content = readFileSync(agentsPath, "utf8");
    expect(content).toContain(POINTER_TARGET);
  });

  it("handoff/CLAUDE.md is under 60 lines", () => {
    const content = readFileSync(claudePath, "utf8");
    expect(countLines(content)).toBeLessThan(60);
  });

  it("handoff/AGENTS.md is 15 lines or fewer", () => {
    const content = readFileSync(agentsPath, "utf8");
    expect(countLines(content)).toBeLessThanOrEqual(15);
  });
});
