import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runFactoryInit } from "../scripts/factory-init";

let rootDir: string;

beforeEach(() => {
  // Never realpath rootDir (opt-23).
  rootDir = mkdtempSync(path.join(tmpdir(), "factory-init-test-"));
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string): void {
  const abs = path.join(rootDir, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

/** Full fake mini-repo: handoff with CLAUDE/AGENTS/2 skills, root with a factory-dev + shared skill. */
function buildFixture(): void {
  writeFile(
    ".factory/config.json",
    JSON.stringify({ stage: "prototype", template: true }, null, 2),
  );
  writeFile(".factory/handoff/CLAUDE.md", "# adopter CLAUDE.md\n");
  writeFile(".factory/handoff/AGENTS.md", "# adopter AGENTS.md\n");
  writeFile(".factory/handoff/LAUNCH.md", "## [ ] Seeded item\n");
  writeFile(".factory/handoff/skills/define-product/SKILL.md", "# define-product\n");
  writeFile(".factory/handoff/skills/brand-it/SKILL.md", "# brand-it\n");
  writeFile(".factory/handoff/agents/fab-smith.md", "# fab-smith\n");
  writeFile(".factory/handoff/agents/fab-muse.md", "# fab-muse\n");
  writeFile(".claude/agents/fab-forge.md", "# factory-dev only\n");
  writeFile(".claude/agents/fab-warden.md", "# fab-warden (shared)\n");
  writeFile(".claude/skills/fabulous-feature/SKILL.md", "# fabulous-feature (shared)\n");
  writeFile(".claude/skills/add-a-job/SKILL.md", "# add-a-job (shared)\n");
  writeFile(".claude/skills/add-integration-package/SKILL.md", "# factory-dev only\n");
  writeFile(".claude/skills/write-adr/SKILL.md", "# factory-dev only\n");
  writeFile("CLAUDE.md", "# factory-dev CLAUDE.md\n");
  writeFile("AGENTS.md", "# factory-dev AGENTS.md\n");
}

describe("runFactoryInit — full run", () => {
  it("promotes the repo to a product repo end-to-end", () => {
    buildFixture();

    const { ok, messages } = runFactoryInit(rootDir);
    expect(ok).toBe(true);
    expect(messages.length).toBeGreaterThan(0);

    // Root CLAUDE.md/AGENTS.md are now the adopter versions.
    expect(readFileSync(path.join(rootDir, "CLAUDE.md"), "utf8")).toBe("# adopter CLAUDE.md\n");
    expect(readFileSync(path.join(rootDir, "AGENTS.md"), "utf8")).toBe("# adopter AGENTS.md\n");

    // LAUNCH.md is promoted to root too (design spec §7).
    expect(readFileSync(path.join(rootDir, "LAUNCH.md"), "utf8")).toBe("## [ ] Seeded item\n");

    // Adopter skills installed.
    expect(existsSync(path.join(rootDir, ".claude/skills/define-product/SKILL.md"))).toBe(true);
    expect(existsSync(path.join(rootDir, ".claude/skills/brand-it/SKILL.md"))).toBe(true);

    // Factory-dev-only skills removed.
    expect(existsSync(path.join(rootDir, ".claude/skills/add-integration-package"))).toBe(false);
    expect(existsSync(path.join(rootDir, ".claude/skills/write-adr"))).toBe(false);

    // Shared skills survive untouched.
    expect(existsSync(path.join(rootDir, ".claude/skills/fabulous-feature/SKILL.md"))).toBe(true);
    expect(existsSync(path.join(rootDir, ".claude/skills/add-a-job/SKILL.md"))).toBe(true);

    // Adopter agents installed.
    expect(readFileSync(path.join(rootDir, ".claude/agents/fab-smith.md"), "utf8")).toBe(
      "# fab-smith\n",
    );
    expect(existsSync(path.join(rootDir, ".claude/agents/fab-muse.md"))).toBe(true);

    // Factory-dev-only agents removed; shared agents survive with content untouched.
    expect(existsSync(path.join(rootDir, ".claude/agents/fab-forge.md"))).toBe(false);
    expect(readFileSync(path.join(rootDir, ".claude/agents/fab-warden.md"), "utf8")).toBe(
      "# fab-warden (shared)\n",
    );

    // Handoff dir gone.
    expect(existsSync(path.join(rootDir, ".factory/handoff"))).toBe(false);

    // Config stage stays prototype, template flag dropped.
    const config = JSON.parse(readFileSync(path.join(rootDir, ".factory/config.json"), "utf8"));
    expect(config).toEqual({ stage: "prototype" });
  });

  it("a second run returns ok:false — already initialized", () => {
    buildFixture();
    runFactoryInit(rootDir);

    const second = runFactoryInit(rootDir);
    expect(second.ok).toBe(false);
    expect(second.messages.some((m) => m.includes("already initialized"))).toBe(true);
  });
});

describe("runFactoryInit — LAUNCH.md promotion is copy-if-absent", () => {
  it("copies handoff/LAUNCH.md → LAUNCH.md when root LAUNCH.md doesn't exist yet", () => {
    buildFixture();
    const { ok } = runFactoryInit(rootDir);
    expect(ok).toBe(true);
    expect(readFileSync(path.join(rootDir, "LAUNCH.md"), "utf8")).toBe("## [ ] Seeded item\n");
  });

  it("does NOT overwrite an existing root LAUNCH.md (simulating a re-run after partial completion)", () => {
    buildFixture();
    // Simulate an interrupted prior run: LAUNCH.md was already promoted and ticked, but
    // handoff/ is still present (e.g. the run crashed on a later step).
    writeFile("LAUNCH.md", "## [x] Seeded item\n");

    const { ok, messages } = runFactoryInit(rootDir);
    expect(ok).toBe(true);
    expect(readFileSync(path.join(rootDir, "LAUNCH.md"), "utf8")).toBe("## [x] Seeded item\n");
    expect(messages.some((m) => m.includes("LAUNCH.md already exists"))).toBe(true);
  });

  it("tolerates a missing handoff/LAUNCH.md source", () => {
    buildFixture();
    rmSync(path.join(rootDir, ".factory/handoff/LAUNCH.md"), { force: true });

    const { ok, messages } = runFactoryInit(rootDir);
    expect(ok).toBe(true);
    expect(messages.some((m) => m.includes("LAUNCH.md") && m.includes("not found"))).toBe(true);
    expect(existsSync(path.join(rootDir, "LAUNCH.md"))).toBe(false);
  });
});

describe("runFactoryInit — handoff absent", () => {
  it("returns ok:false without touching anything", () => {
    writeFile(".factory/config.json", JSON.stringify({ stage: "prototype" }, null, 2));
    writeFile("CLAUDE.md", "# untouched\n");

    const { ok, messages } = runFactoryInit(rootDir);
    expect(ok).toBe(false);
    expect(messages.some((m) => m.includes("already initialized"))).toBe(true);
    expect(readFileSync(path.join(rootDir, "CLAUDE.md"), "utf8")).toBe("# untouched\n");
  });
});

describe("runFactoryInit — partial-state re-run completes what remains", () => {
  it("finishes cleanly when handoff is still present but destination skills already exist (stale)", () => {
    buildFixture();
    // Simulate an interrupted prior run: destination skill dir already exists with stale
    // content, and a factory-dev skill is already gone.
    writeFile(".claude/skills/define-product/SKILL.md", "# stale define-product\n");
    rmSync(path.join(rootDir, ".claude/skills/add-integration-package"), {
      recursive: true,
      force: true,
    });

    const { ok } = runFactoryInit(rootDir);
    expect(ok).toBe(true);
    expect(readFileSync(path.join(rootDir, ".claude/skills/define-product/SKILL.md"), "utf8")).toBe(
      "# define-product\n",
    );
    expect(existsSync(path.join(rootDir, ".factory/handoff"))).toBe(false);
  });

  it("overwrites a stale destination agent with the handoff version", () => {
    buildFixture();
    writeFile(".claude/agents/fab-smith.md", "# stale fab-smith\n");

    const { ok } = runFactoryInit(rootDir);
    expect(ok).toBe(true);
    expect(readFileSync(path.join(rootDir, ".claude/agents/fab-smith.md"), "utf8")).toBe(
      "# fab-smith\n",
    );
  });

  it("tolerates a missing handoff/CLAUDE.md or AGENTS.md source", () => {
    buildFixture();
    rmSync(path.join(rootDir, ".factory/handoff/AGENTS.md"), { force: true });

    const { ok, messages } = runFactoryInit(rootDir);
    expect(ok).toBe(true);
    expect(messages.some((m) => m.includes("AGENTS.md") && m.includes("not found"))).toBe(true);
    // Root AGENTS.md is left as whatever it was before (factory-dev version), untouched.
    expect(readFileSync(path.join(rootDir, "AGENTS.md"), "utf8")).toBe("# factory-dev AGENTS.md\n");
  });
});

describe("runFactoryInit — agents promotion edge cases", () => {
  /**
   * Deliberately NOT `buildFixture()`: that fixture ships `.claude/agents/` already populated,
   * so it could never falsify "an adopter with no staged agents gets no empty directory".
   */
  function buildAgentlessFixture(): void {
    writeFile(".factory/config.json", JSON.stringify({ stage: "prototype", template: true }));
    writeFile(".factory/handoff/CLAUDE.md", "# adopter CLAUDE.md\n");
    writeFile(".factory/handoff/skills/define-product/SKILL.md", "# define-product\n");
  }

  it("creates no .claude/agents/ when nothing is staged", () => {
    buildAgentlessFixture();

    const { ok } = runFactoryInit(rootDir);
    expect(ok).toBe(true);
    expect(existsSync(path.join(rootDir, ".claude/agents"))).toBe(false);
  });

  it("copies only top-level .md files — other entries are skipped", () => {
    buildFixture();
    writeFile(".factory/handoff/agents/README.txt", "not an agent\n");
    writeFile(".factory/handoff/agents/nested/fab-nope.md", "# nested\n");

    const { ok } = runFactoryInit(rootDir);
    expect(ok).toBe(true);
    expect(existsSync(path.join(rootDir, ".claude/agents/README.txt"))).toBe(false);
    expect(existsSync(path.join(rootDir, ".claude/agents/nested"))).toBe(false);
    expect(existsSync(path.join(rootDir, ".claude/agents/fab-nope.md"))).toBe(false);
    // The real agents alongside them still landed.
    expect(existsSync(path.join(rootDir, ".claude/agents/fab-smith.md"))).toBe(true);
  });
});
