import { getInitializedPostHogClient } from "./track";

/**
 * Flushes and stops the posthog-node singleton, for use at route/process teardown (e.g. a
 * `waitUntil`/`after()` callback, or a graceful-shutdown hook). No-ops when analytics is
 * disabled or the singleton was never created (no event has been tracked yet this
 * process) — importing/calling this never triggers the guarded dynamic import itself.
 */
export async function flushAnalytics(): Promise<void> {
  const client = getInitializedPostHogClient();
  if (!client) return;
  await client.shutdown();
}
