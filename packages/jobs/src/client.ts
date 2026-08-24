import { Inngest } from "inngest";

import { getCapabilities, getEnv } from "@factory/config";

/**
 * Module-scope Inngest client (plan G.4/G.10.16). `getEnv()` runs at import time — the
 * same build-time constraint `@factory/db`'s `getDb()` already imposes (plan C.4: a
 * syntactically valid `DATABASE_URL` must exist at `next build`) — this adds no NEW
 * constraint, it just rides along on one that already exists.
 *
 * Keys are passed explicitly (`undefined` is fine — the SDK degrades per plan G.1): this
 * package's code never reads `process.env` itself, only `@factory/config`'s validated env.
 *
 * `isDev` requires BOTH `INNGEST_DEV === "1"` AND the `jobs` capability itself having
 * resolved to `"inngest"` (review fix) — `getCapabilities()`'s `deriveJobs` already
 * ignores `INNGEST_DEV` in production, so gating on the capability (not the raw env var)
 * means a stray `INNGEST_DEV=1` left over from a dev `.env` copied to prod can never flip
 * `serve()` into Inngest's signature-skipping dev mode: the capability is `"disabled"`
 * there, `isDev` is forced `false`, and the mounted `/api/inngest` route degrades per
 * plan G.1 instead of accepting unsigned requests. `INNGEST_DEV=0` (or any other value)
 * stays cloud mode regardless. Under v4's cloud-default (plan G.1), an accidental
 * truthy-string check here would silently flip local dev into "cloud mode with no dev
 * server", so the comparison is exact by design.
 *
 * Importing this module is side-effect-free beyond `getEnv()`/`getCapabilities()`/
 * `new Inngest(...)` — no network calls, no timers (plan G.1: ~44ms measured for the bare
 * `inngest` import).
 */
const env = getEnv();
const isDev = getCapabilities().jobs === "inngest" && env.INNGEST_DEV === "1";

/**
 * Every external call carries an explicit timeout and a bounded retry (conventions.md
 * security posture). The installed `inngest` v4 `ClientOptions` type exposes no
 * timeout/retry knob directly on the client — but it DOES expose a `fetch` override
 * (`typeof fetch`), and every HTTP call the client makes (send, signals, the internal
 * fetch used by `serve()`) is routed through `this.fetch`, so overriding it here bounds
 * ALL of them, not just `send()`. `AbortSignal.timeout(10_000)` supplies the bound;
 * `AbortSignal.any` composes it with any signal the SDK itself already attaches to a
 * given call (e.g. `sendSignal`'s cancellation signal) so neither bound is silently
 * dropped.
 *
 * No retry is added at this layer: `inngest.send()` already wraps its own HTTP call in
 * an internal bounded retry (`retryWithBackoff`), and Inngest's own step/function retry
 * semantics (`retries` on `createFunction`, e.g. `packages/config/scripts/gen.ts`'s job
 * template) are the bounded-retry story for job execution. Adding a second, transport-
 * level retry here would risk double-sending an event or double-invoking a step.
 */
export function makeTimeoutFetch(ms: number): typeof fetch {
  return (input: Parameters<typeof fetch>[0], init: RequestInit = {}): Promise<Response> => {
    const bound = AbortSignal.timeout(ms);
    const signal = init.signal ? AbortSignal.any([init.signal, bound]) : bound;
    return fetch(input, { ...init, signal });
  };
}

export const timeoutFetch = makeTimeoutFetch(10_000);

export const inngest = new Inngest({
  id: "fabulous-factory",
  eventKey: env.INNGEST_EVENT_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
  isDev,
  fetch: timeoutFetch,
});
