import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window rate-limit counters (spec §8.5) — consumed by `packages/core`'s
 * `checkRateLimit`. `key` is caller-composed (`${name}:${subject}`, e.g.
 * `create-monitor:user:abc123`); `windowStart` is computed APP-SIDE from epoch math
 * (never DB `now()` — plan D.9.1). Expired windows are pruned opportunistically by the
 * limiter itself; no background job needed.
 *
 * NOT the same limiter as `./better-auth-rate-limit.ts`'s `rate_limit` table: that one
 * belongs to better-auth itself and gates its own mounted endpoints (sign-in/up,
 * password reset, …). This one gates `defineHandler`/`defineAction` routes only —
 * different table, different owner, deliberately not unified.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] })],
);
