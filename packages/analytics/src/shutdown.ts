import { getInitializedPostHogClient } from "./track";

/**
 * Flushes the posthog-node singleton's queued events, for use at route teardown (e.g. a
 * `waitUntil`/`after()` callback). Uses `flush()`, NOT `shutdown()` (review fix, M5
 * cycle): posthog-node documents shutdown() as once-per-process — calling it per request
 * permanently stops the feature-flag poller and races concurrent captures against the
 * drain loop. Process-exit cleanup belongs to a graceful-shutdown hook calling
 * `getInitializedPostHogClient()?.shutdown()` directly. No-ops when analytics is
 * disabled or the singleton was never created (no event has been tracked yet this
 * process) — importing/calling this never triggers the guarded dynamic import itself.
 */
export async function flushAnalytics(): Promise<void> {
  const client = getInitializedPostHogClient();
  if (!client) return;
  await client.flush();
}
