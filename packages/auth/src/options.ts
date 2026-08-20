/**
 * Pure derivation of Better Auth's provider configuration from raw env + capabilities.
 * No `process.env` reads — every input arrives as a parameter (mirrors
 * `@factory/config`'s own pure derivation functions, e.g. `deriveCapabilities`), which
 * keeps this fully unit-testable and safe to call from anywhere, including the login
 * page's server component (`deriveAuthOptions` decides OAuth button visibility
 * server-side — see plan C.5/C.6).
 *
 * `RawEnv`/`Capabilities` are imported as types only. Under `verbatimModuleSyntax`, a
 * type-only import is fully erased at compile time — it never resolves at runtime — so
 * this stays safe even though `@factory/config`'s "." entry starts with
 * `import "server-only"`.
 */
import type { Capabilities, RawEnv } from "@factory/config";

export type SocialProviderName = "google" | "github";

export interface SocialProviderCredentials {
  clientId: string;
  clientSecret: string;
}

export interface SocialProviders {
  google?: SocialProviderCredentials;
  github?: SocialProviderCredentials;
}

/** Which email-dependent auth features are live (plan E.9.6) — decided server-side so the
 * web layer never has to guess or read a capability itself. Both flags track the same
 * signal (`capabilities.email !== "disabled"`) but are kept as two fields, not one, since
 * they gate distinct UI affordances (a "check your email" pending state vs. a magic-link
 * entry point) that could in principle diverge later. */
export interface AuthEmailFeatures {
  verification: boolean;
  magicLink: boolean;
}

export interface AuthOptions {
  /**
   * Capability-driven as of M4 (spec §5.2, plan E.9): `true` whenever the email service is
   * enabled (secure default — verify before granting a session), `false` when email is
   * `disabled` so auth never deadlocks on an optional service.
   */
  requireEmailVerification: boolean;
  /** Non-optional (E.9.6) — the web layer decides UI (verify-pending state, magic-link
   * entry point) from this rather than reading capabilities itself. */
  email: AuthEmailFeatures;
  socialProviders: SocialProviders;
  enabledProviders: SocialProviderName[];
}

/**
 * A social provider is enabled iff BOTH its client ID and client secret are present —
 * never just one. Email verification and magic-link are both capability-driven: live
 * whenever `capabilities.email !== "disabled"` (spec §5.2, plan E.9.6).
 */
export function deriveAuthOptions(env: RawEnv, capabilities: Capabilities): AuthOptions {
  const emailEnabled = capabilities.email !== "disabled";

  const socialProviders: SocialProviders = {};
  const enabledProviders: SocialProviderName[] = [];

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
    enabledProviders.push("google");
  }

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    };
    enabledProviders.push("github");
  }

  return {
    requireEmailVerification: emailEnabled,
    email: { verification: emailEnabled, magicLink: emailEnabled },
    socialProviders,
    enabledProviders,
  };
}
