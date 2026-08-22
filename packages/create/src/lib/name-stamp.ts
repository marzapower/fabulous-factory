/**
 * Pure string helpers for the install-time "stamp the project name" step (npx-installer
 * design spec §6). No filesystem I/O — callers read/write the files themselves.
 */

/** The placeholder every adopter variant (root package.json, README.md) ships with. */
export const NAME_PLACEHOLDER = "fabulous-factory-app";

/** Replaces every occurrence of the placeholder with the real project name. */
export function stampProjectName(content: string, projectName: string): string {
  return content.split(NAME_PLACEHOLDER).join(projectName);
}

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Lowercases, replaces runs of non `[a-z0-9]` with a single hyphen, trims edge hyphens. */
export function toKebabCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Returns an error string for an invalid kebab-case name, or `undefined` if it's valid. */
export function validateProjectName(name: string): string | undefined {
  if (!name) return "Project name is required.";
  if (!KEBAB_CASE.test(name)) {
    return "Use lowercase letters, numbers, and hyphens only (kebab-case).";
  }
  return undefined;
}
