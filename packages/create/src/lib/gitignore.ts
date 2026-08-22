/**
 * Re-dots every `gitignore` file in a scaffolded tree at install time. Templates ship it
 * undotted (npm strips `.gitignore` from published tarballs) — see the VARIANT_ENTRIES
 * comment in `compose.config.ts`.
 */
import { readdirSync, renameSync } from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git"]);

/** Recursively renames every file literally named `gitignore` to `.gitignore`. */
export function renameGitignoreFiles(rootDir: string): void {
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      renameGitignoreFiles(full);
    } else if (entry.isFile() && entry.name === "gitignore") {
      renameSync(full, path.join(rootDir, ".gitignore"));
    }
  }
}
