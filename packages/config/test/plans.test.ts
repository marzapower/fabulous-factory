import { describe, expect, it } from "vitest";

import { FREE_PLAN_ID, PLANS, type PlanId } from "../src/plans";

describe("PLANS — invariants (H.2.2)", () => {
  it("every entry's id matches its own catalog key", () => {
    for (const [key, plan] of Object.entries(PLANS)) {
      expect(plan.id).toBe(key);
    }
  });

  it("ids are unique", () => {
    const ids = Object.values(PLANS).map((plan) => plan.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the free plan has a null price and no stripe providerRef", () => {
    expect(PLANS.free.priceUsdMonthly).toBeNull();
    expect("stripe" in PLANS.free.providerRefs).toBe(false);
  });

  it("every paid plan (non-null price) has a providerRefs.stripe slot", () => {
    for (const plan of Object.values(PLANS)) {
      if (plan.priceUsdMonthly !== null) {
        expect(plan.providerRefs.stripe).toBeTruthy();
      }
    }
  });

  it("runsPerDay is null or a positive number for every plan", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.runsPerDay === null || plan.runsPerDay > 0).toBe(true);
    }
  });

  it("FREE_PLAN_ID resolves to an entry that is actually free (null price)", () => {
    expect(PLANS[FREE_PLAN_ID].priceUsdMonthly).toBeNull();
  });

  it("PlanId derives as the literal union of the catalog's keys", () => {
    const id: PlanId = "pro";
    expect(PLANS[id].id).toBe("pro");
  });
});
