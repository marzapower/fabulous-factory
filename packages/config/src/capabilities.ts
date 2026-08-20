import type { AppMode, RawEnv } from "./registry";

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

function deriveBilling(env: RawEnv): Capabilities["billing"] {
  if (env.BILLING_PROVIDER === "disabled") return "disabled";
  if (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) return "stripe";
  return "disabled";
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
  // dev server. Enabled iff either both cloud keys are present (any mode) or
  // INNGEST_DEV is the exact string "1" AND mode isn't production — "0", any other
  // value, or a stray dev-only var surviving into a production env (e.g. a dev .env
  // copied to prod) all stay disabled. This also gates `client.ts`'s `isDev` flag: a
  // production env can never end up in Inngest's signature-skipping dev mode.
  if (env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY) return "inngest";
  if (env.INNGEST_DEV === "1" && mode !== "production") return "inngest";
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
