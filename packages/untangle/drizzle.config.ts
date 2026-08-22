import { defineConfig } from "drizzle-kit";

// `dbCredentials` is intentionally omitted — `drizzle-kit generate` is offline (diffs the
// schema against the checked-in migration history, never connects to a database). Only
// `drizzle-kit migrate`/`push`/`studio` would need credentials, and this repo runs
// migrations itself via `packages/db/scripts/migrate.ts` instead, which discovers and
// runs this domain's chain alongside the shared one (multi-chain layout: preset domains
// don't ship each other's tables).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "../db/migrations/untangle",
});
