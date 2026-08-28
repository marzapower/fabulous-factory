// Pure catalog diffing, consumed by scripts/i18n-check.ts. Deliberately self-contained
// (only a type-only import from ./index, erased by `verbatimModuleSyntax` — no runtime
// dependency on it) so it stays trivially safe to import from a standalone CLI script.
import type { Messages } from "./index";

export interface CatalogDiff {
  locale: string;
  missing: string[];
  extra: string[];
}

function isPlainObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Flattens a nested message tree into dotted leaf-key paths ("ns.a.b"). */
export function flattenKeys(m: Messages, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(m)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      keys.push(...flattenKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

/**
 * `missing`: leaf keys present in `base` but absent from `candidate`.
 * `extra`: leaf keys present in `candidate` but absent from `base`.
 */
export function diffCatalog(
  base: Messages,
  candidate: Messages,
): { missing: string[]; extra: string[] } {
  const baseKeys = new Set(flattenKeys(base));
  const candidateKeys = new Set(flattenKeys(candidate));
  const missing = [...baseKeys].filter((key) => !candidateKeys.has(key));
  const extra = [...candidateKeys].filter((key) => !baseKeys.has(key));
  return { missing, extra };
}
