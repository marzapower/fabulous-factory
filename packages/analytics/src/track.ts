import { getCapabilities, getEnv } from "@factory/config";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/** Arbitrary event properties, plus the PostHog `distinctId` every capture requires. */
export type TrackOptions = { distinctId: string } & Record<string, unknown>;

/**
 * Lazy module-singleton for the posthog-node client, plus the in-flight init promise that
 * guards against creating two clients when `track()`/`isFeatureEnabled()` race on first
 * use. Both fields are typed via `import("posthog-node").PostHog` — a type-only reference
 * that `verbatimModuleSyntax` erases at compile time, so declaring it here adds no runtime
 * dependency on posthog-node. The disabled path (`getCapabilities().analytics !==
 * "posthog"`) never calls `getPostHogClient()`, so `await import("posthog-node")` never
 * runs and the SDK is never loaded into the process.
 */
let posthogClient: import("posthog-node").PostHog | undefined;
let posthogClientPromise: Promise<import("posthog-node").PostHog> | undefined;

async function getPostHogClient(): Promise<import("posthog-node").PostHog> {
  if (posthogClient) return posthogClient;
  if (!posthogClientPromise) {
    posthogClientPromise = (async () => {
      const { PostHog } = await import("posthog-node");
      const env = getEnv();
      const client = new PostHog(env.POSTHOG_KEY ?? "", {
        host: env.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST,
        // Every external call carries an explicit timeout and a bounded retry
        // (conventions.md security posture). `requestTimeout` is stated explicitly even
        // though 10s is already posthog-node's own default — the SDK's `fetchRetryCount`
        // (default 3) already bounds retries, so no separate override is needed there.
        requestTimeout: 10_000,
      });
      posthogClient = client;
      return client;
    })().catch((error: unknown) => {
      // Review fix (M5 cycle): without this reset a single transient import/init failure
      // would stay cached as a rejected promise for the process lifetime, permanently
      // wedging analytics — same reason packages/observability's errors.ts resets
      // `sentryReady` in its own .catch.
      posthogClientPromise = undefined;
      throw error;
    });
  }
  return posthogClientPromise;
}

/**
 * Exposes the already-initialized singleton (or `undefined` if analytics has never been
 * used this process, or is disabled) for `shutdown.ts` to flush/stop. Reading this getter
 * must never itself trigger the guarded dynamic import — it only returns what
 * `getPostHogClient()` has already assigned.
 */
export function getInitializedPostHogClient(): import("posthog-node").PostHog | undefined {
  return posthogClient;
}

/**
 * Captures an analytics event. Fire-and-forget by design (E.9.10): posthog-node's
 * `.capture()` queues the event internally and flushes on its own schedule (or via
 * `flushAnalytics()` at route/process teardown) — this function does not await delivery
 * and never rejects the caller's control flow.
 *
 * No-ops (and loads no posthog-node code) when analytics is disabled.
 */
export function track(event: string, opts: TrackOptions): void {
  if (getCapabilities().analytics !== "posthog") return;

  const { distinctId, ...properties } = opts;
  void getPostHogClient()
    .then((client) => {
      client.capture({ distinctId, event, properties });
    })
    // Fire-and-forget: swallow a failed SDK load / capture so it can't surface as a
    // process-level unhandledRejection. Analytics is best-effort and never blocks or
    // crashes the request.
    .catch((error) => {
      console.error("[@factory/analytics] track failed:", error);
    });
}

/**
 * Evaluates a boolean feature flag. Async because it may need to lazily create the
 * singleton and call PostHog's flags API — `isFeatureEnabled`/`getFeatureFlag` both work
 * with the project key alone (a `personalApiKey` is only needed for local evaluation).
 * PostHog also ships a newer `evaluateFlags` API that returns richer flag payloads/reasons
 * in one batched call; `isFeatureEnabled` is kept here as the simplest fit for a single
 * boolean gate — reach for `evaluateFlags` directly on the client if you need more.
 *
 * Returns `false` when analytics is disabled (never loads posthog-node) AND on any
 * SDK load/evaluation failure (review fix, M5 cycle): analytics is best-effort by
 * contract, so a broken flag lookup must degrade to "flag off", never become a thrown
 * error inside a route handler.
 */
export async function isFeatureEnabled(key: string, distinctId: string): Promise<boolean> {
  if (getCapabilities().analytics !== "posthog") return false;

  try {
    const client = await getPostHogClient();
    return (await client.isFeatureEnabled(key, distinctId)) ?? false;
  } catch (error) {
    console.error("[@factory/analytics] isFeatureEnabled failed:", error);
    return false;
  }
}
