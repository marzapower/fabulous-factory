import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  countDone,
  countOpenBlockers,
  loadLaunchChecklist,
  parseLaunchChecklist,
} from "../scripts/launch-checklist";

let rootDir: string;

beforeEach(() => {
  // Never realpath rootDir (opt-23) — macOS `/tmp` is a symlink to `/private/tmp`.
  rootDir = mkdtempSync(path.join(tmpdir(), "launch-checklist-test-"));
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

function writeLaunchFile(content: string): void {
  writeFileSync(path.join(rootDir, "LAUNCH.md"), content, "utf8");
}

describe("parseLaunchChecklist — tick states", () => {
  it("parses an open item ([ ]) as not done", () => {
    const items = parseLaunchChecklist("## [ ] Some item\n");
    expect(items).toHaveLength(1);
    expect(items[0].done).toBe(false);
  });

  it("parses a lowercase-x item ([x]) as done", () => {
    const items = parseLaunchChecklist("## [x] Some item\n");
    expect(items[0].done).toBe(true);
  });

  it("parses an uppercase-X item ([X]) as done", () => {
    const items = parseLaunchChecklist("## [X] Some item\n");
    expect(items[0].done).toBe(true);
  });
});

describe("parseLaunchChecklist — marker detection and title stripping", () => {
  it("detects both markers in the documented order (🔒 then blocks launch) with a clean separator", () => {
    const items = parseLaunchChecklist(
      "## [ ] Product definition · 🔒 human sign-off · blocks launch\n",
    );
    expect(items[0].title).toBe("Product definition");
    expect(items[0].humanSignoff).toBe(true);
    expect(items[0].blocksLaunch).toBe(true);
  });

  it("detects both markers in the reverse order (blocks launch then 🔒) with a clean separator", () => {
    const items = parseLaunchChecklist(
      "## [ ] Product definition · blocks launch · 🔒 human sign-off\n",
    );
    expect(items[0].title).toBe("Product definition");
    expect(items[0].humanSignoff).toBe(true);
    expect(items[0].blocksLaunch).toBe(true);
  });

  it("detects a single blocks-launch marker alone, title stripped cleanly", () => {
    const items = parseLaunchChecklist("## [ ] App identity · blocks launch\n");
    expect(items[0].title).toBe("App identity");
    expect(items[0].blocksLaunch).toBe(true);
    expect(items[0].humanSignoff).toBe(false);
  });

  it("detects a single human-signoff marker alone, title stripped cleanly", () => {
    const items = parseLaunchChecklist("## [ ] Plans catalog · 🔒 human sign-off\n");
    expect(items[0].title).toBe("Plans catalog");
    expect(items[0].humanSignoff).toBe(true);
    expect(items[0].blocksLaunch).toBe(false);
  });

  it("plain item with neither marker keeps its full title untouched", () => {
    const items = parseLaunchChecklist("## [ ] Design system\n");
    expect(items[0].title).toBe("Design system");
    expect(items[0].humanSignoff).toBe(false);
    expect(items[0].blocksLaunch).toBe(false);
  });

  it("missing separator: detection still works via substring, but the pinned mechanical stripping algorithm drops the fused segment (accepted loss, spec §3.1)", () => {
    // Exactly the §3.2 template example: no ` · ` between the title and the 🔒 marker.
    const items = parseLaunchChecklist("## [ ] Legal pages 🔒 human sign-off · blocks launch\n");
    expect(items[0].humanSignoff).toBe(true);
    expect(items[0].blocksLaunch).toBe(true);
    // The whole "Legal pages 🔒 human sign-off" segment contains the 🔒 marker, so the
    // deterministic split/filter/rejoin algorithm drops it along with the "blocks launch"
    // segment — the resulting title is empty, not "Legal pages".
    expect(items[0].title).toBe("");
  });
});

describe("parseLaunchChecklist — skill extraction", () => {
  it("extracts the skill name from a **Skill:** line within the item's section", () => {
    const items = parseLaunchChecklist(
      ["## [ ] Legal pages", "", "**Why:** placeholder copy", "**Skill:** make-it-yours", ""].join(
        "\n",
      ),
    );
    expect(items[0].skill).toBe("make-it-yours");
  });

  it("is null when no **Skill:** line is present", () => {
    const items = parseLaunchChecklist(
      ["## [ ] Legal pages", "", "**Why:** placeholder copy", ""].join("\n"),
    );
    expect(items[0].skill).toBeNull();
  });

  it("never parses a **Signed off:** line as a skill", () => {
    const items = parseLaunchChecklist(
      ["## [ ] Legal pages", "**Signed off:** _(date + who)_", ""].join("\n"),
    );
    expect(items[0].skill).toBeNull();
  });
});

describe("parseLaunchChecklist — section boundaries", () => {
  it("a ### sub-heading does not terminate the item's section", () => {
    const items = parseLaunchChecklist(
      [
        "## [ ] Legal pages",
        "",
        "### Done means",
        "- Terms name the real legal entity",
        "",
        "**Skill:** make-it-yours",
        "",
        "## [ ] Next item",
      ].join("\n"),
    );
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Legal pages");
    expect(items[0].skill).toBe("make-it-yours");
  });

  it("stops the section at the next level-2 heading, even a non-item one", () => {
    const items = parseLaunchChecklist(
      [
        "## [ ] Legal pages",
        "**Skill:** make-it-yours",
        "## Not an item",
        "**Skill:** should-not-count",
      ].join("\n"),
    );
    expect(items).toHaveLength(1);
    expect(items[0].skill).toBe("make-it-yours");
  });
});

describe("parseLaunchChecklist — malformed/non-item content", () => {
  it("ignores prose and non-item headings entirely", () => {
    const items = parseLaunchChecklist(
      ["# Launch checklist", "", "Some intro prose.", "", "## Not an item at all", ""].join("\n"),
    );
    expect(items).toEqual([]);
  });

  it("ignores a malformed item heading (bad checkbox character)", () => {
    const items = parseLaunchChecklist("## [?] Not a valid tick state\n");
    expect(items).toEqual([]);
  });

  it("counts adopter-added custom items alongside the seeded ones", () => {
    const items = parseLaunchChecklist(
      ["## [ ] Seeded item", "## [ ] Custom adopter item · blocks launch"].join("\n"),
    );
    expect(items).toHaveLength(2);
    expect(items[1].title).toBe("Custom adopter item");
    expect(items[1].blocksLaunch).toBe(true);
  });
});

describe("loadLaunchChecklist — file-based helper", () => {
  it("returns [] when LAUNCH.md is missing, never throws", () => {
    expect(loadLaunchChecklist(rootDir)).toEqual([]);
  });

  it("reads and parses LAUNCH.md at rootDir", () => {
    writeLaunchFile("## [x] Done item\n## [ ] Open item · blocks launch\n");
    const items = loadLaunchChecklist(rootDir);
    expect(items).toHaveLength(2);
    expect(items[0].done).toBe(true);
    expect(items[1].blocksLaunch).toBe(true);
  });
});

describe("countDone / countOpenBlockers", () => {
  it("counts done items and open blocking items independently", () => {
    const items = parseLaunchChecklist(
      [
        "## [x] Item one",
        "## [ ] Item two · blocks launch",
        "## [x] Item three · blocks launch",
        "## [ ] Item four",
      ].join("\n"),
    );
    expect(countDone(items)).toBe(2);
    expect(countOpenBlockers(items)).toBe(1);
  });
});
