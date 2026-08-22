#!/usr/bin/env tsx
/**
 * `pnpm db:seed` — intentionally a no-op. The Untangle workspace needs no seed data: a
 * signed-in user pastes text and the run creates everything itself, and the landing
 * page's demo is a recorded fixture rather than database rows. This exists so the command
 * is discoverable, and so an adopter who DOES need seed data has an obvious place to put
 * it rather than inventing one.
 */
console.log("db:seed: nothing to seed — Untangle creates its own data from a user's first run.");
process.exitCode = 0;
