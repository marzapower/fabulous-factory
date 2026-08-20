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

export interface AuthOptions {
  /**
   * Always `false` in M2 — email verification posture (spec §5.2) ships in M4, which is
   * when this starts reflecting real state. Kept as a field now (rather than omitted) so
   * the web agent's UI can read it directly instead of hardcoding the M2 default itself.
   */
  requireEmailVerification: boolean;
  socialProviders: SocialProviders;
  enabledProviders: SocialProviderName[];
}

/**
 * A social provider is enabled iff BOTH its client ID and client secret are present —
 * never just one. `capabilities` is accepted for signature symmetry with the rest of the
 * config package's pure derivation functions; auth itself is always-on and does not yet
 * depend on any capability flag (M2).
 */
export function deriveAuthOptions(env: RawEnv, capabilities: Capabilities): AuthOptions {
  void capabilities;

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
    // TODO(M4): flip once email verification posture (spec §5.2) ships.
    requireEmailVerification: false,
    socialProviders,
    enabledProviders,
  };
}
