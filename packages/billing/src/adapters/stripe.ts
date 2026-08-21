/**
 * `stripe` adapter (plan H.2.5/9/10, corrected by H.10.2/3/5/6/7/13/15/18). Loaded ONLY
 * via `provider.ts`'s guarded `await import("./adapters/stripe")` — so the top-level
 * `import Stripe from "stripe"` below (v22's default-import idiom; default === named at
 * runtime, and the class doubles as the `Stripe.*` type namespace, e.g.
 * `Stripe.Subscription`/`Stripe.Event` — top-level NAMED type imports fail TS2614) only
 * ever executes when `capabilities.billing === "stripe"`.
 *
 * The adapter module itself is a stateless singleton (a plain exported object); the
 * Stripe CLIENT is the thing actually memoized, lazily, keyed on `STRIPE_SECRET_KEY` —
 * mirrors `packages/email/src/send.ts`'s `getResendClient`.
 */
import Stripe from "stripe";
import { desc, eq, sql } from "drizzle-orm";

import { getAppUrl, getEnv, type PlanId } from "@factory/config";
import { getDb, schema } from "@factory/db";

import { planById, resolvePlanId } from "../plans-lookup";
import type { BillingProvider } from "../provider";

let stripeClient: Stripe | undefined;
let stripeClientKey: string | undefined;

/** Lazy client singleton (H.10.3), re-constructed only if `STRIPE_SECRET_KEY` changes
 * within the process (rotated env in a long-lived test run) — never on every call. */
function getClient(): Stripe {
  const secretKey = getEnv().STRIPE_SECRET_KEY;
  if (!secretKey) {
    // Unreachable in practice: `deriveBilling` only resolves to "stripe" when
    // STRIPE_SECRET_KEY is set, and provider.ts only loads this module on that branch.
    // Kept as a loud runtime guard rather than a `!` assertion — this is the payment
    // path.
    throw new Error("[@factory/billing] STRIPE_SECRET_KEY is not set");
  }
  if (!stripeClient || stripeClientKey !== secretKey) {
    stripeClient = new Stripe(secretKey);
    stripeClientKey = secretKey;
  }
  return stripeClient;
}

function customerIdOf(customer: Stripe.Subscription["customer"]): string {
  return typeof customer === "string" ? customer : customer.id;
}

/** Any cached row for the user, newest-updated first (H.10 createCheckout/getPortalUrl
 * both key off "a"/"the" cached `provider_customer_id`, not a specific subscription). */
async function cachedCustomerId(userId: string): Promise<string | undefined> {
  const db = getDb();
  const [row] = await db
    .select({ customerId: schema.subscriptions.providerCustomerId })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .orderBy(desc(schema.subscriptions.updatedAt))
    .limit(1);
  return row?.customerId;
}

async function createCheckout(opts: {
  userId: string;
  plan: PlanId;
  successUrl: string;
}): Promise<{ url: string }> {
  const priceId = planById(opts.plan).providerRefs.stripe;
  if (!priceId || /REPLACE/.test(priceId)) {
    throw new Error(`plan has no stripe price configured (plan: ${opts.plan})`);
  }

  const client = getClient();
  const existingCustomerId = await cachedCustomerId(opts.userId);

  const session = await client.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl,
    // Adapter-derived, not a spec param (H.10.15) — the interface keeps the spec §5.3
    // signature `{ userId, plan, successUrl }`; cancelUrl always returns to the
    // dashboard via the one APP_URL resolution helper.
    cancel_url: `${getAppUrl()}/dashboard`,
    // Belt-and-braces userId correlation (H.1): echoed on checkout.session.completed
    // AND lands on the Subscription's own metadata, so every customer.subscription.*
    // event self-identifies without a Checkout Session round-trip.
    client_reference_id: opts.userId,
    subscription_data: { metadata: { userId: opts.userId } },
    ...(existingCustomerId ? { customer: existingCustomerId } : {}),
  });

  if (!session.url) {
    throw new Error("stripe checkout session response had no url");
  }
  return { url: session.url };
}

async function getPortalUrl(userId: string): Promise<{ url: string } | null> {
  const customerId = await cachedCustomerId(userId);
  if (!customerId) {
    return null;
  }

  const client = getClient();
  // A portal-unconfigured Stripe account throws here — deliberately NOT caught (H.1/
  // H.10 review note): the action layer (apps/web) maps it to a typed, friendly error.
  const session = await client.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getAppUrl()}/dashboard`,
  });
  return { url: session.url };
}

type DbTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** 30-day opportunistic prune of the dedupe ledger (H.10.18) — no standalone cleanup job
 * at template scale. Runs POST-COMMIT, best-effort (H.10 review fix over H.10.18's
 * "inside the transaction" wording): H.10.2's rule that commit is the ONLY thing that
 * marks an event processed wins over that detail — a prune failure (lock contention, a
 * transient connection error) must never roll back, and therefore must never 500, an
 * already-processed payment event. Swallows its own errors. */
async function pruneOldEvents(): Promise<void> {
  try {
    const db = getDb();
    await db
      .delete(schema.billingEvents)
      .where(sql`${schema.billingEvents.createdAt} < now() - interval '30 days'`);
  } catch (error) {
    console.error("[@factory/billing] post-commit billing_events prune failed", error);
  }
}

/**
 * Upserts the `subscriptions` cache row for one `customer.subscription.*` event
 * (H.10.5/6/7/13). Runs INSIDE the caller's dedupe transaction — everything here is
 * pure DB work, no network calls.
 */
async function upsertSubscriptionFromEvent(
  tx: DbTx,
  event: Stripe.Event,
  sub: Stripe.Subscription,
): Promise<void> {
  const customerId = customerIdOf(sub.customer);

  // userId resolution chain (H.10.7, pinned): metadata (set by our own checkout) →
  // existing cached row for this customer → give up, warn, record nothing.
  // `Metadata`'s index signature types this `string` (never `undefined`) even though
  // Stripe won't actually send the key when it's absent — normalize a missing/empty
  // value to `undefined` explicitly rather than trust the signature.
  let userId: string | undefined = sub.metadata.userId || undefined;
  if (!userId) {
    const [byCustomer] = await tx
      .select({ userId: schema.subscriptions.userId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.providerCustomerId, customerId))
      .limit(1);
    userId = byCustomer?.userId;
  }
  if (!userId) {
    console.warn(
      `[@factory/billing] webhook ${event.id}: cannot resolve userId for subscription ${sub.id} ` +
        "(no metadata.userId, no cached row for this customer) — recording nothing " +
        "(likely a Dashboard-created subscription).",
    );
    return;
  }

  const item = sub.items.data[0];
  if (!item) {
    // Defensive only — Stripe subscriptions always carry at least one item.
    console.error(
      `[@factory/billing] webhook ${event.id}: subscription ${sub.id} has no items — skipping`,
    );
    return;
  }
  const priceId = item.price.id;
  // Guarded (H.10 review fix): `current_period_end` is basil-relocated onto the item and
  // Stripe's own types leave nothing preventing a missing/non-number value from a
  // malformed or future payload shape — `new Date(NaN)` would otherwise get written
  // silently. The column is nullable, so "unknown" is `null`, never an invalid Date.
  const currentPeriodEnd =
    typeof item.current_period_end === "number" ? new Date(item.current_period_end * 1000) : null;

  // Unknown-price handling (H.10.6, as directed for this DAG — billing has no
  // `@factory/observability` dependency, so this is `console.error`, not
  // `captureException`; deviation noted in the implementation report). NEW
  // subscription with an unrecognized price → cache "unknown", not entitled. An
  // EXISTING row keeps its cached `plan_id` — false-revoking a paying customer over a
  // catalog/Stripe drift is the worse failure.
  const resolved = resolvePlanId(priceId);
  let planId: string;
  if (resolved !== "unknown") {
    planId = resolved;
  } else {
    const [existing] = await tx
      .select({ planId: schema.subscriptions.planId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.providerSubscriptionId, sub.id))
      .limit(1);
    planId = existing?.planId ?? "unknown";
    console.error(
      `[@factory/billing] webhook ${event.id}: unrecognized stripe price "${priceId}" on subscription ` +
        `${sub.id} — catalog/Stripe drift; ${existing ? `keeping cached plan_id "${planId}"` : 'caching as "unknown"'}.`,
    );
  }

  await tx
    .insert(schema.subscriptions)
    .values({
      providerSubscriptionId: sub.id,
      userId,
      provider: "stripe",
      providerCustomerId: customerId,
      providerPriceId: priceId,
      planId,
      status: sub.status,
      currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      lastEventCreated: event.created,
    })
    .onConflictDoUpdate({
      target: schema.subscriptions.providerSubscriptionId,
      set: {
        userId,
        providerCustomerId: customerId,
        providerPriceId: priceId,
        planId,
        status: sub.status,
        currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        lastEventCreated: event.created,
        updatedAt: new Date(),
      },
      // Ordering guard (H.10.2/13): STRICT less-than — a same-second later-arriving
      // stale event must not win; a same-second legitimate event that loses heals on
      // the next event.
      setWhere: sql`${schema.subscriptions.lastEventCreated} < ${event.created}`,
    });
}

async function handleWebhook(req: Request): Promise<Response> {
  const env = getEnv();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Same unreachable-in-practice guard as getClient() — see its comment.
    throw new Error("[@factory/billing] STRIPE_WEBHOOK_SECRET is not set");
  }

  const client = getClient();
  const signature = req.headers.get("stripe-signature") ?? "";
  // Single consumption (H.1) — the wrapper (defineHandler's webhook arm) never touches
  // the body; this is the ONLY read.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(raw, signature, webhookSecret);
  } catch (error) {
    // Log ONLY the error message (H.10 review fix) — this route is unauthenticated and
    // deliberately unrate-limited, so it's a standing target; a `StripeSignatureVerificationError`
    // carries `.payload` (the full attacker-controlled request body) as an enumerable own
    // property, and passing the error object itself to console would print that body into
    // the logs on every failed-signature probe. Never log it.
    console.warn(
      "[@factory/billing] webhook signature verification failed:",
      error instanceof Error ? error.message : String(error),
    );
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  const db = getDb();
  // ONE transaction for the dedupe insert + cache upsert (H.10.2, the G.12.1 bug
  // class): commit is the only thing that marks an event processed. Any error thrown
  // inside rolls the whole thing back — including the dedupe row — so a redelivery
  // reprocesses fully instead of being silently swallowed as "already seen".
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.billingEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing()
      .returning({ id: schema.billingEvents.id });

    if (inserted.length === 0) {
      // Replay of an already-processed event.id — commit (nothing changed) and 200.
      return;
    }

    // switch (event.type) narrows event.data.object per case — compile-verified (plan
    // H.1); the 4+2 event types get real handling, everything else no-ops (never
    // 4xx/5xx for "not interesting" — H.2.9).
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await upsertSubscriptionFromEvent(tx, event, event.data.object);
        break;
      case "checkout.session.completed":
        // Log-only (H.10.7) — hot-path/response-time budget; the cache is fed solely
        // by customer.subscription.* (`.created` already carries the full object).
        console.log(
          `[@factory/billing] checkout.session.completed: session ${event.data.object.id} ` +
            "(log-only, no cache write)",
        );
        break;
      case "invoice.payment_failed":
        console.warn(`[@factory/billing] invoice.payment_failed: invoice ${event.data.object.id}`);
        break;
      default:
        break;
    }
  });

  // Best-effort, post-commit (H.10 review fix — see pruneOldEvents' comment). Never
  // awaited into the transaction above and never allowed to turn a successfully
  // processed webhook into a 500.
  await pruneOldEvents();

  return Response.json({ received: true });
}

export const stripeProvider: BillingProvider = { createCheckout, getPortalUrl, handleWebhook };
