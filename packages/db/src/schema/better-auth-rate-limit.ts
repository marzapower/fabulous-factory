import { bigint, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Better Auth 1.7.1's OWN rate-limit table (`rateLimit: { storage: "database" }`),
 * generated authoritatively by invoking the installed `@better-auth/drizzle-adapter`
 * package's schema generator (`generateDrizzleSchema`, the same code path
 * `npx auth@latest generate` runs) against `getAuthTables({ rateLimit: { storage:
 * "database" } })`'s `rateLimit` model
 * (`@better-auth/core/dist/db/get-tables.mjs:34-56`) — table/column names below are
 * exactly what that generator emits for `provider: "pg"`, no defaults applied:
 * `id` (text pk, `generate-drizzle-schema-huQqmolx.mjs:133`), `key` (text, notNull,
 * unique — the model's `unique: true` field), `count` (integer, notNull — no DB-level
 * default; better-auth always writes `count: 1` on insert), `last_request` (bigint,
 * `{ mode: "number" }` — the field's `bigint: true`, notNull — no DB-level default
 * either: better-auth's generator only emits `.defaultNow()` for `type: "date"`
 * defaults, and this field's `defaultValue: () => Date.now()` is a plain `number`
 * default, so nothing is appended; better-auth always supplies `lastRequest` itself on
 * every write). DO NOT rename the table or its columns — better-auth's Drizzle adapter
 * maps to these names by convention (`modelName: "rateLimit"` → `rate_limit`) and a
 * rename would desync it silently.
 *
 * NOT the same limiter as `./rate-limit.ts`'s `rate_limits` table: that one is the
 * KERNEL's fixed-window limiter for `defineHandler`/`defineAction` routes (app-composed
 * key, app-side window math). This one is consumed ONLY by better-auth's own mounted
 * endpoints (sign-in/up, password reset, email verification, …) via its
 * `createDatabaseStorageWrapper` (`better-auth/dist/api/rate-limiter/index.mjs:76-183`) —
 * different table, different owner, deliberately not unified.
 */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
