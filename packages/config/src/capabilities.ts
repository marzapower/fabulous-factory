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
  // Provisional rule, refined in M6: full credentials always enable Inngest; in
  // development it also enables against the local `inngest dev` server (degrades
  // gracefully if that server isn't running — M6 owns the final semantics).
  if (env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY) return "inngest";
  if (mode === "development") return "inngest";
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
