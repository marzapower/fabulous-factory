import { getCapabilities, getEnv } from "@factory/config";

/**
 * Server-side-only error capture (plan E.3 as corrected by E.9.3): `@sentry/node`, NOT
 * `@sentry/nextjs` — no build-plugin, no `withSentryConfig`, no `next.config` wrapping,
 * no client-side capture / source maps in v1 (those are an M10-guide follow-up, run via
 * the Sentry wizard).
 *
 * `@sentry/node` is imported ONLY via the guarded `await import(...)` below, and only
 * from inside `ensureSentryInitialized`, which is only ever reached once
 * `getCapabilities().errors === "sentry"` (i.e. `SENTRY_DSN` is present) has already been
 * checked by the exported functions. When the errors capability is `"disabled"`,
 * `captureException`/`captureMessage` return before touching `ensureSentryInitialized`
 * at all — so no Sentry module code is ever loaded, matching the "no vendor SDK executes
 * when disabled" contract (spec §2).
 */

type SentryModule = typeof import("@sentry/node");

// Module-singleton init promise. Memoizing the PROMISE (not just a "did we init" flag)
// is what makes this safe under concurrent callers: every call to `captureException`/
// `captureMessage` that lands before init has finished chains its `.then` onto this same
// promise, so Sentry.init() is guaranteed to run to completion — via one single dynamic
// import — before any queued capture callback fires. No calls are lost to a race between
// "is Sentry ready yet" and "start initializing it".
let sentryReady: Promise<SentryModule | undefined> | undefined;

function ensureSentryInitialized(): Promise<SentryModule | undefined> {
  if (!sentryReady) {
    sentryReady = import("@sentry/node")
      .then((Sentry) => {
        Sentry.init({ dsn: getEnv().SENTRY_DSN });
        return Sentry;
      })
      .catch((error: unknown) => {
        // Reset so a transient failure (e.g. the dynamic import itself failing) doesn't
        // permanently wedge this package into a state where every future call silently
        // no-ops forever — the next capture call gets to retry the import+init.
        sentryReady = undefined;
        console.error("[@factory/observability] failed to initialize @sentry/node", error);
        return undefined;
      });
  }
  return sentryReady;
}

/**
 * Reports an exception to Sentry. No-ops (and loads no `@sentry/node` code) when the
 * `errors` capability is `"disabled"`. Fire-and-forget by design — callers never await
 * error reporting; a call made before Sentry has finished initializing is queued onto the
 * shared init promise, so it still reports once init completes.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (getCapabilities().errors === "disabled") return;

  void ensureSentryInitialized().then((Sentry) => {
    Sentry?.captureException(err, context ? { extra: context } : undefined);
  });
}

/**
 * Reports a message to Sentry at the given severity (defaults to `"info"`). Same
 * disabled-no-op and queued-before-ready behavior as `captureException`.
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
): void {
  if (getCapabilities().errors === "disabled") return;

  void ensureSentryInitialized().then((Sentry) => {
    Sentry?.captureMessage(message, level);
  });
}
