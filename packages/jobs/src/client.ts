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

export const inngest = new Inngest({
  id: "fabulous-factory",
  eventKey: env.INNGEST_EVENT_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
  isDev,
});
