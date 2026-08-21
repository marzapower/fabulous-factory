import { resolveAppUrl } from "./app-url";
import type { Capabilities, ServiceName } from "./capabilities";
import type { RawEnv } from "./registry";

/**
 * Config that is allowed to cross the server → client boundary.
 *
 * ON/OFF BOOLEANS ONLY. Adapter identities ('stripe', 'sentry', 'resend', …) are recon
 * data for an attacker (spec §12) and must never appear here — only whether a capability
 * is enabled, plus the small set of genuinely non-secret publishables (e.g. the PostHog
 * project key, which is designed to be public).
 */
export interface ClientConfig {
  capabilities: Record<ServiceName, boolean>;
  /** Defaults to "http://localhost:3000" when APP_URL is unset. */
  appUrl: string;
  posthog: { key: string; host: string } | null;
}

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/** Pure. Never reads `process.env` — both inputs arrive as parameters. */
export function buildClientConfig(env: RawEnv, capabilities: Capabilities): ClientConfig {
  const capabilityFlags = Object.fromEntries(
    (Object.keys(capabilities) as ServiceName[]).map((service) => [
      service,
      capabilities[service] !== "disabled",
    ]),
  ) as Record<ServiceName, boolean>;

  const posthog =
    capabilities.analytics === "posthog" && env.POSTHOG_KEY
      ? { key: env.POSTHOG_KEY, host: env.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST }
      : null;

  return {
    capabilities: capabilityFlags,
    appUrl: resolveAppUrl(env.APP_URL),
    posthog,
  };
}
