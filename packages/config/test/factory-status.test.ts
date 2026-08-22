import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderFactoryStatus } from "../scripts/factory-status";

let rootDir: string;

beforeEach(() => {
  // Never realpath rootDir (opt-23).
  rootDir = mkdtempSync(path.join(tmpdir(), "factory-status-test-"));
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string): void {
  const abs = path.join(rootDir, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

function writeConfig(stage: "prototype" | "production"): void {
  writeFile(".factory/config.json", JSON.stringify({ stage }, null, 2));
}

describe("renderFactoryStatus — stage line always present", () => {
  it("prints the stage line first even with no config.json (defaults to prototype)", () => {
    const lines = renderFactoryStatus(rootDir);
    expect(lines[0]).toBe("stage: prototype");
  });

  it("reflects a production stage", () => {
    writeConfig("production");
    const lines = renderFactoryStatus(rootDir);
    expect(lines[0]).toBe("stage: production");
  });
});

describe("renderFactoryStatus — missing LAUNCH.md", () => {
  it("reports 'no LAUNCH.md found' unconditionally", () => {
    writeConfig("prototype");
    const lines = renderFactoryStatus(rootDir);
    expect(lines).toContain("no LAUNCH.md found — nothing to report");
  });
});

describe("renderFactoryStatus — LAUNCH.md item lines", () => {
  it("renders a done item with a checkmark and no suffixes", () => {
    writeConfig("prototype");
    writeFile("LAUNCH.md", "## [x] README\n");
    const lines = renderFactoryStatus(rootDir);
    expect(lines).toContain("✓ README");
  });

  it("renders an open item with a circle glyph", () => {
    writeConfig("prototype");
    writeFile("LAUNCH.md", "## [ ] README\n");
    const lines = renderFactoryStatus(rootDir);
    expect(lines).toContain("○ README");
  });

  it("appends ' — blocks launch' for an open blocking item", () => {
    writeConfig("prototype");
    writeFile("LAUNCH.md", "## [ ] App identity · blocks launch\n");
    const lines = renderFactoryStatus(rootDir);
    expect(lines).toContain("○ App identity — blocks launch");
  });

  it("appends ' → skill: <skill>' when a skill is present", () => {
    writeConfig("prototype");
    writeFile(
      "LAUNCH.md",
      ["## [ ] Legal pages · blocks launch", "", "**Skill:** make-it-yours", ""].join("\n"),
    );
    const lines = renderFactoryStatus(rootDir);
    expect(lines).toContain("○ Legal pages — blocks launch → skill: make-it-yours");
  });

  it("appends the 🔒 glyph on human-signoff items, open or done", () => {
    writeConfig("prototype");
    writeFile(
      "LAUNCH.md",
      [
        "## [ ] Plans catalog · 🔒 human sign-off",
        "## [x] Product definition · 🔒 human sign-off",
      ].join("\n"),
    );
    const lines = renderFactoryStatus(rootDir);
    expect(lines).toContain("○ Plans catalog 🔒");
    expect(lines).toContain("✓ Product definition 🔒");
  });
});

describe("renderFactoryStatus — summary math", () => {
  it("computes done/total and open-blocker counts", () => {
    writeConfig("prototype");
    writeFile(
      "LAUNCH.md",
      [
        "## [x] Item one",
        "## [ ] Item two · blocks launch",
        "## [x] Item three · blocks launch",
        "## [ ] Item four",
      ].join("\n"),
    );
    const lines = renderFactoryStatus(rootDir);
    expect(lines.at(-1)).toBe("2/4 done · 1 launch blocker(s) open");
  });

  it("reports 0/0 done for an empty checklist file", () => {
    writeConfig("prototype");
    writeFile("LAUNCH.md", "# Launch checklist\n\nSome prose, no items yet.\n");
    const lines = renderFactoryStatus(rootDir);
    expect(lines.at(-1)).toBe("0/0 done · 0 launch blocker(s) open");
  });
});
