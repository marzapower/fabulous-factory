import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseLaunchChecklist } from "../scripts/launch-checklist";

/**
 * Template-repo drift test (design spec §3.4/§8): the staged `.factory/handoff/LAUNCH.md`
 * must parse to exactly the 9 seeded items, with the markers/skill pinned by the spec table.
 * Guards the seeded list only — anything else (whether a shipped default still matches its
 * checklist item) is an accepted loss of the hash-ledger replacement (spec §2).
 *
 * Skip-clean once `.factory/handoff/` is gone (i.e. in an adopted product repo, after
 * `pnpm factory:init` promotes LAUNCH.md to the repo root and deletes the handoff dir) —
 * same pattern as factory-docs.test.ts and factory-agents.test.ts. While the handoff dir
 * is present (this template repo), the suite still fails loudly if LAUNCH.md itself is
 * missing — it is not skipped just because the file hasn't landed yet.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const HANDOFF_DIR = path.join(REPO_ROOT, ".factory", "handoff");
const LAUNCH_PATH = path.join(HANDOFF_DIR, "LAUNCH.md");

interface SeededItem {
  title: string;
  humanSignoff: boolean;
  blocksLaunch: boolean;
  skill: string;
}

const SEEDED_ITEMS: SeededItem[] = [
  { title: "Product definition", humanSignoff: true, blocksLaunch: true, skill: "define-product" },
  { title: "App identity", humanSignoff: false, blocksLaunch: true, skill: "brand-it" },
  { title: "Design system", humanSignoff: false, blocksLaunch: false, skill: "brand-it" },
  { title: "Demo logic", humanSignoff: false, blocksLaunch: true, skill: "make-it-yours" },
  { title: "Legal pages", humanSignoff: true, blocksLaunch: true, skill: "make-it-yours" },
  { title: "Email templates", humanSignoff: false, blocksLaunch: false, skill: "brand-it" },
  { title: "Plans catalog", humanSignoff: true, blocksLaunch: false, skill: "enable-billing" },
  { title: "Template showcase", humanSignoff: false, blocksLaunch: true, skill: "make-it-yours" },
  { title: "README", humanSignoff: false, blocksLaunch: false, skill: "make-it-yours" },
];

const describeDrift = existsSync(HANDOFF_DIR) ? describe : describe.skip;

describeDrift("LAUNCH.md seeded items — drift guard", () => {
  it(".factory/handoff/LAUNCH.md exists", () => {
    expect(existsSync(LAUNCH_PATH)).toBe(true);
  });

  it("parses to exactly the 9 seeded items", () => {
    const content = readFileSync(LAUNCH_PATH, "utf8");
    const items = parseLaunchChecklist(content);
    expect(items).toHaveLength(SEEDED_ITEMS.length);
  });

  for (const seeded of SEEDED_ITEMS) {
    it(`'${seeded.title}' carries the pinned markers and skill`, () => {
      const content = readFileSync(LAUNCH_PATH, "utf8");
      const items = parseLaunchChecklist(content);
      const found = items.find((item) => item.title === seeded.title);
      expect(found, `expected an item titled '${seeded.title}'`).toBeDefined();
      expect(found?.done).toBe(false);
      expect(found?.humanSignoff).toBe(seeded.humanSignoff);
      expect(found?.blocksLaunch).toBe(seeded.blocksLaunch);
      expect(found?.skill).toBe(seeded.skill);
    });
  }
});
