import { defineConfig } from "drizzle-kit";

// `dbCredentials` is intentionally omitted — `drizzle-kit generate` is offline (diffs the
// schema against the checked-in migration history, never connects to a database), same
// as `packages/db/drizzle.config.ts`. `out` lands under `packages/db/migrations/` (a
// DOMAIN chain, discovered and run by `packages/db/scripts/migrate.ts` alongside the
// shared chain and any other domain package's own chain), not under this package.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "../db/migrations/brainstorm",
});
