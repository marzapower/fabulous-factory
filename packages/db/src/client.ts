import { readMergedEnv } from "@factory/config/node";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

let cachedDb: NodePgDatabase<typeof schema> | undefined;

/** Memoized. Throws a clear error if `DATABASE_URL` is missing or empty. */
export function getDb(): NodePgDatabase<typeof schema> {
  if (!cachedDb) {
    const env = readMergedEnv();
    const connectionString = env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Set it in your environment or .env file — see .env.example.",
      );
    }
    const pool = new Pool({ connectionString });
    cachedDb = drizzle({ client: pool, schema });
  }
  return cachedDb;
}
