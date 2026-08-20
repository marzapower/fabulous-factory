import { defineConfig } from "drizzle-kit";

// `dbCredentials` is intentionally omitted — `drizzle-kit generate` is offline (diffs the
// schema against the checked-in migration history, never connects to a database). Only
// `drizzle-kit migrate`/`push`/`studio` would need credentials, and this repo runs
// migrations itself via `scripts/migrate.ts` instead.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
});
