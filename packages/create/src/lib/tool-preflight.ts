/**
 * Install-time tool preflight (npx-installer design spec §6). Probes
 * `pnpm`/`git`/`docker` on `PATH` *before* anything is scaffolded — `pnpm` is the only
 * hard requirement (the scaffolded repo's own `pnpm install` is unusable without it); `git`
 * and `docker` are optional, each degrading to a skipped step + a printed hint rather than
 * a failure. This mirrors the graceful-degradation contract the rest of the factory follows
 * (`docs/agents/conventions.md`) at the one point before that contract's own guardrails
 * (`@factory/config`, `defineHandler`) even exist for this process — `install.ts` can't
 * import them, it bundles standalone (see `eslint.config.mjs`'s `PROCESS_ENV_EXCEPTIONS`
 * note on `packages/create/src/**`).
 */
import { execFileSync } from "node:child_process";

import { log } from "@clack/prompts";

export type ToolName = "pnpm" | "git" | "docker";

/** Discriminated on `status` so a caller can never read `version`/`detail` off the wrong
 * branch — `missing` (ENOENT: the binary isn't on `PATH`) is deliberately distinct from
 * `error` (the binary exists but `--version` exited non-zero, timed out, or otherwise
 * failed), since the two need different wording downstream. */
export type ProbeResult =
  { status: "ok"; version: string } | { status: "missing" } | { status: "error"; detail: string };

/** Runs the version probe for one tool. Overridable purely for testing — `checkTools`'s
 * default argument is the real `execFileSync`-based probe below; tests inject a fake to
 * avoid depending on what's actually installed on the machine running the suite. */
export type ToolProbe = (tool: ToolName) => ProbeResult;

export interface ToolCheck {
  tool: ToolName;
  /** `pnpm` only — `git`/`docker` degrade instead of failing the install. */
  required: boolean;
  result: ProbeResult;
  /** Set only for a non-fatal problem on an otherwise "ok" result (currently: pnpm below
   * `MIN_PNPM_MAJOR`). Availability itself is always `result.status === "ok"`. */
  warning?: string;
}

export class MissingToolError extends Error {
  readonly tool: ToolName;

  constructor(tool: ToolName, message: string) {
    super(message);
    this.name = "MissingToolError";
    this.tool = tool;
  }
}

/** The scaffold pins `"packageManager": "pnpm@11.x"` (corepack); pnpm major versions below
 * this don't auto-switch to that pin, so their `pnpm install` fails in a confusing way.
 * This is a warning, not a hard requirement — corepack itself is what enforces the pin once
 * pnpm is new enough to honor it. */
export const MIN_PNPM_MAJOR = 10;

const TOOL_ORDER: readonly ToolName[] = ["pnpm", "git", "docker"];
const PROBE_TIMEOUT_MS = 5_000;

const PROBE_ARGS: Record<ToolName, string[]> = {
  pnpm: ["--version"],
  git: ["--version"],
  // Not `docker --version`: that only proves the docker CLI exists, not that
  // `docker compose up` (what the next-steps message actually recommends) will work.
  docker: ["compose", "version"],
};

/** Hint bodies only — `reportTools` prefixes each with `optional: ` itself, so these never
 * repeat the word or nest their own parens. */
const OPTIONAL_HINTS: Record<ToolName, string> = {
  pnpm: "",
  git: 'the scaffold\'s "git init" step will be skipped; run it yourself later',
  docker: "needed only for `docker compose up -d db` local Postgres; any reachable Postgres works",
};

/** Display name used in printed output — distinct from `commandLabel` (the actual command
 * run), since "docker" alone would misleadingly suggest the plain Docker CLI was checked. */
function displayLabel(tool: ToolName): string {
  return tool === "docker" ? "docker compose" : tool;
}

function commandLabel(tool: ToolName): string {
  return tool === "docker" ? "docker compose version" : `${tool} --version`;
}

function firstLine(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  return trimmed.split("\n")[0]?.trim();
}

/** Strips each tool's version-command boilerplate so the reported string is just the
 * number — `git 2.50.1`, `docker compose 5.1.2`, `pnpm 11.22.0` — never the raw
 * `git version 2.50.1` / `Docker Compose version v2.24.5` the command prints. */
function normalizeVersion(tool: ToolName, rawVersion: string): string {
  let version = rawVersion;
  if (tool === "git") version = version.replace(/^git version\s+/i, "");
  if (tool === "docker") version = version.replace(/^Docker Compose version\s+/i, "");
  return version.replace(/^v/, "");
}

/**
 * Real probe: `<tool> --version` (or `docker compose version`), 5s timeout, stdio piped
 * (never inherited — this must never leak a child process's output straight to the
 * terminal ahead of clack's own rendering). `shell: true` only on Windows since `cmd.exe`
 * doesn't resolve `.cmd`/`.ps1` shims via `execFileSync` otherwise; `tool`/`args` are fixed
 * literals from `PROBE_ARGS`, never user input, so this carries no injection surface
 * despite the shell.
 */
const defaultProbe: ToolProbe = (tool) => {
  try {
    const stdout = execFileSync(tool, PROBE_ARGS[tool], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: PROBE_TIMEOUT_MS,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    const line = firstLine(stdout);
    if (!line) return { status: "error", detail: "no version output" };
    return { status: "ok", version: normalizeVersion(tool, line) };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") return { status: "missing" };
    const detail = firstLine(err.stderr) ?? firstLine(err.message) ?? "unknown error";
    return { status: "error", detail };
  }
};

function pnpmVersionWarning(result: ProbeResult): string | undefined {
  if (result.status !== "ok") return undefined;
  const major = Number.parseInt(result.version, 10);
  if (Number.isNaN(major) || major >= MIN_PNPM_MAJOR) return undefined;
  return (
    `needs pnpm >= ${MIN_PNPM_MAJOR} for corepack to auto-switch to the scaffold's ` +
    `"packageManager" pin — upgrade with "corepack enable pnpm" or "npm install -g pnpm@latest".`
  );
}

/** Order: pnpm, git, docker — same order the report/next-steps text presents them in. */
export function checkTools(probe: ToolProbe = defaultProbe): ToolCheck[] {
  return TOOL_ORDER.map((tool) => {
    const result = probe(tool);
    return {
      tool,
      required: tool === "pnpm",
      result,
      warning: tool === "pnpm" ? pnpmVersionWarning(result) : undefined,
    };
  });
}

/** Prints one clack `log` line per tool — success/warn/error, never a thrown error itself;
 * `assertRequiredTools` is what turns a missing/broken required tool into a failure. Called
 * unconditionally so the user always sees all three lines, including the one that's about
 * to fail the install. */
export function reportTools(checks: ToolCheck[]): void {
  for (const check of checks) {
    const { tool, required, result, warning } = check;
    const label = displayLabel(tool);
    if (result.status === "ok") {
      if (warning) {
        log.warn(`${label} ${result.version} — ${warning}`);
      } else {
        log.success(`${label} ${result.version}`);
      }
      continue;
    }
    const reason =
      result.status === "missing"
        ? "not found"
        : `"${commandLabel(tool)}" failed: ${result.detail}`;
    if (required) {
      log.error(`${label} — ${reason}`);
    } else {
      log.warn(`${label} — ${reason} · optional: ${OPTIONAL_HINTS[tool]}`);
    }
  }
}

/** Whether a given tool probed as `"ok"` in a set of checks — the boolean shape `install.ts`
 * actually needs downstream (`gitAvailable`, `dockerAvailable`), reading a specific
 * `ToolCheck` out of the list without repeating the `.find(...)?.result.status === "ok"`
 * pattern at every call site. */
export function hasTool(checks: ToolCheck[], tool: ToolName): boolean {
  return checks.find((check) => check.tool === tool)?.result.status === "ok";
}

/** Throws on the first required tool (currently: pnpm only) that isn't `"ok"` — called
 * after `reportTools` so the failing line is already visible above the thrown message.
 * Optional tools (`git`, `docker`) never reach here regardless of their status. */
export function assertRequiredTools(checks: ToolCheck[]): void {
  for (const check of checks) {
    if (!check.required || check.result.status === "ok") continue;
    if (check.result.status === "missing") {
      throw new MissingToolError(
        check.tool,
        `${check.tool} is not installed. Install it with "corepack enable pnpm" ` +
          `(Node ships corepack) or "npm install -g pnpm", then re-run.`,
      );
    }
    throw new MissingToolError(
      check.tool,
      `${check.tool} is on PATH but "${commandLabel(check.tool)}" failed: ` +
        `${check.result.detail}. Fix it, then re-run.`,
    );
  }
}
