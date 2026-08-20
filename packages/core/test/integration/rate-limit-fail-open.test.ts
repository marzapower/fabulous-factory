import { describe, expect, it } from "vitest";

// Deliberately its OWN test file, not a case inside rate-limit.test.ts: `@factory/db`'s
// `getDb()` memoizes its connection pool at module scope for the lifetime of a test
// process. If this ran in the same file as the other rate-limit integration tests,
// whichever runs first would permanently cache its `DATABASE_URL` (good or bad) for
// every subsequent test in that file — there is no exported way to reset it. Vitest
// isolates the module registry PER TEST FILE by default, so putting this in its own
// file guarantees `getDb()` has never been called yet when this test sets a bad
// `DATABASE_URL` and makes checkRateLimit's first-ever call.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!TEST_DATABASE_URL) {
  console.warn(
    "integration tests skipped: set TEST_DATABASE_URL to run packages/core rate-limit integration tests against a real Postgres instance.",
  );
}

describe.skipIf(!TEST_DATABASE_URL)("checkRateLimit — fail-open (integration)", () => {
  it("fails open (allowed: true) when the database is unreachable, per plan D.4's documented tradeoff", async () => {
    process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/does-not-exist";
    const { checkRateLimit } = await import("../../src/rate-limit");

    const result = await checkRateLimit({
      name: "integration-fail-open",
      subject: "user:frank",
      windowSeconds: 60,
      max: 5,
    });

    expect(result).toEqual({ allowed: true, remaining: 5, retryAfterSeconds: 0 });
  }, 10_000);
});
