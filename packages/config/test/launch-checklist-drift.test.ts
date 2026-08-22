import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseLaunchChecklist } from "../scripts/launch-checklist";

/**
 * Drift test (design spec §5/§9): the composed output for each "available" preset —
 * `payload/LAUNCH.md` with the `<!-- preset:items -->` marker replaced by
 * `presets/<preset>/overlay/launch-items.md`'s fragment, exactly as `packages/create`'s
 * compose engine will do at publish time (M3) — must parse to exactly that preset's
 * seeded items, with the markers/skill pinned by the spec table. Guards the seeded list
 * only — anything else (whether a shipped default still matches its checklist item) is
 * an accepted loss of the hash-ledger replacement (spec §2).
 *
 * The 7 generic (shape-independent) items are factored out once and shared across every
 * preset via `describe.each`; only the preset-specific overlay fragment differs.
 *
 * `payload/` and `presets/` are permanent parts of the factory tree (unlike the old
 * `.factory/handoff/`), so there is no skip-guard here.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const PAYLOAD_LAUNCH_PATH = path.join(REPO_ROOT, "payload", "LAUNCH.md");

const PRESET_ITEMS_MARKER = "<!-- preset:items -->";

interface SeededItem {
  title: string;
  humanSignoff: boolean;
  blocksLaunch: boolean;
  skill: string;
}

/** The generic seeded items from payload/LAUNCH.md, pinned order, BEFORE the marker. */
const GENERIC_ITEMS_BEFORE_MARKER: SeededItem[] = [
  { title: "Product definition", humanSignoff: true, blocksLaunch: true, skill: "define-product" },
  { title: "App identity", humanSignoff: false, blocksLaunch: true, skill: "brand-it" },
  { title: "Design system", humanSignoff: false, blocksLaunch: false, skill: "brand-it" },
];

/** The generic seeded items from payload/LAUNCH.md, pinned order, AFTER the marker. */
const GENERIC_ITEMS_AFTER_MARKER: SeededItem[] = [
  { title: "Legal pages", humanSignoff: true, blocksLaunch: true, skill: "make-it-yours" },
  { title: "Email templates", humanSignoff: false, blocksLaunch: false, skill: "brand-it" },
  { title: "Plans catalog", humanSignoff: true, blocksLaunch: false, skill: "enable-billing" },
  { title: "README", humanSignoff: false, blocksLaunch: false, skill: "make-it-yours" },
];

interface PresetCase {
  id: string;
  /** The preset's overlay fragment items, pinned order, inserted at the marker's position. */
  overlayItems: SeededItem[];
}

const PRESET_CASES: PresetCase[] = [
  {
    id: "untangle",
    overlayItems: [
      {
        title: "Untangle domain",
        humanSignoff: false,
        blocksLaunch: true,
        skill: "make-it-yours",
      },
      {
        title: "Template showcase",
        humanSignoff: false,
        blocksLaunch: true,
        skill: "make-it-yours",
      },
    ],
  },
  {
    id: "nothing",
    overlayItems: [
      {
        title: "Template showcase",
        humanSignoff: false,
        blocksLaunch: true,
        skill: "make-it-yours",
      },
    ],
  },
  {
    id: "brainstorm",
    overlayItems: [
      {
        title: "Brainstormer domain",
        humanSignoff: false,
        blocksLaunch: true,
        skill: "make-it-yours",
      },
      {
        title: "Template showcase",
        humanSignoff: false,
        blocksLaunch: true,
        skill: "make-it-yours",
      },
    ],
  },
];

/** Pinned drift guard: every preset under `presets/` MUST have an entry in `PRESET_CASES`,
 * or this test fails loudly instead of silently skipping the drift guard for it (mirrors
 * `packages/create/test/compose.golden.test.ts`'s `LAUNCH_ITEM_COUNTS` guard). */
it("PRESET_CASES covers exactly the presets under presets/", () => {
  const presetsRoot = path.join(REPO_ROOT, "presets");
  const actualIds = readdirSync(presetsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const pinnedIds = PRESET_CASES.map((preset) => preset.id).sort();
  expect(pinnedIds).toEqual(actualIds);
});

/** Mirrors the merge rule compose will implement (spec §5): a literal marker-line swap. */
function composeLaunchChecklist(payload: string, overlayFragment: string): string {
  expect(payload).toContain(PRESET_ITEMS_MARKER);
  return payload.replace(PRESET_ITEMS_MARKER, overlayFragment.trim());
}

describe.each(PRESET_CASES)(
  "LAUNCH.md seeded items — drift guard ($id)",
  ({ id, overlayItems }) => {
    const overlayPath = path.join(REPO_ROOT, "presets", id, "overlay", "launch-items.md");
    const seededItems: SeededItem[] = [
      ...GENERIC_ITEMS_BEFORE_MARKER,
      ...overlayItems,
      ...GENERIC_ITEMS_AFTER_MARKER,
    ];

    it(`payload/LAUNCH.md and presets/${id}/overlay/launch-items.md both exist`, () => {
      expect(() => readFileSync(PAYLOAD_LAUNCH_PATH, "utf8")).not.toThrow();
      expect(() => readFileSync(overlayPath, "utf8")).not.toThrow();
    });

    it(`parses to exactly the ${seededItems.length} seeded items`, () => {
      const payload = readFileSync(PAYLOAD_LAUNCH_PATH, "utf8");
      const overlay = readFileSync(overlayPath, "utf8");
      const items = parseLaunchChecklist(composeLaunchChecklist(payload, overlay));
      expect(items).toHaveLength(seededItems.length);
    });

    it("preserves the pinned order", () => {
      const payload = readFileSync(PAYLOAD_LAUNCH_PATH, "utf8");
      const overlay = readFileSync(overlayPath, "utf8");
      const items = parseLaunchChecklist(composeLaunchChecklist(payload, overlay));
      expect(items.map((item) => item.title)).toEqual(seededItems.map((item) => item.title));
    });

    for (const seeded of seededItems) {
      it(`'${seeded.title}' carries the pinned markers and skill`, () => {
        const payload = readFileSync(PAYLOAD_LAUNCH_PATH, "utf8");
        const overlay = readFileSync(overlayPath, "utf8");
        const items = parseLaunchChecklist(composeLaunchChecklist(payload, overlay));
        const found = items.find((item) => item.title === seeded.title);
        expect(found, `expected an item titled '${seeded.title}'`).toBeDefined();
        expect(found?.done).toBe(false);
        expect(found?.humanSignoff).toBe(seeded.humanSignoff);
        expect(found?.blocksLaunch).toBe(seeded.blocksLaunch);
        expect(found?.skill).toBe(seeded.skill);
      });
    }
  },
);
