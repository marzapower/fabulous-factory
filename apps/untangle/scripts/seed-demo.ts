#!/usr/bin/env tsx
/**
 * `docker compose up`'s `seed` service — hands a visitor a running, already-populated
 * Untangle instance instead of an empty dashboard that only fills in after a manual
 * sign-up + paste.
 *
 * Lives here, not in `packages/untangle` or `packages/db`, because it needs BOTH
 * `@factory/auth` (to create the demo account through Better Auth's real sign-up API)
 * AND `@factory/untangle` (to run the demo capture through the real pipeline) — an edge
 * neither package's own DAG allowlist in `.dependency-cruiser.cjs` permits
 * (`dag-untangle-imports-config-db-core-llm-email-observability-jobs` excludes auth;
 * `dag-db-imports-only-config` excludes untangle). `apps/*` aren't bound by the
 * packages/* DAG's inter-package rules the same way — every preset app may import
 * anything — so this script is the one place both can legally meet.
 *
 * Two things happen, both idempotent (the compose `seed` service legitimately re-runs
 * this on every `up`):
 *
 *   1. A demo account is created through Better Auth's REAL server-side sign-up API
 *      (`auth.api.signUpEmail`) — same idiom `packages/auth/src/session.ts` documents
 *      for `auth.api.getSession` (calling `auth.api.*` directly, outside a request
 *      context). Password hashing goes through Better Auth itself; nothing here touches
 *      a raw insert or a hash function. `formCsrfMiddleware` (better-auth's CSRF guard on
 *      this endpoint) is a no-op when `ctx.request` is absent — verified against the
 *      installed better-auth 1.7.1 source (`dist/api/middlewares/origin-check.mjs`) — so
 *      calling `signUpEmail({ body })` with no `headers` is the correct standalone shape,
 *      not a workaround. Idempotent via lookup-before-create: better-auth throws on a
 *      duplicate email (e.g. the seed service ran once already, or raced another
 *      instance), so a raced create falls back to the lookup instead of failing the seed.
 *   2. `seedUntangleDemo(userId)` (`@factory/untangle`) runs one fixed, realistic sample
 *      capture through the real pipeline for that user — see that function's own doc
 *      comment for why it doesn't (and, under the DAG, can't) create the account itself.
 *
 * Runtime note: this is a plain Node/tsx script, not a Next.js request — every
 * `@factory/*` package this pulls in (auth/db/config/email/untangle/core/…) guards its
 * public entry with `import "server-only"`, which throws unless resolved under Next's
 * build-time "react-server" export condition. That's a false positive here, not a real
 * violation — a one-shot administrative script is unambiguously server context, just not
 * a bundled one. The image this runs in (`docker-compose.yml`'s `seed` service, `runner`
 * target) neutralizes it by overwriting the installed `server-only` package's `index.js`
 * with the same no-op content it already ships as its own `react-server` condition target
 * (`node_modules/server-only/empty.js`) — see the Dockerfile's `runner` stage for the
 * exact step and why it has zero effect on the already-built Next.js app (that guard is a
 * build-time/webpack concern; nothing in the compiled standalone server requires
 * `server-only` at runtime). Setting Node's `--conditions=react-server` instead (the more
 * obvious-looking fix) was tried and rejected: it does silence the poison, but it also
 * flips React's and Next's OWN conditional exports (`react-server` is React's real
 * condition for swapping in its Server-Components-only build, which has no
 * `createContext`), which then crashes the very first `next/navigation` import pulled in
 * transitively (`@factory/core`'s `define-action.ts` → `@factory/auth`'s public entry →
 * `session.ts` → `next/navigation`) — verified directly, not assumed.
 */
import { auth } from "@factory/auth";
import { DEMO_USER_EMAIL, findDemoUserId, seedUntangleDemo } from "@factory/untangle";

/** Must match verbatim — referenced from the README's demo-account section. */
const DEMO_USER_PASSWORD = "FabulousDemo123!";
const DEMO_USER_NAME = "Untangle Demo";

async function ensureDemoUser(): Promise<string> {
  const existing = await findDemoUserId();
  if (existing) return existing;

  try {
    const result = await auth.api.signUpEmail({
      body: { name: DEMO_USER_NAME, email: DEMO_USER_EMAIL, password: DEMO_USER_PASSWORD },
    });
    return result.user.id;
  } catch (error) {
    // Idempotency: better-auth throws on a duplicate email (e.g. the seed service ran
    // once already, or raced another instance) — fall back to the lookup instead of
    // failing the whole seed. Only swallow if the user genuinely exists now; a real
    // failure (bad DATABASE_URL, etc.) should still surface.
    const raced = await findDemoUserId();
    if (raced) return raced;
    throw error;
  }
}

async function main(): Promise<void> {
  const userId = await ensureDemoUser();
  await seedUntangleDemo(userId);
  // Deliberately not interpolating the email/password here — this line lands in
  // container/orchestrator logs. Credentials are documented in README instead.
  console.log("Demo account ready — see README for login details.");
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error: unknown) => {
    console.error("seed-demo failed:", error);
    process.exitCode = 1;
  });
