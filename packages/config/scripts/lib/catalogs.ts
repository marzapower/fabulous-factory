/**
 * Shared readdir+filter for a package/app's `messages/` catalog directory (i18n plan
 * §2.6 review fix) — `scripts/doctor.ts`'s `listLocalesIn` and `scripts/gen.ts`'s
 * `listCatalogFiles` previously duplicated this same "every `*.json` file directly under
 * `dir`, sorted" scan. Pure filesystem read — exported for tests.
 */
import { readdirSync } from "node:fs";

/**
 * `*.json` file names (with extension, sorted) found directly under `dir`. `[]` when
 * `dir` doesn't exist — a fresh app/package with no catalog yet is not an error, just
 * empty.
 */
export function listJsonFileNames(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}
