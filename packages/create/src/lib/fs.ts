/**
 * Small, dependency-free filesystem helpers shared by the compose engine (build-time,
 * `pnpm compose` / `prepack`) and the installer (`install.ts`, bundled into the published
 * CLI). No workspace-package imports here — see `.dependency-cruiser.cjs`'s
 * `dag-create-imports-no-workspace-package` rule; `packages/create` manipulates files, not
 * factory code.
 */
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";

/** Directory/file names never worth copying — build output, VCS metadata, caches. */
const EXCLUDED_NAMES = new Set(["node_modules", ".next", ".git", "coverage"]);
/** Exact generated filenames excluded regardless of directory (Next-generated). */
const EXCLUDED_EXACT_FILENAMES = new Set(["next-env.d.ts"]);
/** Filename suffixes excluded regardless of directory (tsc incremental-build cache). */
const EXCLUDED_SUFFIXES = [".tsbuildinfo"];

/** `.env.example` is the one `.env*` file meant to ship — everything else looks secret-shaped. */
const ENV_ALLOWLISTED_FILENAME = ".env.example";
/** Exact secret-shaped filenames, regardless of directory. */
const SECRET_EXACT_FILENAMES = new Set([".npmrc"]);
/** Filename suffixes that are secret-shaped (certs/keys), regardless of directory. */
const SECRET_SUFFIXES = [".pem", ".key", ".p12"];
/** Filename prefixes that are secret-shaped (SSH keypairs), regardless of directory. */
const SECRET_PREFIXES = ["id_rsa"];

/** True for `.env`/`.env.*` other than the allowlisted `.env.example`, and other secret shapes. */
function isSecretLike(name: string): boolean {
  if (name === ENV_ALLOWLISTED_FILENAME) return false;
  if (name === ".env" || name.startsWith(".env.")) return true;
  if (SECRET_EXACT_FILENAMES.has(name)) return true;
  if (SECRET_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true;
  if (SECRET_PREFIXES.some((prefix) => name.startsWith(prefix))) return true;
  return false;
}

/** True for husky's own generated hook-runner internals (`.husky/_/**`) — not ours to ship. */
function isHuskyHiddenDir(source: string): boolean {
  return path.basename(source) === "_" && path.basename(path.dirname(source)) === ".husky";
}

function shouldExclude(source: string): boolean {
  const name = path.basename(source);
  if (EXCLUDED_NAMES.has(name)) return true;
  if (EXCLUDED_EXACT_FILENAMES.has(name)) return true;
  if (EXCLUDED_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true;
  if (isSecretLike(name)) return true;
  if (isHuskyHiddenDir(source)) return true;
  return false;
}

export interface CopyRecursiveOptions {
  /** Absolute source paths to skip in addition to the built-in exclusions (caller-resolved). */
  excludeAbsolutePaths?: ReadonlySet<string>;
}

/**
 * Copies a file or directory tree from `src` to `dest`, creating parent directories as
 * needed and skipping build/VCS artifacts and secret-shaped files (see `shouldExclude`
 * above). Works for both a single file and a directory — `recursive` is a no-op for files,
 * required for directories.
 */
export function copyRecursive(src: string, dest: string, options?: CopyRecursiveOptions): void {
  const excludeAbsolutePaths = options?.excludeAbsolutePaths;
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    dereference: true,
    filter: (source) => {
      if (shouldExclude(source)) return false;
      if (excludeAbsolutePaths?.has(path.resolve(source))) return false;
      return true;
    },
  });
}
