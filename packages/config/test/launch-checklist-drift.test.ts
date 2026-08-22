import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseLaunchChecklist } from "../scripts/launch-checklist";

/**
 * Drift test (design spec §5/§9): the composed demo output — `payload/LAUNCH.md` with the
 * `<!-- preset:items -->` marker replaced by `presets/demo/overlay/launch-items.md`'s
 * fragment, exactly as `packages/create`'s compose engine will do at publish time (M3) —
 * must parse to exactly the 9 seeded items, with the markers/skill pinned by the spec table.
 * Guards the seeded list only — anything else (whether a shipped default still matches its
 * checklist item) is an accepted loss of the hash-ledger replacement (spec §2).
 *
 * `payload/` and `presets/` are permanent parts of the factory tree (unlike the old
 * `.factory/handoff/`), so there is no skip-guard here.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const PAYLOAD_LAUNCH_PATH = path.join(REPO_ROOT, "payload", "LAUNCH.md");
const DEMO_OVERLAY_ITEMS_PATH = path.join(
  REPO_ROOT,
  "presets",
  "demo",
  "overlay",
  "launch-items.md",
);

const PRESET_ITEMS_MARKER = "<!-- preset:items -->";

interface SeededItem {
  title: string;
  humanSignoff: boolean;
  blocksLaunch: boolean;
  skill: string;
}

/** Pinned order of the composed demo output — the fragment inserts at the marker's position. */
const SEEDED_ITEMS: SeededItem[] = [
  { title: "Product definition", humanSignoff: true, blocksLaunch: true, skill: "define-product" },
  { title: "App identity", humanSignoff: false, blocksLaunch: true, skill: "brand-it" },
  { title: "Design system", humanSignoff: false, blocksLaunch: false, skill: "brand-it" },
  { title: "Demo logic", humanSignoff: false, blocksLaunch: true, skill: "make-it-yours" },
  { title: "Template showcase", humanSignoff: false, blocksLaunch: true, skill: "make-it-yours" },
  { title: "Legal pages", humanSignoff: true, blocksLaunch: true, skill: "make-it-yours" },
  { title: "Email templates", humanSignoff: false, blocksLaunch: false, skill: "brand-it" },
  { title: "Plans catalog", humanSignoff: true, blocksLaunch: false, skill: "enable-billing" },
  { title: "README", humanSignoff: false, blocksLaunch: false, skill: "make-it-yours" },
];

/** Mirrors the merge rule compose will implement (spec §5): a literal marker-line swap. */
function composeLaunchChecklist(payload: string, overlayFragment: string): string {
  expect(payload).toContain(PRESET_ITEMS_MARKER);
  return payload.replace(PRESET_ITEMS_MARKER, overlayFragment.trim());
}

describe("LAUNCH.md seeded items — drift guard", () => {
  it("payload/LAUNCH.md and presets/demo/overlay/launch-items.md both exist", () => {
    expect(() => readFileSync(PAYLOAD_LAUNCH_PATH, "utf8")).not.toThrow();
    expect(() => readFileSync(DEMO_OVERLAY_ITEMS_PATH, "utf8")).not.toThrow();
  });

  it("parses to exactly the 9 seeded items", () => {
    const payload = readFileSync(PAYLOAD_LAUNCH_PATH, "utf8");
    const overlay = readFileSync(DEMO_OVERLAY_ITEMS_PATH, "utf8");
    const items = parseLaunchChecklist(composeLaunchChecklist(payload, overlay));
    expect(items).toHaveLength(SEEDED_ITEMS.length);
  });

  it("preserves the pinned order", () => {
    const payload = readFileSync(PAYLOAD_LAUNCH_PATH, "utf8");
    const overlay = readFileSync(DEMO_OVERLAY_ITEMS_PATH, "utf8");
    const items = parseLaunchChecklist(composeLaunchChecklist(payload, overlay));
    expect(items.map((item) => item.title)).toEqual(SEEDED_ITEMS.map((item) => item.title));
  });

  for (const seeded of SEEDED_ITEMS) {
    it(`'${seeded.title}' carries the pinned markers and skill`, () => {
      const payload = readFileSync(PAYLOAD_LAUNCH_PATH, "utf8");
      const overlay = readFileSync(DEMO_OVERLAY_ITEMS_PATH, "utf8");
      const items = parseLaunchChecklist(composeLaunchChecklist(payload, overlay));
      const found = items.find((item) => item.title === seeded.title);
      expect(found, `expected an item titled '${seeded.title}'`).toBeDefined();
      expect(found?.done).toBe(false);
      expect(found?.humanSignoff).toBe(seeded.humanSignoff);
      expect(found?.blocksLaunch).toBe(seeded.blocksLaunch);
      expect(found?.skill).toBe(seeded.skill);
    });
  }
});
