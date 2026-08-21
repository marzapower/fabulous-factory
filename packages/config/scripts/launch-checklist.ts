/**
 * LAUNCH.md — pure parser + renderer helpers for the declarative launch checklist that
 * replaced the hash-based Adoption Ledger (design:
 * docs/superpowers/specs/2026-08-21-launch-checklist-design.md §3). No CLI here, no
 * `process.env`/`process.cwd()` reads — `content` (and, where a caller needs it, `rootDir`)
 * arrive as plain arguments so tests can hand this fixtures directly. `rootDir`, when threaded
 * by a caller, is never `realpath`'d (opt-23), same discipline as `factory-stage.ts`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface LaunchItem {
  title: string;
  done: boolean;
  blocksLaunch: boolean;
  humanSignoff: boolean;
  skill: string | null;
}

/** An item heading: `## [ ]`/`## [x]`/`## [X]` followed by the (unstripped) heading text. */
const ITEM_LINE = /^## \[( |x|X)\] (.+)$/;
/** Any level-2 heading — `###` and deeper do NOT match (the third char must be a space). */
const SECTION_BOUNDARY = /^## /;
/** `**Skill:** <name>` — the only other line the parser recognizes inside an item's section. */
const SKILL_LINE = /^\*\*Skill:\*\*\s*(.+)$/;

const HUMAN_SIGNOFF_MARKER = "🔒";
const BLOCKS_LAUNCH_MARKER = "blocks launch";
const MARKER_SEPARATOR = " · ";

/**
 * Deterministic title-stripping algorithm (spec §3.1, pinned): split the heading text on
 * the literal " · " separator (space-middot-space), drop every segment containing 🔒 or
 * 'blocks launch', rejoin the rest with " · ", trim. Detection of the two markers is a
 * SEPARATE substring check on the whole heading text
 * (never affected by this stripping), so it still works even when an adopter omits the
 * ` · ` separator before a marker. In that missing-separator case this mechanical algorithm
 * drops the fused title+marker segment along with the marker — an accepted, documented loss
 * (spec §3.1 parenthetical): write the separator to get a clean title.
 */
function stripMarkers(headingText: string): string {
  return headingText
    .split(MARKER_SEPARATOR)
    .filter(
      (segment) =>
        !segment.includes(HUMAN_SIGNOFF_MARKER) && !segment.includes(BLOCKS_LAUNCH_MARKER),
    )
    .join(MARKER_SEPARATOR)
    .trim();
}

/**
 * Parses a LAUNCH.md's items (spec §3.1). Anything that isn't an item heading — prose,
 * non-item headings — is ignored; adopters may restructure freely. Malformed/non-item
 * headings are simply skipped, not errors.
 */
export function parseLaunchChecklist(content: string): LaunchItem[] {
  const lines = content.split(/\r?\n/);
  const items: LaunchItem[] = [];

  let i = 0;
  while (i < lines.length) {
    const match = ITEM_LINE.exec(lines[i]);
    if (!match) {
      i += 1;
      continue;
    }

    const done = match[1].toLowerCase() === "x";
    const headingText = match[2];
    const humanSignoff = headingText.includes(HUMAN_SIGNOFF_MARKER);
    const blocksLaunch = headingText.includes(BLOCKS_LAUNCH_MARKER);
    const title = stripMarkers(headingText);

    let skill: string | null = null;
    let j = i + 1;
    while (j < lines.length && !SECTION_BOUNDARY.test(lines[j])) {
      const skillMatch = SKILL_LINE.exec(lines[j]);
      if (skillMatch) skill = skillMatch[1].trim();
      j += 1;
    }

    items.push({ title, done, blocksLaunch, humanSignoff, skill });
    i = j;
  }

  return items;
}

/**
 * Reads and parses `<rootDir>/LAUNCH.md`. A missing file degrades to `[]`, never throws —
 * callers that need to distinguish "no LAUNCH.md" from "LAUNCH.md with zero items" (e.g. to
 * choose between the handoff nag and the checklist report) should check file presence
 * themselves; this helper is for the common case of just wanting the parsed items.
 */
export function loadLaunchChecklist(rootDir: string): LaunchItem[] {
  const launchPath = path.join(rootDir, "LAUNCH.md");
  if (!existsSync(launchPath)) return [];
  return parseLaunchChecklist(readFileSync(launchPath, "utf8"));
}

/** Count of items ticked `[x]`/`[X]`. */
export function countDone(items: LaunchItem[]): number {
  return items.filter((item) => item.done).length;
}

/** Open (`!done`) items that carry `blocksLaunch` — the hard gate (spec §3.3). */
export function countOpenBlockers(items: LaunchItem[]): number {
  return items.filter((item) => item.blocksLaunch && !item.done).length;
}
