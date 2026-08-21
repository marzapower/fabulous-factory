/**
 * Shared contract suite (plan H.2.6/H.10.11): BOTH adapters proven against the SAME
 * behavioral spec — status codes AND side effects. `disabled` needs zero DB access;
 * `stripe`'s network calls (`checkout.sessions.create`/`billingPortal.sessions.create`)
 * are stubbed (a real Stripe class wraps the REAL `webhooks` namespace for the
 * signature-path assertions, since that's pure local crypto — same house-approved
 * exception as webhook.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDbDouble, createStore, type Store } from "./helpers/db-double";
import {
  TEST_STRIPE_SECRET_KEY,
  TEST_WEBHOOK_SECRET,
  buildEvent,
  buildSignedRequest,
  buildSubscription,
} from "./helpers/stripe-fixtures";

const dbHolder = vi.hoisted(() => ({ db: undefined as unknown }));
const stripeApiHolder = vi.hoisted(() => ({
  checkoutCreate: undefined as unknown,
  portalCreate: undefined as unknown,
}));

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

const TEST_PLANS = {
  free: { id: "free", name: "Free", monitorLimit: 3, priceUsdMonthly: null, providerRefs: {} },
  pro: {
    id: "pro",
    name: "Pro",
    monitorLimit: 25,
    priceUsdMonthly: 9,
    providerRefs: { stripe: "price_pro_real" },
  },
};

vi.mock("@factory/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@factory/config")>();
  return {
    ...actual,
    PLANS: TEST_PLANS,
    FREE_PLAN_ID: "free",
    getEnv: () => ({
      STRIPE_SECRET_KEY: TEST_STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
      APP_URL: "https://example.test",
    }),
    getAppUrl: () => "https://example.test",
  };
});

vi.mock("stripe", async () => {
  const actual = await vi.importActual<typeof import("stripe")>("stripe");
  const RealStripe = actual.default;
  class FakeStripe {
    // Getters, not fields captured at construction: `adapters/stripe.ts` memoizes ITS
    // OWN Stripe client singleton (module-level, keyed on STRIPE_SECRET_KEY) across
    // every test in this file, but `beforeEach` replaces `stripeApiHolder.*Create`
    // with a FRESH `vi.fn()` each time — a captured-at-construction reference would
    // silently keep calling test 1's mock forever. Reading through a getter re-reads
    // whichever mock is current at call time.
    get checkout() {
      return { sessions: { create: stripeApiHolder.checkoutCreate } };
    }
    get billingPortal() {
      return { sessions: { create: stripeApiHolder.portalCreate } };
    }
    webhooks: unknown;
    constructor(key: string, config?: never) {
      const real = new RealStripe(key, config);
      this.webhooks = real.webhooks;
    }
  }
  return { __esModule: true, default: FakeStripe };
});

let store: Store;

beforeEach(() => {
  store = createStore();
  dbHolder.db = createDbDouble(store);
  stripeApiHolder.checkoutCreate = vi.fn();
  stripeApiHolder.portalCreate = vi.fn();
});

describe("disabled adapter — contract", () => {
  async function disabled() {
    const { disabledProvider } = await import("../src/adapters/disabled");
    return disabledProvider;
  }

  it("createCheckout throws BillingDisabledError", async () => {
    const { BillingDisabledError } = await import("../src/errors");
    const provider = await disabled();
    await expect(
      provider.createCheckout({ userId: "u1", plan: "pro", successUrl: "https://x/ok" }),
    ).rejects.toBeInstanceOf(BillingDisabledError);
  });

  it("getPortalUrl returns null", async () => {
    const provider = await disabled();
    await expect(provider.getPortalUrl("u1")).resolves.toBeNull();
  });

  it("handleWebhook returns 404 and touches no DB", async () => {
    const provider = await disabled();
    const res = await provider.handleWebhook(
      new Request("https://example.test/api/billing/webhook", { method: "POST" }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "no billing provider configured" });
    // "Touches no DB" actually asserted (H.10 review fix) — the disabled adapter's
    // `handleWebhook` never even imports `@factory/db`, but the previous version of this
    // test only checked the response and would have passed even if that changed.
    expect(store.subscriptions.size).toBe(0);
    expect(store.billingEvents.size).toBe(0);
  });
});

describe("stripe adapter — contract", () => {
  async function stripe() {
    const { stripeProvider } = await import("../src/adapters/stripe");
    return stripeProvider;
  }

  it("createCheckout returns a url for a properly-configured plan", async () => {
    (stripeApiHolder.checkoutCreate as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: "https://checkout.stripe.com/session_1",
    });
    const provider = await stripe();
    const result = await provider.createCheckout({
      userId: "u1",
      plan: "pro",
      successUrl: "https://example.test/success",
    });
    expect(result).toEqual({ url: "https://checkout.stripe.com/session_1" });
    expect(stripeApiHolder.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_pro_real", quantity: 1 }],
        cancel_url: "https://example.test/dashboard",
        client_reference_id: "u1",
      }),
    );
  });

  it("createCheckout throws when the plan has no configured (or placeholder) price", async () => {
    const provider = await stripe();
    await expect(
      provider.createCheckout({
        userId: "u1",
        plan: "free",
        successUrl: "https://example.test/success",
      }),
    ).rejects.toThrow(/no stripe price configured/);
  });

  it("getPortalUrl returns null when there's no cached customer", async () => {
    const provider = await stripe();
    await expect(provider.getPortalUrl("u_no_customer")).resolves.toBeNull();
    expect(stripeApiHolder.portalCreate).not.toHaveBeenCalled();
  });

  it("getPortalUrl returns a url for a cached customer", async () => {
    store.subscriptions.set("sub_1", {
      providerSubscriptionId: "sub_1",
      userId: "u1",
      provider: "stripe",
      providerCustomerId: "cus_1",
      providerPriceId: "price_pro_real",
      planId: "pro",
      status: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      lastEventCreated: 1,
      updatedAt: new Date(),
    });
    (stripeApiHolder.portalCreate as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: "https://billing.stripe.com/portal_1",
    });
    const provider = await stripe();
    await expect(provider.getPortalUrl("u1")).resolves.toEqual({
      url: "https://billing.stripe.com/portal_1",
    });
    expect(stripeApiHolder.portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_1", return_url: "https://example.test/dashboard" }),
    );
  });

  it("handleWebhook: bad signature → 400, zero writes", async () => {
    const provider = await stripe();
    const res = await provider.handleWebhook(
      new Request("https://example.test/api/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=bad" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
    expect(store.subscriptions.size).toBe(0);
    expect(store.billingEvents.size).toBe(0);
  });

  it("handleWebhook: valid subscription event → 200, exactly one upsert", async () => {
    const provider = await stripe();
    const sub = buildSubscription({
      id: "sub_contract",
      metadata: { userId: "u1" },
      priceId: "price_pro_real",
    });
    const event = buildEvent({ type: "customer.subscription.created", dataObject: sub });
    const res = await provider.handleWebhook(buildSignedRequest(event));
    expect(res.status).toBe(200);
    expect(store.subscriptions.size).toBe(1);
    expect(store.subscriptions.get("sub_contract")).toMatchObject({ planId: "pro" });
  });

  it("handleWebhook: replay → 200, zero NEW writes", async () => {
    const provider = await stripe();
    const sub = buildSubscription({
      id: "sub_replay",
      metadata: { userId: "u1" },
      priceId: "price_pro_real",
    });
    const event = buildEvent({
      id: "evt_contract_replay",
      type: "customer.subscription.created",
      dataObject: sub,
    });
    await provider.handleWebhook(buildSignedRequest(event));
    const res = await provider.handleWebhook(buildSignedRequest(event));
    expect(res.status).toBe(200);
    expect(store.subscriptions.size).toBe(1);
    expect(store.billingEvents.size).toBe(1);
  });

  it("handleWebhook: unhandled event type → 200", async () => {
    const provider = await stripe();
    const event = buildEvent({ type: "customer.tax_id.deleted", dataObject: { id: "txi_1" } });
    const res = await provider.handleWebhook(buildSignedRequest(event));
    expect(res.status).toBe(200);
  });

  // H.10.11's full status-code-AND-side-effect matrix lives in the CONTRACT suite, not
  // only webhook.test.ts's unit-level detail (H.10 review fix) — the stale-event row is
  // part of that matrix and was previously only proven at the unit level.
  it("handleWebhook: stale event.created (strict <) → 200, zero writes to the already-cached row", async () => {
    const provider = await stripe();
    const subFirst = buildSubscription({
      id: "sub_contract_stale",
      metadata: { userId: "u1" },
      priceId: "price_pro_real",
      status: "active",
    });
    const first = buildEvent({
      id: "evt_contract_stale_1",
      type: "customer.subscription.updated",
      created: 1000,
      dataObject: subFirst,
    });
    await provider.handleWebhook(buildSignedRequest(first));
    const cachedAfterFirst = { ...store.subscriptions.get("sub_contract_stale") };

    const subStale = buildSubscription({
      id: "sub_contract_stale",
      metadata: { userId: "u1" },
      priceId: "price_pro_real",
      status: "canceled",
    });
    const stale = buildEvent({
      id: "evt_contract_stale_2",
      type: "customer.subscription.updated",
      created: 500,
      dataObject: subStale,
    });
    const res = await provider.handleWebhook(buildSignedRequest(stale));

    expect(res.status).toBe(200);
    expect(store.subscriptions.size).toBe(1);
    // Zero writes to the row: unchanged from what the first (real) event left behind.
    expect(store.subscriptions.get("sub_contract_stale")).toEqual(cachedAfterFirst);
  });
});
