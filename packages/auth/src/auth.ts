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
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { getCapabilities, getEnv } from "@factory/config";
import { getDb, schema } from "@factory/db";

import { deriveAuthOptions } from "./options";

const env = getEnv();
const { socialProviders } = deriveAuthOptions(env, getCapabilities());

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    // TODO(M4): flip once email verification posture (spec §5.2) ships.
    requireEmailVerification: false,
  },
  // `undefined` → Better Auth's same-origin default.
  baseURL: env.APP_URL,
  // `undefined` is fine in development (documented dev fallback); required in production
  // — see the module doc comment above.
  secret: env.BETTER_AUTH_SECRET,
  socialProviders,
});
