import { describe, expect, it } from "vitest";

import { checkRateLimit } from "../src/rate-limit";

// N3: `checkRateLimit` must reject a nonsensical policy loudly, synchronously, and
// BEFORE ever touching the database. `windowSeconds`/`max` <= 0 (or NaN, or
// non-integer) would otherwise produce `new Date(NaN)` downstream, which every
// comparison treats as "never expired" — i.e. the limiter would permanently no-op
// without ever raising an error (a silent fail-open, indistinguishable from a working
// limiter until it's too late). Because the guard runs before `getDb()` is ever
// called, none of these cases need a database or `DATABASE_URL` at all.
describe("checkRateLimit — invalid policy guard (N3)", () => {
  const validArgs = { name: "n3-test", subject: "user:x" };

  it.each([
    ["windowSeconds is 0", { windowSeconds: 0, max: 5 }],
    ["windowSeconds is negative", { windowSeconds: -1, max: 5 }],
    ["windowSeconds is NaN", { windowSeconds: Number.NaN, max: 5 }],
    ["windowSeconds is non-integer", { windowSeconds: 1.5, max: 5 }],
    ["max is 0", { windowSeconds: 60, max: 0 }],
    ["max is negative", { windowSeconds: 60, max: -1 }],
    ["max is NaN", { windowSeconds: 60, max: Number.NaN }],
    ["max is non-integer", { windowSeconds: 60, max: 2.5 }],
  ] as const)("throws when %s", async (_label, policy) => {
    await expect(checkRateLimit({ ...validArgs, ...policy })).rejects.toThrow(/positive integers/);
  });
});
