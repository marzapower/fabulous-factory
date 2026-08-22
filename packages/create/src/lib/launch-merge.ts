/**
 * LAUNCH.md merge rule (npx-installer design spec §5): `payload/LAUNCH.md` carries the
 * shape-generic items plus an explicit insertion marker; each preset overlay provides a
 * fragment inserted there at compose time. Pure string logic — no filesystem I/O — so it's
 * unit-testable directly against fixture strings.
 */
export const LAUNCH_ITEMS_MARKER = "<!-- preset:items -->";

/**
 * Replaces the marker line in `basePayload` with `presetFragment` (trimmed of its own
 * leading/trailing whitespace so the surrounding blank-line spacing in `basePayload` is
 * preserved verbatim). Throws if the marker isn't present — a missing marker means
 * `payload/LAUNCH.md` was edited without preserving the insertion point, which every
 * preset compose depends on.
 */
export function mergeLaunchChecklist(
  basePayload: string,
  presetFragment: string,
  marker: string = LAUNCH_ITEMS_MARKER,
): string {
  if (!basePayload.includes(marker)) {
    throw new Error(`LAUNCH.md payload is missing the "${marker}" insertion marker.`);
  }
  return basePayload.replace(marker, presetFragment.trim());
}
