import { describe, expect, it } from "vitest";

import { functions } from "../src/functions";

/**
 * Honest, minimal coverage for the generic jobs registry (kept non-empty per package so
 * vitest's project discovery has something to run): the baseline registry starts empty
 * — the product's own jobs are added here by `pnpm gen job` (see the `add-a-job` skill),
 * and any preset domain's own cron functions (e.g. Untangle's daily-plan cron/worker)
 * ship with that preset's own package instead, never here.
 */
describe("functions registry", () => {
  it("starts empty in the baseline template", () => {
    expect(functions).toEqual([]);
  });
});
