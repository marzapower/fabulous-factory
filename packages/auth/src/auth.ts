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

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: emailEnabled,
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
