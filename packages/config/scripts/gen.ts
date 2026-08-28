#!/usr/bin/env node
/**
 * `pnpm gen <handler|page|job> <name> [--app <name>]` — deterministic scaffolds stamped
 * from inline template literals (plan §J.5): zero stray template files, typechecked as
 * plain strings, and every generated file passes `factory/no-raw-handler` and the
 * boundary rules by construction.
 *
 * `<name>` must be a single kebab-case segment (`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`, plan
 * §J.12.8) — no slashes, so a scaffold can never be written outside its target
 * directory by construction. Refuses to overwrite an existing target.
 *
 * `--app <name>` picks the target `apps/<name>` dir for handler/page kinds when more
 * than one exists (`resolveAppDir`, npx-installer design spec §7) — required only when
 * the workspace has more than one app; a single-app workspace needs no flag.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type GenKind = "handler" | "page" | "job";

const KINDS: readonly GenKind[] = ["handler", "page", "job"];

/** Single kebab-case segment: lowercase start, no leading/trailing/double hyphens. */
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Pure — exported for tests. */
export function isValidName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

/** `sample-sync` → `sampleSync`. Pure — exported for tests. */
export function toCamelCase(name: string): string {
  const [first = "", ...rest] = name.split("-");
  return first + rest.map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1)).join("");
}

/** `sample-sync` → `SampleSync`. Pure — exported for tests. */
export function toPascalCase(name: string): string {
  const camel = toCamelCase(name);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** `sample-sync` → `Sample Sync` — used only for generated page headings. */
function toTitleCase(name: string): string {
  return name
    .split("-")
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(" ");
}

/**
 * `<appDir>/app/api/<name>/route.ts` — a direct `defineHandler(...)` call (passes
 * `factory/no-raw-handler` by construction, eslint.config.mjs). Deliberately does not
 * destructure `session`/`input` off the handler ctx — an unused destructured var would
 * itself fail lint; the TODOs point the agent at the real decisions instead.
 */
function renderHandlerTemplate(): string {
  return `import { defineHandler } from "@factory/core";

// TODO: this scaffold defaults to the safe posture — choose the auth mode
// deliberately. "required" (default here) is right for anything behind a signed-in
// user; use "public" only when this endpoint must be reachable unauthenticated, and
// "webhook" for signed server-to-server callbacks (see packages/core's defineHandler).
// TODO: replace input: "none" with a zod schema once this handler accepts a body or
// query params.
// TODO: replace rateLimit: "none" with a real policy once this handler does real work
// — a "public" handler MUST decide a policy, it cannot default to "none".
export const GET = defineHandler({
  auth: "required",
  input: "none",
  rateLimit: "none",
  handler: async () => {
    return { ok: true };
  },
});
`;
}

/**
 * `<appDir>/app/[locale]/<name>/page.tsx` — minimal server component, layout-consistent
 * wrapper. Every page under `[locale]` starts with `setRequestLocale` (i18n plan §2.3);
 * `getTranslations` is pulled in ready to use, so the TODO is "add the key," not "wire
 * the plumbing."
 */
function renderPageTemplate(name: string): string {
  const pascal = toPascalCase(name);
  const camel = toCamelCase(name);
  const title = toTitleCase(name);
  return `import { getTranslations, setRequestLocale } from "@factory/i18n/server";

export default async function ${pascal}Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("app");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">${title}</h1>
      <p className="mt-2 text-lg leading-relaxed text-muted-foreground">
        {/* TODO: replace this placeholder copy — add an "app.${camel}" key to
            messages/en.json (and messages/it.json) and swap in t("${camel}") below. */}
        {t("${camel}")}
      </p>
    </main>
  );
}
`;
}

/**
 * `packages/jobs/src/functions/<name>.ts` — event-triggered Inngest function. Event
 * name is `app/<name>.requested` (opt-18: matches the `namespace/entity.action.state`
 * idiom, e.g. the untangle preset's `untangle/daily-plan.requested`,
 * `packages/untangle/src/events.ts`), with the const defined right here beside the
 * function rather than in a shared registry — `packages/jobs` is residual
 * infrastructure only (the Inngest client + the generic, empty `functions` array a
 * preset's own domain package populates), it owns no event registry of its own. Imports
 * only `../client` — jobs may depend on `@factory/config` only (depcruise:
 * dag-jobs-imports-config).
 */
function renderJobTemplate(name: string): string {
  const camel = toCamelCase(name);
  return `import { inngest } from "../client";

const ${camel}Event = "app/${name}.requested" as const;

export const ${camel} = inngest.createFunction(
  { id: "${name}", triggers: [{ event: ${camel}Event }] },
  async ({ step }) => {
    // TODO: implement the job body. The triggering payload is available as
    // \`event.data\` (destructure \`event\` above once you define its shape) — one
    // \`step.run\` per side effect keeps failures independently retryable.
    await step.run("do-work", async () => {
      // TODO: real work goes here.
    });
  },
);
`;
}

/** Pure — exported for tests. Renders the full file content for `kind`/`name`. */
export function renderTemplate(kind: GenKind, name: string): string {
  switch (kind) {
    case "handler":
      return renderHandlerTemplate();
    case "page":
      return renderPageTemplate(name);
    case "job":
      return renderJobTemplate(name);
  }
}

export interface ResolveAppDirResult {
  ok: boolean;
  /** Repo-relative `apps/<name>` dir — present iff `ok`. */
  appDir?: string;
  /** Human-readable error, naming the candidates — present iff `!ok`. */
  message?: string;
}

/**
 * Resolves which `apps/<name>` directory a handler/page scaffold targets — replaces the
 * old hardcoded `apps/web` (npx-installer design spec §7: the factory is a multi-app
 * workspace, and the same `gen.ts` must serve every preset app and every single-app
 * installer output unmodified). Pure — exported for tests.
 *
 * - Exactly one directory under `apps/`: use it, no flag required.
 * - Zero or several: `appName` (the CLI's `--app <name>`) must name one of them, or this
 *   returns a clear error listing the candidates.
 */
export function resolveAppDir(rootDir: string, appName?: string): ResolveAppDirResult {
  const appsRoot = path.join(rootDir, "apps");

  let candidates: string[];
  try {
    candidates = readdirSync(appsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    candidates = [];
  }

  if (appName !== undefined) {
    if (!candidates.includes(appName)) {
      const list = candidates.length > 0 ? candidates.join(", ") : "(none found)";
      return {
        ok: false,
        message: `No app named "${appName}" under apps/ — candidates: ${list}.`,
      };
    }
    return { ok: true, appDir: `apps/${appName}` };
  }

  if (candidates.length === 1) {
    return { ok: true, appDir: `apps/${candidates[0]}` };
  }

  if (candidates.length === 0) {
    return { ok: false, message: "No app directories found under apps/." };
  }

  return {
    ok: false,
    message:
      `Multiple app directories found under apps/ (${candidates.join(", ")}) — pass ` +
      "--app <name> to choose one.",
  };
}

/**
 * Pure — exported for tests. Repo-relative target path for `kind`/`name`. `appDir` (an
 * `apps/<name>` dir from `resolveAppDir`) scopes handler/page targets; job scaffolds
 * always land in packages/jobs regardless of `appDir`.
 */
export function targetPath(kind: GenKind, name: string, appDir: string): string {
  switch (kind) {
    case "handler":
      return `${appDir}/app/api/${name}/route.ts`;
    case "page":
      return `${appDir}/app/[locale]/${name}/page.tsx`;
    case "job":
      return `packages/jobs/src/functions/${name}.ts`;
  }
}

/**
 * `gen page <name>` collision check (plan §J.12.9; re-pathed under `[locale]` per the
 * i18n plan §2.6 — every preset page moved under `app/[locale]/`): a plain
 * `<appDir>/app/[locale]/<name>/page.tsx` would otherwise silently coexist with the SAME
 * route already served from a route group (e.g. `(auth)/login`) — Next only catches the
 * duplicate at `next build`. Single-level scan of parenthesized dirs directly under
 * `<appDir>/app/[locale]`. Returns the repo-relative path of the colliding file, or
 * `null`.
 */
function findPageCollision(rootDir: string, name: string, appDir: string): string | null {
  const pagesRoot = path.join(rootDir, appDir, "app", "[locale]");

  const direct = path.join(pagesRoot, name, "page.tsx");
  if (existsSync(direct)) return `${appDir}/app/[locale]/${name}/page.tsx`;

  let groups: string[];
  try {
    groups = readdirSync(pagesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\(.+\)$/.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return null;
  }

  for (const group of groups) {
    const candidate = path.join(pagesRoot, group, name, "page.tsx");
    if (existsSync(candidate)) return `${appDir}/app/[locale]/${group}/${name}/page.tsx`;
  }

  return null;
}

export interface WriteScaffoldResult {
  ok: boolean;
  messages: string[];
}

/**
 * Pure fs side effect — exported for tests. Never overwrites an existing target
 * (handler/job: direct path; page: route-group-aware, `findPageCollision`). Never
 * `realpath`s `rootDir` (opt-23) — threaded verbatim into `path.join`.
 *
 * `appName` (the CLI's `--app <name>`) scopes handler/page targets via `resolveAppDir`;
 * ignored for `job` (packages/jobs is never app-scoped).
 */
export function writeScaffold(
  rootDir: string,
  kind: GenKind,
  name: string,
  appName?: string,
): WriteScaffoldResult {
  if (!isValidName(name)) {
    return {
      ok: false,
      messages: [
        `Invalid name "${name}" — must match ^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$ (lowercase, ` +
          "single kebab-case segment, no leading, trailing, or doubled hyphens).",
      ],
    };
  }

  let appDir = "";
  if (kind !== "job") {
    const resolved = resolveAppDir(rootDir, appName);
    if (!resolved.ok || resolved.appDir === undefined) {
      return { ok: false, messages: [resolved.message ?? "Could not resolve an app directory."] };
    }
    appDir = resolved.appDir;
  }

  const relTarget = targetPath(kind, name, appDir);
  const absTarget = path.join(rootDir, relTarget);

  const collision = kind === "page" ? findPageCollision(rootDir, name, appDir) : null;
  if (collision !== null) {
    return { ok: false, messages: [`Refusing to overwrite — ${collision} already exists.`] };
  }
  if (kind !== "page" && existsSync(absTarget)) {
    return { ok: false, messages: [`Refusing to overwrite — ${relTarget} already exists.`] };
  }

  mkdirSync(path.dirname(absTarget), { recursive: true });
  writeFileSync(absTarget, renderTemplate(kind, name), "utf8");

  const messages = [`Created ${relTarget}`];

  if (kind === "job") {
    const camel = toCamelCase(name);
    messages.push(
      "Register it in packages/jobs/src/functions/index.ts:",
      `  import { ${camel} } from "./${name}";`,
      `  and add ${camel} to the functions array.`,
    );
  }

  return { ok: true, messages };
}

interface ParsedCliArgs {
  positional: string[];
  appName: string | undefined;
  /** True when `--app` was given with no following value (e.g. as the last argv element). */
  appMissingValue: boolean;
}

/**
 * Pulls `--app <name>` out of the argv tail, leaving the positional args in order. Pure —
 * exported for tests. `--app` given as the last argv element has no value to take, so it's
 * flagged via `appMissingValue` rather than silently falling back to auto-detection.
 */
export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const positional: string[] = [];
  let appName: string | undefined;
  let appMissingValue = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--app") {
      if (i + 1 >= argv.length) {
        appMissingValue = true;
      } else {
        appName = argv[i + 1];
        i++;
      }
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, appName, appMissingValue };
}

const __filename = fileURLToPath(import.meta.url);
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);

if (invokedDirectly) {
  const { positional, appName, appMissingValue } = parseCliArgs(process.argv.slice(2));
  const [kindArg, nameArg] = positional;

  if (
    appMissingValue ||
    kindArg === undefined ||
    nameArg === undefined ||
    !KINDS.includes(kindArg as GenKind)
  ) {
    console.error("Usage: pnpm gen <handler|page|job> <name> [--app <name>]");
    process.exit(1);
  } else {
    // pnpm always runs root-level scripts from the repo root.
    const rootDir = process.cwd();
    const result = writeScaffold(rootDir, kindArg as GenKind, nameArg, appName);
    for (const message of result.messages) {
      console.log(result.ok ? message : `✗ ${message}`);
    }
    if (!result.ok) process.exit(1);
  }
}
