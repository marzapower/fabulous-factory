/**
 * Webhook unit matrix (plan H.4/H.5, demanded tests H.10.19) for
 * `adapters/stripe.ts#handleWebhook`, exercised directly (no `getBillingProvider`
 * capability gate — that's provider.ts's job, covered in contract.test.ts). DB access
 * runs against the in-memory double (test/helpers/db-double.ts +
 * test/helpers/drizzle-double.ts); signing uses the real `stripe` SDK with a dummy key
 * (no network — see stripe-fixtures.ts).
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

// `drizzle-orm`'s partial mock keeps every REAL export (`relations`, etc. — needed by
// `@factory/db/schema`'s own files) and overrides only the 5 query-operator functions
// this suite fakes. `@factory/db`'s mock hands the real schema to `columns.ts` via
// `initColumns` rather than importing it statically here — a static import would make
// THIS factory transitively wait on the `drizzle-orm` mock it's still busy resolving
// (see columns.ts's own comment; reproduced as a genuine hang while building this
// suite).
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

// A controlled catalog (real PLANS ships "pro" wired to the "price_REPLACE_ME"
// placeholder, per H.2.2) so "known vs. unknown price" tests mean what their names say.
const TEST_PLANS = {
  free: { id: "free", name: "Free", runsPerDay: 5, priceUsdMonthly: null, providerRefs: {} },
  pro: {
    id: "pro",
    name: "Pro",
    runsPerDay: 200,
    priceUsdMonthly: 9,
    providerRefs: { stripe: "price_pro_test" },
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

let store: Store;

beforeEach(() => {
  store = createStore();
  dbHolder.db = createDbDouble(store);
  vi.restoreAllMocks();
});

async function handleWebhook(req: Request) {
  const { stripeProvider } = await import("../src/adapters/stripe");
  return stripeProvider.handleWebhook(req);
}

describe("handleWebhook — signature + dedupe", () => {
  it("valid customer.subscription.updated → 200 and exactly one upsert", async () => {
    const sub = buildSubscription({ id: "sub_valid", metadata: { userId: "user_1" } });
    const event = buildEvent({
      type: "customer.subscription.updated",
      created: 1_700_000_100,
      dataObject: sub,
    });
    const req = buildSignedRequest(event);

    const res = await handleWebhook(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(store.subscriptions.size).toBe(1);
    const row = store.subscriptions.get("sub_valid");
    expect(row).toMatchObject({
      userId: "user_1",
      providerCustomerId: "cus_123",
      providerPriceId: "price_pro_test",
      status: "active",
      lastEventCreated: 1_700_000_100,
    });
    expect(store.billingEvents.has(event.id)).toBe(true);
  });

  it("bad signature → 400 and zero writes", async () => {
    const sub = buildSubscription({ metadata: { userId: "user_1" } });
    const event = buildEvent({ type: "customer.subscription.created", dataObject: sub });
    const { payload } = { payload: JSON.stringify(event) };
    const req = new Request("https://example.test/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=deadbeef" },
      body: payload,
    });

    const res = await handleWebhook(req);

    expect(res.status).toBe(400);
    expect(store.subscriptions.size).toBe(0);
    expect(store.billingEvents.size).toBe(0);
  });

  it("replay of an already-seen event.id → 200 and zero NEW writes", async () => {
    const sub = buildSubscription({ id: "sub_replay", metadata: { userId: "user_1" } });
    const event = buildEvent({
      id: "evt_replay",
      type: "customer.subscription.created",
      dataObject: sub,
    });
    const req1 = buildSignedRequest(event);
    const req2 = buildSignedRequest(event);

    const first = await handleWebhook(req1);
    expect(first.status).toBe(200);
    expect(store.subscriptions.size).toBe(1);
    const writtenAt = { ...store.subscriptions.get("sub_replay") };

    const second = await handleWebhook(req2);
    expect(second.status).toBe(200);
    expect(store.subscriptions.size).toBe(1);
    expect(store.billingEvents.size).toBe(1);
    // Untouched by the replay — same values as after the first delivery.
    expect(store.subscriptions.get("sub_replay")).toEqual(writtenAt);
  });

  it("stale event.created (strict <) → 200 and no update", async () => {
    const subFirst = buildSubscription({
      id: "sub_stale",
      metadata: { userId: "user_1" },
      status: "active",
    });
    const first = buildEvent({
      id: "evt_a",
      type: "customer.subscription.updated",
      created: 500,
      dataObject: subFirst,
    });
    await handleWebhook(buildSignedRequest(first));
    expect(store.subscriptions.get("sub_stale")).toMatchObject({
      status: "active",
      lastEventCreated: 500,
    });

    // A DIFFERENT, older-dated event for the SAME subscription must not win — same-second
    // (or earlier) later-arriving deliveries are dropped, strict less-than (H.10.13).
    const subStale = buildSubscription({
      id: "sub_stale",
      metadata: { userId: "user_1" },
      status: "canceled",
    });
    const stale = buildEvent({
      id: "evt_b",
      type: "customer.subscription.updated",
      created: 500,
      dataObject: subStale,
    });
    const res = await handleWebhook(buildSignedRequest(stale));

    expect(res.status).toBe(200);
    expect(store.subscriptions.get("sub_stale")).toMatchObject({
      status: "active",
      lastEventCreated: 500,
    });
  });

  it("unrecognized event type → 200, no-op", async () => {
    const event = buildEvent({ type: "customer.tax_id.created", dataObject: { id: "txi_1" } });
    const res = await handleWebhook(buildSignedRequest(event));

    expect(res.status).toBe(200);
    expect(store.subscriptions.size).toBe(0);
    expect(store.billingEvents.size).toBe(1);
  });

  it("checkout.session.completed → log-only, no cache write", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const event = buildEvent({ type: "checkout.session.completed", dataObject: { id: "cs_1" } });
    const res = await handleWebhook(buildSignedRequest(event));

    expect(res.status).toBe(200);
    expect(store.subscriptions.size).toBe(0);
    expect(logSpy).toHaveBeenCalled();
  });

  it("invoice.payment_failed → console.warn only, no throw", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const event = buildEvent({ type: "invoice.payment_failed", dataObject: { id: "in_1" } });
    const res = await handleWebhook(buildSignedRequest(event));

    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("handleWebhook — rollback regression (H.10.19)", () => {
  it("a failure after the dedupe insert rolls back the dedupe row too, and redelivery processes fully", async () => {
    const sub = buildSubscription({ id: "sub_rollback", metadata: { userId: "user_1" } });
    const event = buildEvent({
      id: "evt_rollback",
      type: "customer.subscription.created",
      dataObject: sub,
    });
    const req1 = buildSignedRequest(event);

    store.failNextUpsert = true;
    await expect(handleWebhook(req1)).rejects.toThrow();

    // The dedupe row must NOT survive the rollback — otherwise a redelivery would be
    // (wrongly) treated as an already-seen replay and silently dropped forever.
    expect(store.billingEvents.has("evt_rollback")).toBe(false);
    expect(store.subscriptions.has("sub_rollback")).toBe(false);

    // Redelivery (same event, no injected failure this time) processes fully.
    const req2 = buildSignedRequest(event);
    const res2 = await handleWebhook(req2);
    expect(res2.status).toBe(200);
    expect(store.billingEvents.has("evt_rollback")).toBe(true);
    expect(store.subscriptions.has("sub_rollback")).toBe(true);
  });
});

describe("handleWebhook — userId resolution chain (H.10.7)", () => {
  it("metadata.userId present → used directly", async () => {
    const sub = buildSubscription({ id: "sub_meta", metadata: { userId: "user_meta" } });
    const event = buildEvent({ type: "customer.subscription.created", dataObject: sub });
    await handleWebhook(buildSignedRequest(event));

    expect(store.subscriptions.get("sub_meta")).toMatchObject({ userId: "user_meta" });
  });

  it("metadata absent → falls back to an existing cached row for the same customer", async () => {
    store.subscriptions.set("sub_existing", {
      providerSubscriptionId: "sub_existing",
      userId: "user_by_customer",
      provider: "stripe",
      providerCustomerId: "cus_shared",
      providerPriceId: "price_pro_test",
      planId: "pro",
      status: "active",
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
      lastEventCreated: 100,
      updatedAt: new Date(),
    });

    const sub = buildSubscription({ id: "sub_new", customer: "cus_shared", metadata: {} });
    const event = buildEvent({
      type: "customer.subscription.created",
      created: 200,
      dataObject: sub,
    });
    const res = await handleWebhook(buildSignedRequest(event));

    expect(res.status).toBe(200);
    expect(store.subscriptions.get("sub_new")).toMatchObject({ userId: "user_by_customer" });
  });

  it("neither metadata nor a cached customer row → 200, records nothing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sub = buildSubscription({ id: "sub_orphan", customer: "cus_unknown", metadata: {} });
    const event = buildEvent({ type: "customer.subscription.created", dataObject: sub });
    const res = await handleWebhook(buildSignedRequest(event));

    expect(res.status).toBe(200);
    expect(store.subscriptions.has("sub_orphan")).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    // The dedupe row IS recorded (the event itself was validly received and handled —
    // only the cache write was skipped) so a Dashboard-created-subscription event isn't
    // reprocessed forever.
    expect(store.billingEvents.has(event.id)).toBe(true);
  });
});

describe("handleWebhook — unknown price id (H.10.6)", () => {
  it('NEW subscription with an unrecognized price → cached as "unknown"', async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sub = buildSubscription({
      id: "sub_unknown_price",
      metadata: { userId: "user_1" },
      priceId: "price_nonexistent",
    });
    const event = buildEvent({ type: "customer.subscription.created", dataObject: sub });
    await handleWebhook(buildSignedRequest(event));

    expect(store.subscriptions.get("sub_unknown_price")).toMatchObject({ planId: "unknown" });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("EXISTING row keeps its cached plan_id when a later event carries an unrecognized price", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const good = buildSubscription({
      id: "sub_drift",
      metadata: { userId: "user_1" },
      priceId: "price_pro_test",
    });
    const first = buildEvent({
      type: "customer.subscription.created",
      created: 100,
      dataObject: good,
    });
    await handleWebhook(buildSignedRequest(first));
    expect(store.subscriptions.get("sub_drift")).toMatchObject({ planId: "pro" });

    const drifted = buildSubscription({
      id: "sub_drift",
      metadata: { userId: "user_1" },
      priceId: "price_nonexistent",
    });
    const second = buildEvent({
      type: "customer.subscription.updated",
      created: 200,
      dataObject: drifted,
    });
    await handleWebhook(buildSignedRequest(second));

    // Never a false-revoke of a paying customer over catalog/Stripe drift.
    expect(store.subscriptions.get("sub_drift")).toMatchObject({ planId: "pro" });
    expect(errorSpy).toHaveBeenCalled();
  });
});
