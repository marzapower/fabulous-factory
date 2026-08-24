#!/usr/bin/env node
// Fails fast with a clear message when the running Node version doesn't
// satisfy the repo's engines.node requirement. `pnpm install` already
// enforces this at install time (engine-strict=true), but that check
// doesn't re-run for `pnpm test` / `pnpm -r` against an already-installed
// node_modules, so we check it explicitly here too.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(scriptDir, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const requiredRange = pkg.engines?.node;
if (!requiredRange) {
  // Nothing declared to check against — nothing to enforce.
  process.exit(0);
}

// Supports the simple ">=X" / ">=X.Y" / ">=X.Y.Z" form used by this repo's
// engines field. Extend here if the range syntax ever grows more complex.
const match = requiredRange.match(/^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
if (!match) {
  // Unrecognized range syntax — don't block on something we can't parse.
  process.exit(0);
}
const [, majorStr, minorStr = "0", patchStr = "0"] = match;
const required = [majorStr, minorStr, patchStr].map(Number);

const current = process.version.slice(1).split(".").map(Number);

function isAtLeast(current, required) {
  for (let i = 0; i < 3; i++) {
    if (current[i] > required[i]) return true;
    if (current[i] < required[i]) return false;
  }
  return true;
}

if (!isAtLeast(current, required)) {
  console.error(
    `You're on Node ${process.version}, this repo needs Node ${majorStr}+. ` +
      `Run \`nvm use\` (or \`fnm use\`) to switch to the version in .nvmrc.`,
  );
  process.exit(1);
}

process.exit(0);
