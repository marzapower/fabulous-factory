---
name: enable-billing
description: Turn on real Stripe billing for your product — env vars, plan catalog, webhook testing, entitlement checks. Use when you're ready to charge money, or to verify the billing seam before you are.
---

# Enable billing

Billing is optional by design (`disabled` adapter = free mode, checkout hidden) until you
set two env vars. This skill turns it on for real.

## Phase 1 — Env vars

Set in `.env` (names from `packages/config/src/registry.ts`, the single source of truth):

- `STRIPE_SECRET_KEY` — your Stripe secret key. `sk_test_...` in development.
- `STRIPE_WEBHOOK_SECRET` — the webhook signing secret (Phase 3 shows you where this
  comes from).
- `BILLING_PROVIDER` — optional explicit override; set to `disabled` to force billing off
  even with Stripe keys present.

Both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` must be set for the `stripe` adapter
to activate — either alone leaves billing `disabled`. Confirm with `pnpm factory:doctor`.

## Phase 2 — Plan catalog

Edit `packages/config/src/plans.ts` — the single source of truth `PLANS` catalog reads
from. For each paid plan, replace the placeholder `providerRefs.stripe` (ships as
`"price_REPLACE_ME"`) with a real Stripe Price ID from your Dashboard. Keep `id`,
`monitorLimit` (or your product's equivalent), and `priceUsdMonthly` in sync with what
you actually charge — `PRODUCT.md`'s pricing table should mirror this file, not the other
way around.

## Phase 3 — Webhook, locally

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Copy the `whsec_...` value it prints into `STRIPE_WEBHOOK_SECRET`. Trigger a test event
(`stripe trigger checkout.session.completed`) and confirm the subscription cache updates
— app code reads that cache, never the Stripe API, on the hot path.

## Phase 4 — Entitlement checks

Feature gating belongs at the action/handler layer (inside `defineAction`/`defineHandler`
bodies), reading the cached plan from the entitlement resolver — never re-derived from a
live Stripe call, and never gated in the UI alone (a hidden button is not enforcement).

## Phase 5 — Before shipping

`pnpm preflight` blocks a `production`-stage ship if `STRIPE_SECRET_KEY` still starts
with `sk_test_` — swap to a live key deliberately, not by accident, via
`pre-ship-check`.
