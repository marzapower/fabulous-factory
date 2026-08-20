import { lt, sql } from "drizzle-orm";

import { getDb, schema } from "@factory/db";

/** The policy shape `defineHandler`'s `rateLimit` option accepts (plan D.4). */
export interface RateLimitPolicy {
  windowSeconds: number;
  max: number;
}

/**
 * `defineAction` variant of `RateLimitPolicy`. Server actions have no URL path to
 * auto-derive a rate-limit bucket name from (unlike `defineHandler`, which derives one
 * from `${method} ${pathname}`) — `name` is therefore required, not optional. Not part
 * of plan D.4's literal pseudocode; see the implementation report for the justification.
 */
export interface NamedRateLimitPolicy extends RateLimitPolicy {
  /** Caller-chosen, stable identifier for this action's rate-limit bucket, e.g. `"create-monitor"`. */
  name: string;
}

export interface RateLimitCheckOptions extends RateLimitPolicy {
  /** Caller-composed bucket name; combined with `subject` to form the storage key. */
  name: string;
  /** Who is being limited, e.g. `user:${id}` or `ip:${address}`. */
  subject: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** ~1% of calls also prune, so keys that never "roll" to a fresh window still get swept. */
const PRUNE_PROBABILITY = 0.01;

/**
 * Conservative floor for pruning (B1 fix): rows older than this, RELATIVE TO NOW, are
 * dead regardless of any caller's policy. Deliberately NOT derived from any single
 * caller's `windowStart` — a short-window endpoint's prune must never be able to delete
 * a still-current row belonging to a different, longer-window bucket (that would let an
 * attacker reset an expensive endpoint's limit by hammering an unrelated cheap one).
 * 24h is longer than any sane fixed window this app would configure.
 */
const MAX_RETAINED_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * Postgres-backed fixed-window rate limiter (spec §8.5, plan D.4 as corrected by D.9.1).
 *
 * Window start is computed APP-SIDE from epoch math
 * (`floor(Date.now()/windowMs)*windowMs`) — never a DB `now()` round-trip. This assumes
 * a single, roughly-synchronized clock domain across replicas; skew only blurs window
 * edges by at most the skew amount, which is an accepted tradeoff (plan D.9.1), not a
 * correctness bug.
 *
 * The increment is a single atomic `INSERT ... ON CONFLICT (key, window_start) DO UPDATE
 * SET count = count + 1 RETURNING count`. Postgres serializes concurrent upserts on the
 * same primary-key row via its row lock, so concurrent callers for the same
 * `(name, subject, window)` never lose an increment — verified by the concurrency
 * integration test (N concurrent calls land exactly N).
 *
 * FAILS OPEN on any DB error (connection failure, migration not yet applied, etc.), with
 * a server-side `console.error`. Deliberate (plan D.4): a broken database already breaks
 * the guarded handler/action body itself, so refusing traffic here buys nothing beyond a
 * confusing extra failure mode — and refusing here would additionally take down public
 * unauthenticated endpoints (health-check-adjacent traffic) on every DB hiccup.
 */
export async function checkRateLimit(opts: RateLimitCheckOptions): Promise<RateLimitResult> {
  const { name, subject, windowSeconds, max } = opts;

  // N3: reject a nonsensical policy loudly instead of failing open silently. A NaN or
  // <= 0 `windowSeconds` produces `new Date(NaN)` below, which every comparison treats
  // as "never expired" — i.e. the limiter would permanently no-op without ever raising
  // an error. Integers only: a fractional window/max is almost certainly a caller bug.
  if (
    !Number.isInteger(windowSeconds) ||
    windowSeconds <= 0 ||
    !Number.isInteger(max) ||
    max <= 0
  ) {
    throw new Error(
      `[@factory/core] invalid rate-limit policy: windowSeconds and max must be positive integers (got windowSeconds=${windowSeconds}, max=${max})`,
    );
  }

  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const key = `${name}:${subject}`;

  try {
    const db = getDb();
    const [row] = await db
      .insert(schema.rateLimits)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [schema.rateLimits.key, schema.rateLimits.windowStart],
        set: { count: sql`${schema.rateLimits.count} + 1` },
      })
      .returning({ count: schema.rateLimits.count });

    const count = row?.count ?? 1;
    const allowed = count <= max;
    const remaining = Math.max(0, max - count);
    const retryAfterSeconds = Math.max(0, Math.ceil((windowStartMs + windowMs - now) / 1000));

    // Opportunistic pruning: always right after THIS call creates a fresh window row for
    // THIS key (count === 1 is a cheap, good-enough "window roll" signal), plus a small
    // random chance on every other call. Fire-and-forget — pruning must never slow down
    // or fail the rate-limit decision itself.
    if (count === 1 || Math.random() < PRUNE_PROBABILITY) {
      void pruneExpiredWindows().catch((error: unknown) => {
        console.error("[@factory/core] rate-limit pruning failed", error);
      });
    }

    return { allowed, remaining, retryAfterSeconds };
  } catch (error) {
    console.error("[@factory/core] rate-limit check failed; failing open", error);
    return { allowed: true, remaining: max, retryAfterSeconds: 0 };
  }
}

/**
 * Deletes every window older than the conservative `MAX_RETAINED_WINDOW_SECONDS` floor
 * (B1 fix), across all keys. Deliberately NOT parameterized by any single caller's
 * `windowStart`: a caller's own window policy must never influence which OTHER keys'
 * rows get swept, or a short-window endpoint's prune could delete a still-current row
 * belonging to a longer-window bucket.
 */
async function pruneExpiredWindows(): Promise<void> {
  const db = getDb();
  const floor = new Date(Date.now() - MAX_RETAINED_WINDOW_SECONDS * 1000);
  await db.delete(schema.rateLimits).where(lt(schema.rateLimits.windowStart, floor));
}
