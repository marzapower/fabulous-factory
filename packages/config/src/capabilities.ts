import {
  ENV_REGISTRY,
  type AppMode,
  type EnvVarName,
  type RawEnv,
  type ServiceGroup,
} from "./registry";

export interface Capabilities {
  billing: "stripe" | "disabled";
  llm: "local" | "openrouter" | "direct" | "disabled";
  email: "resend" | "console" | "disabled";
  jobs: "inngest" | "disabled";
  analytics: "posthog" | "disabled";
  errors: "sentry" | "disabled";
}

export type ServiceName = keyof Capabilities;

type LlmProfile = Capabilities["llm"];

const LLM_PROFILES: readonly LlmProfile[] = ["local", "openrouter", "direct", "disabled"];

function isLlmProfile(value: string | undefined): value is LlmProfile {
  return value !== undefined && (LLM_PROFILES as readonly string[]).includes(value);
}

function hasCredentialsFor(profile: LlmProfile, env: RawEnv): boolean {
  switch (profile) {
    case "openrouter":
      return Boolean(env.OPENROUTER_API_KEY);
    case "direct":
      return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
    case "local":
      return Boolean(env.LLM_LOCAL_BASE_URL);
    case "disabled":
      return true;
  }
}

/**
 * True iff every `"allOf"`-combinator var in `group` (per `ENV_REGISTRY`, plan G.3.3
 * follow-up) is present — the single AND-group check `deriveBilling`/`deriveJobs` both
 * delegate to instead of hand-listing var names, so the registry's `combinator` field
 * stays the one place that AND shape is expressed. `false` when the group has no
 * `"allOf"` vars at all (an empty AND is never "satisfied").
 */
function allOfSatisfied(group: ServiceGroup, env: RawEnv): boolean {
  const vars = ENV_REGISTRY.filter((v) => v.group === group && v.combinator === "allOf");
  return vars.length > 0 && vars.every((v) => Boolean(env[v.name as EnvVarName]));
}

/** Every `"oneOf"`-combinator var name in `group` — standalone alternatives to its AND-group. */
function oneOfVarNames(group: ServiceGroup): readonly EnvVarName[] {
  return ENV_REGISTRY.filter((v) => v.group === group && v.combinator === "oneOf").map(
    (v) => v.name,
  );
}

function deriveBilling(env: RawEnv): Capabilities["billing"] {
  if (env.BILLING_PROVIDER === "disabled") return "disabled";
  return allOfSatisfied("billing", env) ? "stripe" : "disabled";
}

function deriveLlm(env: RawEnv): Capabilities["llm"] {
  // An explicit LLM_PROFILE wins, but only when its credentials are actually present —
  // otherwise it degrades to 'disabled' (doctor is responsible for warning about this).
  if (isLlmProfile(env.LLM_PROFILE)) {
    return hasCredentialsFor(env.LLM_PROFILE, env) ? env.LLM_PROFILE : "disabled";
  }

  if (env.OPENROUTER_API_KEY) return "openrouter";
  if (env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY) return "direct";
  if (env.LLM_LOCAL_BASE_URL) return "local";
  return "disabled";
}

function deriveEmail(env: RawEnv, mode: AppMode): Capabilities["email"] {
  if (env.RESEND_API_KEY) return "resend";
  // 'console' is a dev-only convenience — unconfigured email in production must never
  // silently pretend delivery succeeded.
  if (mode === "development") return "console";
  return "disabled";
}

function deriveJobs(env: RawEnv, mode: AppMode): Capabilities["jobs"] {
  // FINAL rule (plan G.2.3 + G.10.12), refined by the review fix below — retires M1's
  // provisional "development implies inngest": Inngest v4 defaults to CLOUD mode, so
  // without INNGEST_DEV=1 the client would throw on send() rather than talk to a local
  // dev server. Enabled iff either both cloud keys are present (any mode, the "allOf"
  // group in the registry) or INNGEST_DEV (the registry's lone "oneOf" var for this
  // group) is the exact string "1" AND mode isn't production — "0", any other value, or
  // a stray dev-only var surviving into a production env (e.g. a dev .env copied to
  // prod) all stay disabled. This also gates `client.ts`'s `isDev` flag: a production env
  // can never end up in Inngest's signature-skipping dev mode. The AND-group presence
  // check comes from `ENV_REGISTRY` via `allOfSatisfied`; the "=== '1'" value semantics
  // for the one "oneOf" var (INNGEST_DEV) are business logic the registry's combinator
  // can't express on its own, so they stay explicit here.
  if (allOfSatisfied("jobs", env)) return "inngest";
  const devVar = oneOfVarNames("jobs")[0];
  if (devVar && env[devVar] === "1" && mode !== "production") return "inngest";
  return "disabled";
}

function deriveAnalytics(env: RawEnv): Capabilities["analytics"] {
  return env.POSTHOG_KEY ? "posthog" : "disabled";
}

function deriveErrors(env: RawEnv): Capabilities["errors"] {
  return env.SENTRY_DSN ? "sentry" : "disabled";
}

/**
 * Pure derivation of the capability map from raw env values and the app mode. No
 * `process.env` reads — every input arrives as a parameter, which keeps this fully
 * unit-testable and safe to call from `doctor` without ever throwing.
 */
export function deriveCapabilities(env: RawEnv, mode: AppMode): Capabilities {
  return {
    billing: deriveBilling(env),
    llm: deriveLlm(env),
    email: deriveEmail(env, mode),
    jobs: deriveJobs(env, mode),
    analytics: deriveAnalytics(env),
    errors: deriveErrors(env),
  };
}
