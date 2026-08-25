/**
 * Pure string helpers for the installer's end-of-run message (npx-installer design spec
 * §6). No I/O, no `process.env` reads — `styleText` decides on its own whether the
 * destination stream can take colour (respects `NO_COLOR`, honours non-TTY output).
 * Callers hand the result to `@clack/prompts` `note()` / print `OUTRO_LINE` via `outro()`.
 */
import { styleText } from "node:util";

/**
 * What actually happened to git during install, not just whether it ended up initialised —
 * `"failed"` (tool was available, `git init`/`add`/`commit` errored) and `"unavailable"`
 * (tool wasn't on `PATH` at all, so it was never attempted) need different hints; `"declined"`
 * (the person said no) and `"initialized"` need none.
 */
export type GitStatus = "initialized" | "declined" | "failed" | "unavailable";

export interface NextStepsContext {
  /** Directory to `cd` into — the scaffold's root, not necessarily kebab-cased. */
  projectName: string;
  /** `pnpm install` ran and succeeded. */
  depsInstalled: boolean;
  gitStatus: GitStatus;
  /** `docker compose version` succeeded (preflight). */
  dockerAvailable: boolean;
}

/** Matches the scaffold's docker-compose.yml `db` service (host-published port, fixed
 * dev credentials — never used outside a local compose stack). */
const DOCKER_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/postgres";

function command(text: string): string {
  return styleText("bold", text);
}

function comment(text: string): string {
  return styleText("dim", `# ${text}`);
}

/** A numbered step: bold command, optional dim trailing comment. */
function step(cmd: string, note?: string): string {
  return note === undefined ? command(cmd) : `${command(cmd)}  ${comment(note)}`;
}

/** Indented continuation line under a numbered step — 3 spaces to align under the step's
 * own text, dim so it reads as elaboration rather than another command. Kept short (the
 * clack `note()` box is ~76 cols wide; every rendered line here stays at or under 70
 * visible characters) rather than a single long dim line that would wrap inside the box. */
function continuation(text: string): string {
  return `   ${styleText("dim", text)}`;
}

/**
 * Pure. Multi-line body for `@clack/prompts` `note()`. Numbered steps, each a command plus
 * an optional dim comment; no trailing newline.
 */
export function renderNextSteps(ctx: NextStepsContext): string {
  const lines: string[] = [step(`cd ${ctx.projectName}`)];

  if (!ctx.depsInstalled) {
    lines.push(step("pnpm install"));
  }

  lines.push(step("cp .env.example .env"));
  lines.push(step("openssl rand -hex 32", "paste as BETTER_AUTH_SECRET in .env"));

  if (ctx.dockerAvailable) {
    lines.push(
      [
        step("docker compose up -d db", "start Docker first"),
        continuation("then set DATABASE_URL in .env to"),
        continuation(DOCKER_DATABASE_URL),
        continuation("(port follows DB_PORT if you set it)"),
      ].join("\n"),
    );
  } else {
    lines.push(
      [
        step("set DATABASE_URL in .env", "any reachable Postgres"),
        continuation("no Postgres? install Docker, then: docker compose up -d db"),
      ].join("\n"),
    );
  }

  lines.push(step("pnpm dev", "migrations self-apply"));

  const numbered = lines.map((entry, index) => `${index + 1}. ${entry}`).join("\n");

  if (ctx.gitStatus !== "failed" && ctx.gitStatus !== "unavailable") return numbered;

  const gitHint =
    ctx.gitStatus === "failed"
      ? styleText(
          "dim",
          `git init failed — run \`git init && git add -A && git commit -m "chore: scaffold from fabulous-factory"\` yourself`,
        )
      : styleText(
          "dim",
          `git isn't installed — install it, then \`git init && git add -A && git commit -m "chore: scaffold from fabulous-factory"\``,
        );

  return `${numbered}\n\n${gitHint}`;
}

/** Closing line for `outro()` — points the adopter at their coding agent for the rest. */
export const OUTRO_LINE =
  "Not sure what's next? Ask your agent — \"what's left to make this mine?\"";
