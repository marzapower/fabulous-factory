import { z } from "zod";

import { readMergedEnv } from "./env-file";
import { ENV_REGISTRY, type EnvVarName, type RawEnv } from "./registry";

// Vars whose value must be a well-formed URL when present. Not every var needs this —
// keep validation minimal and honest to what the app actually depends on.
const URL_FIELDS = new Set<EnvVarName>([
  "APP_URL",
  "LLM_LOCAL_BASE_URL",
  "POSTHOG_HOST",
  "INNGEST_BASE_URL",
]);

// A typo here (e.g. "Local", "openai") must surface as a validation error, not silently
// fall through — capabilities.ts's `deriveCapabilities` stays tolerant of unrecognized
// values (auto-detects instead), but this layer is where the operator gets told.
const LLM_PROFILE_VALUES = ["local", "openrouter", "direct", "disabled"] as const;

// Vars whose value must clear a minimum length (I.3.a) — rejects an obviously-too-short
// placeholder rather than letting it silently pass the bare "not empty" check every other
// var gets. `BETTER_AUTH_SECRET` is the only one today: 16 is a conservative floor under
// Better Auth's own expectations, well below the `openssl rand -hex 32` idiom the docs
// recommend (64 hex chars).
const MIN_LENGTH_FIELDS = new Map<EnvVarName, number>([["BETTER_AUTH_SECRET", 16]]);

const specByName = new Map(ENV_REGISTRY.map((spec) => [spec.name, spec] as const));

function fieldSchema(name: EnvVarName): z.ZodTypeAny {
  const spec = specByName.get(name)!;
  const minLength = MIN_LENGTH_FIELDS.get(name);
  const base =
    name === "LLM_PROFILE"
      ? z.enum(LLM_PROFILE_VALUES)
      : URL_FIELDS.has(name)
        ? z.url()
        : minLength !== undefined
          ? z.string().min(minLength, `must be at least ${minLength} characters`)
          : z.string().min(1, "must not be empty");
  return spec.required ? base : base.optional();
}

const envShape: Record<string, z.ZodTypeAny> = {};
for (const spec of ENV_REGISTRY) {
  envShape[spec.name] = fieldSchema(spec.name);
}
const envSchema = z.object(envShape);

/** Validated env: every registered var, `DATABASE_URL` narrowed to always present. */
export type Env = RawEnv & { DATABASE_URL: string };

export interface EnvIssue {
  name: string;
  message: string;
}

/** Thrown by `parseEnv`/`getEnv` — aggregates every invalid/missing var, never a bare zod error. */
export class EnvValidationError extends Error {
  readonly issues: readonly EnvIssue[];

  constructor(issues: readonly EnvIssue[]) {
    const body = issues.map((issue) => `  - ${issue.name}: ${issue.message}`).join("\n");
    super(`Invalid environment configuration:\n${body}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

/**
 * Pure — exported for tests. Validates a raw env-like object against `ENV_REGISTRY` and
 * throws a single aggregated `EnvValidationError` listing every bad var with its registry
 * description, never a bare zod stack.
 */
export function parseEnv(source: Partial<Record<EnvVarName, string | undefined>>): Env {
  const candidate: Record<string, string | undefined> = {};
  for (const spec of ENV_REGISTRY) {
    const raw = source[spec.name];
    // `NAME=` in a .env file parses to an empty string. For optional vars that means
    // "unset" (matches doctor.ts's treatment of the same file). Required vars stay
    // strict: an empty DATABASE_URL is still invalid, never silently "absent".
    candidate[spec.name] = !spec.required && raw === "" ? undefined : raw;
  }

  const result = envSchema.safeParse(candidate);
  if (!result.success) {
    const messagesByName = new Map<string, string[]>();
    for (const issue of result.error.issues) {
      const name = String(issue.path[0]);
      const list = messagesByName.get(name) ?? [];
      list.push(issue.message);
      messagesByName.set(name, list);
    }

    const issues: EnvIssue[] = [...messagesByName.entries()].map(([name, messages]) => ({
      name,
      message: `${specByName.get(name as EnvVarName)?.description ?? "Unknown variable"} (${messages.join("; ")})`,
    }));

    throw new EnvValidationError(issues);
  }

  return result.data as Env;
}

let cachedEnv: Env | undefined;

/**
 * Memoized. Reads the MERGED env view once per process: the repo-root `.env` file merged
 * UNDER real `process.env` (shell/platform vars always win), same as every Node script.
 *
 * This is deliberate: the documented quickstart puts `.env` at the workspace root (spec
 * §8.1), but Next.js only auto-loads env files from the app directory — and in dev it
 * evaluates routes in a worker where `next.config.ts` side effects don't propagate. Since
 * ALL env access already flows through this package (boundary rule §8.4), loading the
 * file here gives the app, the migrator, and doctor one identical env view with no
 * framework machinery. In production bundles the file simply doesn't exist and this
 * degrades to plain `process.env`. Throws `EnvValidationError`.
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = parseEnv(readMergedEnv());
  }
  return cachedEnv;
}
