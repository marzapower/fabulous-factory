/**
 * `fabulous-factory install` (npx-installer design spec §6). Copies the embedded
 * `templates/<preset>/` tree into a target directory, re-dots `gitignore`, stamps the
 * project name, and optionally runs `git init` + `pnpm install`. Deliberately does NOT
 * import `compose.ts`/`presets.ts` — those read the repo's `packages/`/`payload/`/
 * `presets/` trees, which don't exist once this file is bundled and published; this
 * module defines its own tiny `PresetManifestEntry` type instead of importing
 * `presets.ts`'s richer `PresetMeta`.
 *
 * Errors before the copy step leave nothing behind; errors during/after it leave the
 * partial directory in place with a clear message (spec §6) — never auto-deleted.
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cancel, confirm, intro, isCancel, select, text } from "@clack/prompts";

import { copyRecursive } from "./lib/fs";
import { renameGitignoreFiles } from "./lib/gitignore";
import { stampProjectName, toKebabCase, validateProjectName } from "./lib/name-stamp";
import { stampProvenance } from "./lib/provenance-stamp";

export interface InstallOptions {
  preset?: string;
  dir?: string;
  yes: boolean;
  installDeps: boolean;
  gitInit: boolean;
}

export interface PresetManifestEntry {
  id: string;
  label: string;
  description: string;
  status: "available" | "coming-soon";
}

const DEFAULT_PROJECT_NAME = "my-app";
const MIN_NODE_MAJOR = 24;

/**
 * Warns — never refuses — when running under a Node major version below what the
 * scaffolded repo itself enforces (`"engines": { "node": ">=24" }`, `engine-strict=true`
 * in its `.npmrc`). Without this, `install` on an older Node scaffolds cleanly, then the
 * scaffold's own `pnpm install` hard-fails on engine-strict with nothing pointing at Node
 * as the cause. The scaffold's contents are Node-version-agnostic until that install step,
 * so this only warns and keeps going. Takes the version string as a parameter (defaulting
 * to `process.versions.node`) rather than reading `process.env` — nothing here is
 * environment-configurable, sanctioned or otherwise.
 */
export function warnIfNodeTooOld(nodeVersion: string = process.versions.node): void {
  const major = Number.parseInt(nodeVersion.split(".")[0] ?? "", 10);
  if (Number.isNaN(major) || major >= MIN_NODE_MAJOR) return;
  console.warn(
    `⚠ Running under Node ${nodeVersion} — the scaffolded repo enforces Node >= ${MIN_NODE_MAJOR} ` +
      `via engine-strict, so its own "pnpm install" will fail. Upgrade first, e.g. "nvm install ${MIN_NODE_MAJOR}".`,
  );
}

/**
 * `FABULOUS_FACTORY_TEMPLATES_DIR` overrides the embedded-templates lookup — test-only
 * escape hatch (npx-installer design spec §6, direct `process.env` read sanctioned there;
 * see `eslint.config.mjs`'s `PROCESS_ENV_EXCEPTIONS`). Real installs never set it and get
 * the relative-to-this-file default, which resolves correctly whether this runs as
 * `src/cli.ts` (via `tsx`, in tests) or the built `dist/cli.js` (published).
 */
/** This package's own root — same whether this runs as `src/cli.ts` (via `tsx`, in tests)
 * or the built `dist/cli.js` (published): both sit one level under it. */
function packageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..");
}

function templatesRoot(): string {
  const override = process.env.FABULOUS_FACTORY_TEMPLATES_DIR;
  if (override) return path.resolve(override);
  return path.join(packageRoot(), "templates");
}

/**
 * This installed CLI's own version, read from its `package.json` at runtime — never
 * `process.env` (npx-installer design spec §6's sanctioned exception is `templatesRoot`'s
 * override, not this). `package.json` always ships in the npm tarball regardless of the
 * `files` allowlist, so this is reliable both installed from npm and run against source.
 */
function resolveFactoryVersion(): string {
  const pkgPath = path.join(packageRoot(), "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

function loadManifest(): PresetManifestEntry[] {
  const manifestPath = path.join(templatesRoot(), "presets.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      "No embedded templates found (templates/presets.json is missing) — this package was not built correctly.",
    );
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as PresetManifestEntry[];
}

/** Resolves an explicit `--preset`, or the sole available preset when none was given. */
function resolvePreset(manifest: PresetManifestEntry[], requested?: string): PresetManifestEntry {
  if (requested) {
    const found = manifest.find((entry) => entry.id === requested);
    if (!found) {
      const known = manifest.map((entry) => entry.id).join(", ") || "(none)";
      throw new Error(`Unknown preset "${requested}". Available: ${known}`);
    }
    if (found.status !== "available") {
      throw new Error(`Preset "${requested}" is coming soon and can't be installed yet.`);
    }
    return found;
  }

  const available = manifest.filter((entry) => entry.status === "available");
  if (available.length === 0) {
    throw new Error("No available presets are embedded in this package.");
  }
  if (available.length > 1) {
    const ids = available.map((entry) => entry.id).join(", ");
    throw new Error(`Multiple presets are available (${ids}) — pass --preset <id> to choose one.`);
  }
  return available[0];
}

/**
 * Interactive-picker default: the requested `--preset` if given, else the first
 * "available" manifest entry's id (or `undefined` if none are available — the picker
 * then just renders every entry disabled, with no `initialValue`). Deliberately never
 * throws on ambiguity, unlike `resolvePreset` above — the `--yes` (non-interactive) path
 * must fail loudly when multiple presets are available and none was chosen; the
 * interactive path instead lets the person choose from the rendered list.
 */
export function derivePickerDefault(
  manifest: PresetManifestEntry[],
  requested?: string,
): string | undefined {
  if (requested) return requested;
  return manifest.find((entry) => entry.status === "available")?.id;
}

/** Refuses a `--dir` that's a non-empty directory, a regular file, or a symlink. */
export function assertEmptyTarget(dir: string): void {
  let stats;
  try {
    stats = lstatSync(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new Error(
      `"${dir}" is a symlink — refusing to scaffold into it. Point --dir at a real path.`,
    );
  }
  if (!stats.isDirectory()) {
    throw new Error(`"${dir}" already exists and is not a directory.`);
  }
  if (readdirSync(dir).length > 0) {
    throw new Error(`Directory "${dir}" already exists and is not empty.`);
  }
}

async function unwrap<T>(promise: Promise<T | symbol>): Promise<T> {
  const value = await promise;
  if (isCancel(value)) {
    cancel("Cancelled.");
    process.exit(0);
  }
  return value;
}

interface Answers {
  projectName: string;
  presetId: string;
  installDeps: boolean;
  gitInit: boolean;
}

async function promptAnswers(
  manifest: PresetManifestEntry[],
  options: InstallOptions,
): Promise<Answers> {
  intro("fabulous-factory");

  const rawName = await unwrap(
    text({
      message: "Project name",
      placeholder: DEFAULT_PROJECT_NAME,
      defaultValue: DEFAULT_PROJECT_NAME,
      validate: (value) => validateProjectName(toKebabCase(value || DEFAULT_PROJECT_NAME)),
    }),
  );
  const projectName = toKebabCase(rawName || DEFAULT_PROJECT_NAME) || DEFAULT_PROJECT_NAME;

  const defaultPresetId = derivePickerDefault(manifest, options.preset);
  const presetId = await unwrap(
    select({
      message: "Preset",
      ...(defaultPresetId !== undefined ? { initialValue: defaultPresetId } : {}),
      options: manifest.map((entry) => ({
        value: entry.id,
        label: entry.label,
        hint: entry.description,
        disabled: entry.status !== "available",
      })),
    }),
  );

  const installDeps = await unwrap(
    confirm({ message: "Install dependencies with pnpm?", initialValue: options.installDeps }),
  );

  const gitInit = await unwrap(
    confirm({ message: "Initialize git repository?", initialValue: options.gitInit }),
  );

  return { projectName, presetId, installDeps, gitInit };
}

function stampNames(targetDir: string, projectName: string): void {
  for (const relPath of ["package.json", "README.md"]) {
    const filePath = path.join(targetDir, relPath);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf8");
    writeFileSync(filePath, stampProjectName(content, projectName));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs `fn`, downgrading a thrown error to a printed warning instead of failing install. */
function tryRun(warningPrefix: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    console.warn(`⚠ ${warningPrefix}: ${errorMessage(error)}`);
  }
}

function printNextSteps(projectName: string): void {
  console.log("");
  console.log(
    `Done. cd ${projectName} → cp .env.example .env → set DATABASE_URL + BETTER_AUTH_SECRET → pnpm dev`,
  );
  console.log('   Then ask your agent: "what\'s left to make this mine?"');
}

export async function install(options: InstallOptions): Promise<void> {
  warnIfNodeTooOld();
  const manifest = loadManifest();

  let answers: Answers;
  if (options.yes) {
    const preset = resolvePreset(manifest, options.preset);
    const rawName = options.dir ? path.basename(path.resolve(options.dir)) : DEFAULT_PROJECT_NAME;
    answers = {
      projectName: toKebabCase(rawName) || DEFAULT_PROJECT_NAME,
      presetId: preset.id,
      installDeps: options.installDeps,
      gitInit: options.gitInit,
    };
  } else {
    answers = await promptAnswers(manifest, options);
  }

  const targetDir = options.dir
    ? path.resolve(options.dir)
    : path.resolve(process.cwd(), answers.projectName);
  assertEmptyTarget(targetDir);

  const sourceDir = path.join(templatesRoot(), answers.presetId);
  if (!existsSync(sourceDir)) {
    throw new Error(`Embedded template for preset "${answers.presetId}" is missing.`);
  }

  try {
    copyRecursive(sourceDir, targetDir);
    renameGitignoreFiles(targetDir);
    stampNames(targetDir, answers.projectName);
    stampProvenance(targetDir, {
      preset: answers.presetId,
      factoryVersion: resolveFactoryVersion(),
    });
  } catch (error) {
    throw new Error(
      `Scaffold partially created at "${targetDir}" — ${errorMessage(error)}. ` +
        "Fix the issue or remove the directory, then retry.",
    );
  }

  if (answers.gitInit) {
    tryRun("git init failed — run it yourself", () => {
      execFileSync("git", ["init"], { cwd: targetDir, stdio: "ignore" });
      execFileSync("git", ["add", "-A"], { cwd: targetDir, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "chore: scaffold from fabulous-factory"], {
        cwd: targetDir,
        stdio: "ignore",
      });
    });
  }

  if (answers.installDeps) {
    tryRun("pnpm install failed — run it yourself", () => {
      execFileSync("pnpm", ["install"], { cwd: targetDir, stdio: "inherit" });
    });
  }

  printNextSteps(answers.projectName);
}
