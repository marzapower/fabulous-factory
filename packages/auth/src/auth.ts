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
 * `BETTER_AUTH_SECRET` (spec §5.2 tension): `undefined` is fine in development — Better
 * Auth 1.7.1 falls back to a built-in dev secret — but it is REQUIRED in production: the
 * library throws when `NODE_ENV=production` and the secret is unset. Because the auth
 * context is built lazily behind a promise, that throw doesn't crash the app at boot; it
 * surfaces as 500s on every `/api/auth/*` request once the promise is first awaited (see
 * plan C.9 — expected behavior, not a regression). Set `BETTER_AUTH_SECRET` before
 * deploying to production; `doctor`'s auth section warns about this.
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
import { send } from "@factory/email";

import { deriveAuthOptions } from "./options";

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
      await send("verify-email", user.email, { url });
    },
  },
  // `undefined` → Better Auth's same-origin default.
  baseURL: env.APP_URL,
  // `undefined` is fine in development (documented dev fallback); required in production
  // — see the module doc comment above.
  secret: env.BETTER_AUTH_SECRET,
  socialProviders,
  plugins: emailFeatures.magicLink
    ? [
        magicLink({
          async sendMagicLink({ email, url }) {
            await send("magic-link", email, { url });
          },
        }),
      ]
    : [],
});
