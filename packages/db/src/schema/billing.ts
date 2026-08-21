import { bigint, boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Billing domain (spec §5.3, plan H.2.4 as corrected by H.10.5/H.10.13) — a webhook-fed
 * Postgres CACHE of Stripe subscription state. Entitlement reads ONLY this table, never
 * the provider API (spec hot-path rule).
 *
 * PK is `providerSubscriptionId`, NOT `userId` (H.10.5 correction over the original
 * plan): a per-user PK loses the OLD subscription row on resubscribe/second-checkout
 * (Stripe creates a brand-new subscription id), which would silently orphan that user's
 * entitlement history. `userId` is indexed, not unique — `getEntitlement` picks the best
 * ENTITLED_STATUSES row for the user, tie-broken by `current_period_end desc`.
 *
 * `lastEventCreated` is the PER-SUBSCRIPTION ordering guard (H.10.2/13): Stripe webhook
 * delivery is unordered, so every upsert is guarded by `last_event_created <=
 * event.created` at the call site (STRICT less-than on write — same-second
 * later-arriving stale events must not win; a dropped same-second legitimate event heals
 * on the next event). `mode: "number"` is required — bigint's default string mode won't
 * compare against Stripe's `event.created: number` in application code.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    providerSubscriptionId: text("provider_subscription_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    providerPriceId: text("provider_price_id").notNull(),
    planId: text("plan_id").notNull(),
    status: text("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    lastEventCreated: bigint("last_event_created", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("subscriptions_user_id_idx").on(table.userId)],
);

/**
 * Webhook dedupe ledger (plan H.10.2): the adapter's webhook transaction inserts
 * `event.id` here (`onConflictDoNothing`, 0 rows affected ⇒ already-seen ⇒ short-circuit
 * 200) BEFORE resolving/upserting `subscriptions`, and commits both in the SAME
 * transaction — commit is the only thing that marks an event processed, so a failure
 * after the dedupe insert rolls the row back too (redelivery is then reprocessed, not
 * silently dropped). Pruned opportunistically (rows older than 30 days) inside that same
 * webhook transaction — no standalone cleanup job at template scale (H.10.18).
 */
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
