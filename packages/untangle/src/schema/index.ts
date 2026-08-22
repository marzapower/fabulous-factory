// ONLY this domain's own tables — never re-export anything from `@factory/db/schema`
// here. `drizzle-kit generate` diffs exactly what this barrel exports; re-exporting the
// shared schema would resurrect auth/billing/etc tables into this domain's own migration
// chain (`../../db/migrations/untangle`), which must contain only `captures`, `tasks`,
// `runs`, and `run_steps`.
export * from "./task";
export * from "./run";
