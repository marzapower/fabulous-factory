/**
 * Signed webhook fixtures (plan H.1/H.4/H.5). Uses the REAL `stripe` SDK, instantiated
 * with a dummy key, purely for `webhooks.generateTestHeaderString`/`constructEvent` —
 * both are pure local HMAC operations, no network — per the house-approved exception for
 * unit-testing the webhook signature path.
 */
import Stripe from "stripe";

export const TEST_WEBHOOK_SECRET = "whsec_test_secret";
export const TEST_STRIPE_SECRET_KEY = "sk_test_dummy";

const signingClient = new Stripe(TEST_STRIPE_SECRET_KEY);

/** A raw JSON payload string + a valid `stripe-signature` header for it. */
export function signPayload(payloadObj: unknown, secret: string = TEST_WEBHOOK_SECRET) {
  const payload = JSON.stringify(payloadObj);
  const signature = signingClient.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, signature };
}

/** Builds a `Request` carrying a validly-signed body, matching what `handleWebhook`
 * expects to read via `req.text()` + the `stripe-signature` header. */
export function buildSignedRequest(
  payloadObj: unknown,
  secret: string = TEST_WEBHOOK_SECRET,
): Request {
  const { payload, signature } = signPayload(payloadObj, secret);
  return new Request("https://example.test/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body: payload,
  });
}

export interface SubscriptionOverrides {
  id?: string;
  customer?: string;
  metadata?: Record<string, string>;
  status?: string;
  cancelAtPeriodEnd?: boolean;
  priceId?: string;
  currentPeriodEnd?: number;
}

/** A basil-shaped `Stripe.Subscription` — `current_period_end`/`price` live on
 * `items.data[0]`, not the subscription root (H.1's basil rename). Only the fields our
 * source code reads are populated; `constructEvent` never validates the payload shape
 * beyond well-formed JSON, so nothing else is required for a realistic test double. */
export function buildSubscription(overrides: SubscriptionOverrides = {}) {
  return {
    id: overrides.id ?? "sub_123",
    object: "subscription",
    customer: overrides.customer ?? "cus_123",
    metadata: overrides.metadata ?? {},
    status: overrides.status ?? "active",
    cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
    items: {
      object: "list",
      data: [
        {
          id: "si_123",
          object: "subscription_item",
          current_period_end: overrides.currentPeriodEnd ?? 1_893_456_000,
          price: { id: overrides.priceId ?? "price_pro_test", object: "price" },
        },
      ],
    },
  };
}

export interface EventOverrides {
  id?: string;
  type: string;
  created?: number;
  dataObject: unknown;
}

let eventCounter = 0;

/** A minimally-complete `Stripe.Event` envelope around one `dataObject`. */
export function buildEvent(overrides: EventOverrides) {
  eventCounter += 1;
  return {
    id: overrides.id ?? `evt_${eventCounter}`,
    object: "event",
    api_version: "2026-07-29.dahlia",
    created: overrides.created ?? 1_700_000_000,
    data: { object: overrides.dataObject },
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type: overrides.type,
  };
}
