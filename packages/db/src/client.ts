import { EnvValidationError, parseEnv, readMergedEnv, type RawEnv } from "@factory/config/node";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

let cachedDb: NodePgDatabase<typeof schema> | undefined;

/**
 * Routes `DATABASE_URL` through the registry's own zod validation (`parseEnv`,
 * `@factory/config/node`) instead of a hand-rolled non-empty check — one source of truth
 * for what "a valid DATABASE_URL" means. `parseEnv` validates every REGISTERED var at once
 * and throws a single `EnvValidationError` aggregating every invalid one — including,
 * possibly, vars this package has nothing to do with (e.g. a missing `BETTER_AUTH_SECRET`
 * elsewhere in the process). Graceful degradation means DB access must never become
 * hostage to an unrelated var's contract, so: if NONE of the issues target
 * `DATABASE_URL`, fall back to the raw value and let `getDb`'s own non-empty check catch
 * a genuinely missing/blank `DATABASE_URL`. But if the registry's validation DID flag
 * `DATABASE_URL` itself, that verdict must stand — re-throw rather than silently using a
 * value the registry just declared invalid. Any other (non-`EnvValidationError`) error is
 * also re-thrown; only the registry's own aggregated shape is safe to inspect and
 * selectively swallow.
 */
function resolveConnectionString(rawEnv: RawEnv): string | undefined {
  try {
    return parseEnv(rawEnv).DATABASE_URL;
  } catch (error) {
    if (error instanceof EnvValidationError) {
      const targetsDatabaseUrl = error.issues.some((issue) => issue.name === "DATABASE_URL");
      if (targetsDatabaseUrl) {
        throw error;
      }
      return rawEnv.DATABASE_URL;
    }
    throw error;
  }
}

/** Memoized. Throws a clear error if `DATABASE_URL` is missing or empty. */
export function getDb(): NodePgDatabase<typeof schema> {
  if (!cachedDb) {
    const connectionString = resolveConnectionString(readMergedEnv());
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Set it in your environment or .env file — see .env.example.",
      );
    }
    // Every external call carries an explicit timeout and a bounded retry (conventions.md
    // security posture): `max` bounds the pool so a leak/spike can't exhaust Postgres'
    // connection limit, `connectionTimeoutMillis` bounds how long a caller waits to
    // acquire one, and `idleTimeoutMillis` recycles connections that would otherwise sit
    // open indefinitely. `statement_timeout` (query-level policy) is deliberately out of
    // scope here.
    const pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    cachedDb = drizzle({ client: pool, schema });
  }
  return cachedDb;
}
