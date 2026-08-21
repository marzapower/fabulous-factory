/**
 * `getEntitlement` matrix (plan H.2.3, corrected H.10.5/6) + the resubscribe-survival
 * regression (H.10.19): a per-user PK would lose the OLD subscription row on
 * resubscribe; the per-subscription PK (H.10.5) must not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDbDouble, createStore, type Store } from "./helpers/db-double";

const dbHolder = vi.hoisted(() => ({ db: undefined as unknown }));
const capabilitiesHolder = vi.hoisted(() => ({ billing: "stripe" as "stripe" | "disabled" }));

// See webhook.test.ts's comment on this exact pair of mocks — the ordering/laziness
// here isn't cosmetic, it avoids a real deadlock between the two factories.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  const double = await import("./helpers/drizzle-double");
  return { ...actual, ...double };
});

vi.mock("@factory/db", async () => {
  const schemaMod = await import("@factory/db/schema");
  const { initColumns } = await import("./helpers/columns");
  initColumns(schemaMod as never);
  return { getDb: () => dbHolder.db, schema: schemaMod };
});

vi.mock("@factory/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@factory/config")>();
  return {
    ...actual,
    getCapabilities: () => ({
      billing: capabilitiesHolder.billing,
      llm: "disabled",
      email: "disabled",
      jobs: "disabled",
      analytics: "disabled",
      errors: "disabled",
    }),
  };
});

let store: Store;

beforeEach(() => {
  store = createStore();
  dbHolder.db = createDbDouble(store);
  capabilitiesHolder.billing = "stripe";
});

function seedSubscription(
  overrides: Partial<Record<string, unknown>> & { providerSubscriptionId: string },
) {
  store.subscriptions.set(overrides.providerSubscriptionId, {
    userId: "user_1",
    provider: "stripe",
    providerCustomerId: "cus_1",
    providerPriceId: "price_pro_test",
    planId: "pro",
    status: "active",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    lastEventCreated: 100,
    updatedAt: new Date(),
    ...overrides,
  });
}

async function getEntitlement(userId: string) {
  const { getEntitlement: fn } = await import("../src/entitlement");
  return fn(userId);
}

describe("getEntitlement — degradation matrix", () => {
  it("billing disabled → free plan, unlimited (monitorLimit null)", async () => {
    capabilitiesHolder.billing = "disabled";
    const result = await getEntitlement("user_1");
    expect(result).toEqual({ planId: "free", monitorLimit: null, source: "disabled" });
  });

  it("billing enabled, no rows → free plan with its catalog limit", async () => {
    const result = await getEntitlement("user_1");
    expect(result).toEqual({ planId: "free", monitorLimit: 3, source: "free" });
  });

  it.each(["active", "trialing", "past_due"])(
    "billing enabled, status=%s → entitled to the plan",
    async (status) => {
      seedSubscription({ providerSubscriptionId: "sub_1", status });
      const result = await getEntitlement("user_1");
      expect(result).toEqual({ planId: "pro", monitorLimit: 25, source: "subscription" });
    },
  );

  it.each(["canceled", "incomplete", "incomplete_expired", "unpaid"])(
    "billing enabled, status=%s → NOT entitled, falls back to free",
    async (status) => {
      seedSubscription({ providerSubscriptionId: "sub_1", status });
      const result = await getEntitlement("user_1");
      expect(result).toEqual({ planId: "free", monitorLimit: 3, source: "free" });
    },
  );

  it("winning row's plan_id unknown to the catalog → planId \"unknown\", free's limit, source subscription", async () => {
    seedSubscription({ providerSubscriptionId: "sub_1", planId: "unknown", status: "active" });
    const result = await getEntitlement("user_1");
    expect(result).toEqual({ planId: "unknown", monitorLimit: 3, source: "subscription" });
  });

  it("tie-break: current_period_end desc NULLS LAST — a dated entitled row beats a null one", async () => {
    seedSubscription({
      providerSubscriptionId: "sub_null",
      planId: "free",
      status: "active",
      currentPeriodEnd: null,
    });
    seedSubscription({
      providerSubscriptionId: "sub_dated",
      planId: "pro",
      status: "active",
      currentPeriodEnd: new Date("2030-01-01"),
    });
    const result = await getEntitlement("user_1");
    expect(result.planId).toBe("pro");
  });

  it("resubscribe survival (H.10.19/H.10.5): a stale canceled row for an old subscription never clobbers a live one", async () => {
    seedSubscription({
      providerSubscriptionId: "sub_old",
      planId: "pro",
      status: "canceled",
      lastEventCreated: 999, // newer event, but a terminal status — never entitled
      currentPeriodEnd: new Date("2020-01-01"),
    });
    seedSubscription({
      providerSubscriptionId: "sub_new",
      planId: "pro",
      status: "active",
      lastEventCreated: 100,
      currentPeriodEnd: new Date("2030-01-01"),
    });

    const result = await getEntitlement("user_1");
    expect(result).toEqual({ planId: "pro", monitorLimit: 25, source: "subscription" });
  });

  it("never reads the provider API — only ever touches the DB double", async () => {
    seedSubscription({ providerSubscriptionId: "sub_1", status: "active" });
    // No stripe mocking at all in this file — if getEntitlement ever tried to reach the
    // network, `stripe`'s real client would throw/hang on the dummy setup. Its mere
    // absence from this test's mocks is the proof; a passing call is the assertion.
    await expect(getEntitlement("user_1")).resolves.toMatchObject({ source: "subscription" });
  });
});
