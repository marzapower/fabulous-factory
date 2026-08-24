/**
 * The Better Auth instance — Postgres via Drizzle, email/password always on, OAuth
 * providers derived from env (see `./options`).
 *
 * Module-scope instantiation is intentional (Better Auth's documented idiom: `export
 * const auth = betterAuth({...})`), but it has a build-time consequence recorded in plan
 * C.4: `app/api/auth/[...all]/route.ts` imports this module-scope instance, so
 * `next build`'s page-data collection now requires a syntactically valid `DATABASE_URL`
 * (the underlying `pg.Pool` never actually connects at build — see `@factory/db`'s
 * `getDb()`).
 *
 * `BETTER_AUTH_SECRET`: hard-required (≥16 chars) by `packages/config`'s env validation
 * since M8 — "pg + auth is the minimum" — so `Env["BETTER_AUTH_SECRET"]` is always a
 * string by the time this module runs; there is no dev-fallback or unset case to handle
 * here, in any environment.
 *
 * Email posture (spec §5.2, plan E.5/E.9): `requireEmailVerification` and the `magicLink`
 * plugin both follow `capabilities.email !== "disabled"` — verification is required (and
 * magic links are offered) whenever email is live, and both fall away when it's
 * `disabled` so auth never deadlocks on an optional service. `sendVerificationEmail`/
 * `sendMagicLink` call into `@factory/email`'s `send()`, which does its own render — this
 * module never imports `@react-email/render` itself and never renders at module init
 * (E.9.8): the plugin object/callbacks are assembled here, but `render()` only executes
 * inside a callback, at request time, once Better Auth actually invokes it.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";

import { getCapabilities, getEnv } from "@factory/config";
import { getDb, schema } from "@factory/db";
import { send, type SendResult } from "@factory/email";

import { deriveAuthOptions } from "./options";

/**
 * Review fix (M5 cycle): `send()` reports non-delivery as a typed result, and silently
 * discarding it here made Better Auth believe the email went out — the user sits on
 * "check your email" forever (e.g. RESEND_API_KEY set but EMAIL_FROM missing →
 * 'not-configured', or a provider outage → 'provider-error'). `console` is the dev
 * transport's honest "logged, not delivered" and must NOT fail the flow; anything else
 * undelivered throws so Better Auth surfaces an error instead of faking success.
 * (`disabled` can't reach here — both callers guard on the email capability.)
 */
function assertDelivered(what: string, result: SendResult): void {
  if (!result.delivered && result.reason !== "console") {
    throw new Error(`${what} not delivered (${result.reason})`);
  }
}

const env = getEnv();
const capabilities = getCapabilities();
const { socialProviders, email: emailFeatures } = deriveAuthOptions(env, capabilities);
const emailEnabled = capabilities.email !== "disabled";

/**
 * `TRUSTED_PROXIES` is a comma-separated list (registry.ts); Better Auth wants an array
 * of IP/CIDR strings. Trimmed and empty-entry-filtered so a trailing comma or stray
 * whitespace in the env value doesn't produce a bogus `""` entry. `undefined` (var unset,
 * or set but empty after trimming) when there's nothing to configure — `advanced` is then
 * omitted entirely below, so Better Auth falls through to its own default
 * (`trustedProxies` unset) exactly as it did before this var existed.
 */
const trustedProxies = env.TRUSTED_PROXIES?.split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

/**
 * Rate limiting (security review, 2026-08-24 → hardened): better-auth's own mounted
 * endpoints — notably the unauthenticated, email-sending `/request-password-reset` —
 * are rate-limited by better-auth itself (`onRequestRateLimit`, called from its router
 * `onRequest` hook for every request), with special stricter built-in rules for
 * sensitive paths regardless of the `window`/`max` below: 3 req/10s for
 * `/sign-in*`/`/sign-up*`/`/change-password`/`/change-email`, and 3 req/60s for
 * `/request-password-reset`/`/forget-password*`/`/send-verification-email`/the
 * email-otp equivalents (`better-auth/dist/api/rate-limiter/index.mjs:302-315`). The
 * BUILT-IN default storage is in-memory (per-instance, so multiplied on serverless) and
 * only defaults to enabled in production (`enabled: options.rateLimit?.enabled ??
 * isProduction`, `better-auth/dist/context/create-context.mjs:171`) — `storage:
 * "database"` below (backed by the `rate_limit` table, `@factory/db`'s
 * `better-auth-rate-limit.ts`) makes it shared across instances, and `enabled: true`
 * makes dev behave like prod instead of silently having no limiter at all locally.
 * Verified failure mode (`better-auth/dist/api/rate-limiter/index.mjs:76-183`,
 * `createDatabaseStorageWrapper`): a DB read/write failure during `consume()` is not
 * caught anywhere in that path — it propagates out of the request and into
 * better-auth's router `onError` hook, which logs and surfaces an error response. This
 * is not a new failure mode this repo takes on: `DATABASE_URL` is already the hard
 * baseline dependency for auth itself (session/user reads hit the same DB), so a DB
 * outage already breaks these endpoints regardless of the rate limiter.
 * `advanced.ipAddress.trustedProxies` (verified against `better-auth@1.7.1`'s own
 * `@better-auth/core` types, `init-options.d.mts`: `advanced.ipAddress.trustedProxies?:
 * string[]`) is now wired from `TRUSTED_PROXIES` below — multi-hop `x-forwarded-for`
 * without it collapses every client behind the proxy into one shared rate-limit bucket,
 * same category of per-deployment config as `APP_URL`. `ipAddressHeaders` stays
 * unwired: no registered env var claims a non-default header list yet, and Better
 * Auth's own header-detection default is a reasonable one to keep unless a deployment
 * needs otherwise.
 */
export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  rateLimit: { enabled: true, storage: "database" },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: emailEnabled,
    // Same spread/ternary shape as `user.deleteUser.sendDeleteAccountVerification` below:
    // the key must be ABSENT (not a no-op function) when email is disabled, so better-auth
    // falls through to its own built-in behavior and returns its honest
    // `RESET_PASSWORD_DISABLED` error (copy for it already ships in
    // `packages/ui/src/auth/errors.ts`) instead of an email-less deployment claiming "check
    // your email" for a reset email that was never sent.
    ...(emailEnabled
      ? {
          async sendResetPassword({ user, url }: { user: { email: string }; url: string }) {
            // Deliberate asymmetry vs every other `send*` callback here (delete-account
            // verification, email verification, magic link): those legitimately surface a
            // delivery failure by throwing, because the user is mid-flow and needs to know.
            // Reset-password must NOT: better-auth's `/request-password-reset` endpoint
            // returns the same uniform "if this email exists, we sent a link" response for
            // both known and unknown addresses, specifically so a caller can't use the
            // response to probe which emails have accounts. If a Resend outage/timeout made
            // this callback throw for a real account while unknown addresses still got the
            // uniform response, the throw/no-throw split would itself become an
            // account-existence oracle. So a failed send here is logged (reason only — never
            // the token/url, which is a live credential) and swallowed, not rethrown.
            const result = await send("reset-password", user.email, { url });
            if (!result.delivered && result.reason !== "console") {
              console.error(`password reset email not delivered (${result.reason})`);
            }
          },
        }
      : {}),
  },
  user: {
    deleteUser: {
      enabled: true,
      // Verified against better-auth 1.7.1's own route handler
      // (dist/api/routes/update-user.mjs:317-334, `deleteUser` endpoint): whenever
      // `sendDeleteAccountVerification` is configured at all, the endpoint ALWAYS takes
      // the "send a verification email, then wait for the callback" branch — even when
      // the caller supplied a `password` — because that check (line 299) only verifies
      // the password, it never short-circuits past the `sendDeleteAccountVerification`
      // branch below it. So this key must be present ONLY when email is actually live;
      // spread/ternary (same shape as the `magicLink` plugin below) keeps it absent
      // entirely — not just a no-op function — when email is disabled. With the key
      // absent, better-auth falls through to its own built-in minimal-profile behavior:
      // delete immediately if a `password` was supplied and verifies, otherwise require
      // a fresh session (`sessionConfig.freshAge`) — no email round-trip needed, which is
      // the correct degradation for an email-less deployment.
      ...(emailEnabled
        ? {
            async sendDeleteAccountVerification({
              user,
              url,
            }: {
              user: { email: string };
              url: string;
            }) {
              assertDelivered(
                "delete account email",
                await send("delete-account", user.email, { url }),
              );
            },
          }
        : {}),
    },
  },
  emailVerification: {
    // Establish the session as soon as the user clicks the verification link, so the
    // sign-up → verify flow lands them signed in rather than bouncing back to /login.
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      // Defensive — `requireEmailVerification`/the `sendOnSignUp`/`sendOnSignIn` defaults
      // mean Better Auth shouldn't call this while email is disabled, but never attempt a
      // send (and never render) if it does.
      if (!emailEnabled) return;
      assertDelivered("verification email", await send("verify-email", user.email, { url }));
    },
  },
  // Better Auth's default `freshAge` is 24h — far too wide for the one thing freshness
  // gates here: on an email-disabled deployment, `/delete-user` with no password falls
  // back to "is the session fresh?" (see `user.deleteUser` above), so the default would
  // let a stolen cookie destroy an account for a full day after sign-in (security review
  // finding). 10 minutes keeps the no-password path usable right after signing in while
  // closing the stolen-cookie window. Never set 0 — that DISABLES the freshness check.
  session: { freshAge: 60 * 10 },
  // Absent (not `advanced: { ipAddress: { trustedProxies: undefined } }`) when
  // TRUSTED_PROXIES is unset — same absent-key idiom as the email-gated blocks above, so
  // Better Auth falls through to its own untrusted-proxy default rather than this module
  // pinning a value either way.
  ...(trustedProxies && trustedProxies.length > 0
    ? { advanced: { ipAddress: { trustedProxies } } }
    : {}),
  // `undefined` → Better Auth's same-origin default.
  baseURL: env.APP_URL,
  // Always a string — hard-required by config validation since M8; see the module doc
  // comment above.
  secret: env.BETTER_AUTH_SECRET,
  socialProviders,
  plugins: emailFeatures.magicLink
    ? [
        magicLink({
          async sendMagicLink({ email, url }) {
            assertDelivered("magic link email", await send("magic-link", email, { url }));
          },
        }),
      ]
    : [],
});
