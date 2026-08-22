#!/usr/bin/env node
/**
 * `fabulous-factory` bin entry (npx-installer design spec §6). Bare `fabulous-factory` /
 * `npx fabulous-factory@latest` is equivalent to `fabulous-factory install` — every
 * scaffold comes from this tarball's embedded `templates/<preset>/`, never fetched
 * remotely (spec §10).
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { install, type InstallOptions } from "./install";

interface ParsedArgs {
  command: string;
  options: InstallOptions;
}

const KNOWN_COMMANDS = new Set(["install"]);

function parseArgs(argv: string[]): ParsedArgs {
  const options: InstallOptions = { yes: false, installDeps: true, gitInit: true };
  let command = "install";
  let sawCommand = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--preset":
        options.preset = requireValue(argv, ++i, "--preset");
        break;
      case "--dir":
        options.dir = requireValue(argv, ++i, "--dir");
        break;
      case "--yes":
        options.yes = true;
        break;
      case "--no-install":
        options.installDeps = false;
        break;
      case "--no-git":
        options.gitInit = false;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown flag: ${arg}`);
        }
        if (sawCommand) {
          throw new Error(`Unexpected argument: ${arg}`);
        }
        if (!KNOWN_COMMANDS.has(arg)) {
          throw new Error(`Unknown command: ${arg}`);
        }
        command = arg;
        sawCommand = true;
    }
  }

  return { command, options };
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined) throw new Error(`Missing value for ${flag}`);
  return value;
}

/**
 * Entry point, exported so both the published bin (`dist/cli.js`, invoked directly by
 * node — see the `isInvokedDirectly` check below) and `packages/create-alias/bin.js` (a
 * dynamic `import()` that calls this explicitly) can run it identically.
 */
export async function main(): Promise<void> {
  // `parseArgs` already throws on anything outside `KNOWN_COMMANDS` (currently just
  // "install"), so `command` is guaranteed to be "install" here — no further check needed.
  const { options } = parseArgs(process.argv.slice(2));
  await install(options);
}

/**
 * True when this file is the process's actual entry point. Compares realpaths, not raw
 * `argv[1]`/`import.meta.url` strings: npm/pnpm install `bin` entries as symlinks, so a
 * naive string comparison never matches once this package is installed as a dependency
 * (npx-installer design spec — the bug this replaced left the CLI inert under npm). Both
 * sides are wrapped in `realpathSync` defensively — resolving a path that doesn't exist
 * (e.g. `argv[1]` unset, or an already-deleted temp entry) must not crash the whole module.
 */
function isInvokedDirectly(): boolean {
  const argvPath = process.argv[1];
  if (argvPath === undefined) return false;
  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
