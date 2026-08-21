#!/usr/bin/env node
/**
 * `pnpm gen <handler|page|job> <name>` — deterministic scaffolds stamped from inline
 * template literals (plan §J.5): zero stray template files, typechecked as plain
 * strings, and every generated file passes `factory/no-raw-handler` and the boundary
 * rules by construction.
 *
 * `<name>` must be a single kebab-case segment (`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`, plan
 * §J.12.8) — no slashes, so a scaffold can never be written outside its target
 * directory by construction. Refuses to overwrite an existing target.
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
 * `apps/web/app/api/<name>/route.ts` — a direct `defineHandler(...)` call (passes
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

/** `apps/web/app/<name>/page.tsx` — minimal server component, layout-consistent wrapper. */
function renderPageTemplate(name: string): string {
  const pascal = toPascalCase(name);
  const title = toTitleCase(name);
  return `export default function ${pascal}Page() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">${title}</h1>
      <p className="mt-2 text-lg leading-relaxed text-muted-foreground">
        {/* TODO: replace this placeholder copy. */}
      </p>
    </main>
  );
}
`;
}

/**
 * `packages/jobs/src/functions/<name>.ts` — event-triggered Inngest function. Event
 * name is `app/<name>.requested` (opt-18: matches the `namespace/entity.action.state`
 * idiom of `demo/monitor.check.requested`, packages/jobs/src/events.ts), with the
 * const defined right here rather than in the shared `events.ts` (that file is the
 * demo namespace's own registry, plan §J.12.10). Imports only `../client` — jobs may
 * never import `@factory/auth` (depcruise: dag-jobs-imports-config-db-core-llm-email-
 * analytics-observability).
 */
function renderJobTemplate(name: string): string {
  const camel = toCamelCase(name);
  return `import { inngest } from "../client";

const ${camel}Event = "app/${name}.requested" as const;

export const ${camel} = inngest.createFunction(
  { id: "${name}", triggers: [{ event: ${camel}Event }] },
  async ({ step }) => {
    // TODO: implement the job body. The triggering payload is available as
    // \`event.data\` (destructure \`event\` above once you define its shape, following
    // packages/jobs/src/events.ts's pattern) — one \`step.run\` per side effect keeps
    // failures independently retryable.
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

/** Pure — exported for tests. Repo-relative target path for `kind`/`name`. */
export function targetPath(kind: GenKind, name: string): string {
  switch (kind) {
    case "handler":
      return `apps/web/app/api/${name}/route.ts`;
    case "page":
      return `apps/web/app/${name}/page.tsx`;
    case "job":
      return `packages/jobs/src/functions/${name}.ts`;
  }
}

/**
 * `gen page <name>` collision check (plan §J.12.9): a plain `apps/web/app/<name>/
 * page.tsx` would otherwise silently coexist with the SAME route already served from a
 * route group (e.g. `(auth)/login`) — Next only catches the duplicate at `next build`.
 * Single-level scan of parenthesized dirs directly under `apps/web/app`. Returns the
 * repo-relative path of the colliding file, or `null`.
 */
function findPageCollision(rootDir: string, name: string): string | null {
  const appDir = path.join(rootDir, "apps/web/app");

  const direct = path.join(appDir, name, "page.tsx");
  if (existsSync(direct)) return `apps/web/app/${name}/page.tsx`;

  let groups: string[];
  try {
    groups = readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\(.+\)$/.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return null;
  }

  for (const group of groups) {
    const candidate = path.join(appDir, group, name, "page.tsx");
    if (existsSync(candidate)) return `apps/web/app/${group}/${name}/page.tsx`;
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
 */
export function writeScaffold(rootDir: string, kind: GenKind, name: string): WriteScaffoldResult {
  if (!isValidName(name)) {
    return {
      ok: false,
      messages: [
        `Invalid name "${name}" — must match ^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$ (lowercase, ` +
          "single kebab-case segment, no leading, trailing, or doubled hyphens).",
      ],
    };
  }

  const relTarget = targetPath(kind, name);
  const absTarget = path.join(rootDir, relTarget);

  const collision = kind === "page" ? findPageCollision(rootDir, name) : null;
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

const __filename = fileURLToPath(import.meta.url);
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);

if (invokedDirectly) {
  const [, , kindArg, nameArg] = process.argv;

  if (kindArg === undefined || nameArg === undefined || !KINDS.includes(kindArg as GenKind)) {
    console.error("Usage: pnpm gen <handler|page|job> <name>");
    process.exit(1);
  } else {
    // pnpm always runs root-level scripts from the repo root.
    const rootDir = process.cwd();
    const result = writeScaffold(rootDir, kindArg as GenKind, nameArg);
    for (const message of result.messages) {
      console.log(result.ok ? message : `✗ ${message}`);
    }
    if (!result.ok) process.exit(1);
  }
}
