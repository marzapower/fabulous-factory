import { describe, expect, it } from "vitest";

import { DEFAULT_MODELS, type ModelsConfig } from "../src/routing";
import { estimateCostCents, type PricingConfig } from "../src/pricing";

const PRICING: PricingConfig = {
  "claude-haiku-4-5": { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
  "gpt-5.6-terra": { inputUsdPerMTok: 2, outputUsdPerMTok: 12 },
};

describe("estimateCostCents — math", () => {
  it("computes exact cents for a known model (haiku, 300 in / 150 out)", () => {
    expect(estimateCostCents("claude-haiku-4-5", 300, 150, PRICING)).toBe(0.105);
  });

  it("computes exact cents for a different known model (terra, 1000 in / 500 out)", () => {
    // (1000 * 2 + 500 * 12) / 1_000_000 * 100 = 8000 / 1_000_000 * 100 = 0.8
    expect(estimateCostCents("gpt-5.6-terra", 1000, 500, PRICING)).toBe(0.8);
  });

  it("returns 0 for zero token counts (not null — zero is a known, valid usage)", () => {
    expect(estimateCostCents("claude-haiku-4-5", 0, 0, PRICING)).toBe(0);
  });
});

describe("estimateCostCents — null edges", () => {
  it("returns null for an unknown model", () => {
    expect(estimateCostCents("some-unlisted-model", 300, 150, PRICING)).toBeNull();
  });

  it("returns null when inputTokens is undefined", () => {
    expect(estimateCostCents("claude-haiku-4-5", undefined, 150, PRICING)).toBeNull();
  });

  it("returns null when outputTokens is undefined", () => {
    expect(estimateCostCents("claude-haiku-4-5", 300, undefined, PRICING)).toBeNull();
  });

  it("returns null when both token counts are undefined", () => {
    expect(estimateCostCents("claude-haiku-4-5", undefined, undefined, PRICING)).toBeNull();
  });

  it("returns null for an unknown model even with undefined tokens (both reasons hold)", () => {
    expect(estimateCostCents("some-unlisted-model", undefined, undefined, PRICING)).toBeNull();
  });
});

describe("estimateCostCents — default pricing", () => {
  it("uses DEFAULT_PRICING (pricing.json) when no pricing table is passed", () => {
    expect(estimateCostCents("claude-haiku-4-5", 300, 150)).toBe(0.105);
  });
});

describe("pricing.json — rot gate invariant", () => {
  // Every non-local routed model id in models.json must have a pricing.json entry, or
  // cost accounting silently degrades to 'unknown' for a model that's actually in active
  // rotation (plan F.6). Reads the real files (not a fixture) so this fails the moment
  // either drifts.
  const models: ModelsConfig = DEFAULT_MODELS;
  const nonLocalModelIds = Object.entries(models)
    .filter(([routingKey]) => routingKey !== "local")
    .flatMap(([, tiers]) => Object.values(tiers));

  it.each(Array.from(new Set(nonLocalModelIds)))("pricing.json has an entry for %s", (modelId) => {
    expect(estimateCostCents(modelId, 1, 1)).not.toBeNull();
  });
});
