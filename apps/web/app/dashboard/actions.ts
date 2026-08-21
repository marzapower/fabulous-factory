"use server";

import { z } from "zod";

import { ApiError, defineAction } from "@factory/core";
import { describeBillingError, getBillingProvider, getEntitlement } from "@factory/billing";
import { getAppUrl, PLANS, type PlanId } from "@factory/config";
import {
  checkMonitor,
  createMonitorRow,
  deleteMonitorRow,
  getMonitorForUser,
  recordMonitorError,
  type CheckOutcome,
} from "@factory/jobs";

const createMonitorInput = z.object({
  name: z.string().min(1).max(100),
  // http/https only, enforced at the schema layer (plan G.10.14) — a bad protocol is a
  // validation error here, never an 'error' event from the check pipeline.
  url: z.url({ protocol: /^https?$/ }),
});

/**
 * Auth "required" per plan G.2.10/G.6. Entitlement is resolved HERE, at the action
 * layer (m7-billing.md H.10.9) — never inside `createMonitorRow`'s advisory-locked
 * transaction, which would open a second pool checkout and risk pool-exhaustion
 * deadlock. `entitlement.monitorLimit` is `null` when billing is disabled (unlimited,
 * modulo `MONITOR_HARD_CEILING`) or a plan-driven number when it's enabled;
 * `createMonitorRow` itself still owns the race-free enforcement against that limit
 * (review fix from M3 — a count-then-insert check here would race between concurrent
 * requests).
 */
export const createMonitorAction = defineAction({
  auth: "required",
  input: createMonitorInput,
  rateLimit: { name: "create-monitor", windowSeconds: 60, max: 10 },
  action: async ({ session, input }) => {
    const entitlement = await getEntitlement(session.user.id);
    return createMonitorRow({
      userId: session.user.id,
      name: input.name,
      url: input.url,
      monitorLimit: entitlement.monitorLimit,
    });
  },
});

// Zod enum derived from the plan catalog's own keys — but PAID plans only (H.10 review
// fix): "free" was previously accepted here and would 502 deep inside
// `provider.createCheckout` (it throws "plan has no stripe price configured"), a purely
// client-shaped mistake mis-surfaced as a provider failure. Never a hand-typed literal
// list either way — a plan added to/removed from `PLANS` changes this validator for free.
const paidPlanIds = Object.values(PLANS)
  .filter((plan) => plan.priceUsdMonthly !== null)
  .map((plan) => plan.id) as [PlanId, ...PlanId[]];
const createCheckoutInput = z.object({ plan: z.enum(paidPlanIds) });

/**
 * Starts a Stripe Checkout session for `input.plan` and returns its redirect URL — the
 * client does `window.location.assign(url)` (m7-billing.md H.2.13: `defineAction`'s
 * never-throws envelope contract can't carry a Next `redirect()`, so returning the URL
 * is the honest, testable shape). Error mapping happens HERE (H.10.8 option b) via
 * `describeBillingError`, so `packages/billing` never gains a `@factory/core` dependency.
 *
 * Guards against double-subscribing (H.10 review fix): fetches entitlement exactly ONCE
 * per invocation — never a second `getEntitlement` call layered on top — and 409s an
 * already-subscribed user toward the portal instead of letting them start a second
 * Checkout session against Stripe.
 */
export const createCheckoutAction = defineAction({
  auth: "required",
  input: createCheckoutInput,
  rateLimit: { name: "billing-checkout", windowSeconds: 60, max: 5 },
  action: async ({ session, input }) => {
    const entitlement = await getEntitlement(session.user.id);
    if (entitlement.source === "subscription") {
      throw new ApiError(
        409,
        "already_subscribed",
        "Manage your plan from the billing portal instead.",
      );
    }

    const provider = await getBillingProvider();
    try {
      return await provider.createCheckout({
        userId: session.user.id,
        plan: input.plan,
        successUrl: `${getAppUrl()}/billing/success`,
      });
    } catch (err) {
      console.error("[dashboard] createCheckoutAction failed", err);
      const d = describeBillingError(err);
      throw new ApiError(d.status, d.code, d.message);
    }
  },
});

/**
 * Opens the Stripe customer portal for the signed-in user. Returns `{ url: string |
 * null }` rather than the provider's own `{ url } | null` shape (H.10.15) — `null` means
 * the user has no billing customer on file yet (never a subscriber, or a subscription
 * that predates a customer record), which the UI renders as an inline notice instead of
 * a redirect. Same error mapping as `createCheckoutAction` (H.10.8).
 */
export const openPortalAction = defineAction({
  auth: "required",
  input: "none",
  rateLimit: { name: "billing-portal", windowSeconds: 60, max: 5 },
  action: async ({ session }) => {
    const provider = await getBillingProvider();
    try {
      const portal = await provider.getPortalUrl(session.user.id);
      return { url: portal?.url ?? null };
    } catch (err) {
      console.error("[dashboard] openPortalAction failed", err);
      const d = describeBillingError(err);
      throw new ApiError(d.status, d.code, d.message);
    }
  },
});

const monitorIdInput = z.object({ id: z.uuid() });

export const deleteMonitorAction = defineAction({
  auth: "required",
  input: monitorIdInput,
  action: async ({ session, input }) => {
    const deleted = await deleteMonitorRow(input.id, session.user.id);
    if (!deleted) {
      throw new ApiError(404, "monitor_not_found", "That monitor is gone already.");
    }
    return { deleted: true } as const;
  },
});

/**
 * `checkMonitor` throws on failure and never writes its own 'error' event (plan
 * G.10.5) — this action is the one place a manual check's failure becomes both a
 * recorded event (via `recordMonitorError`) and a typed result the UI can render
 * without a page-wide error boundary.
 *
 * Not exported: the "use server" raw-handler lint rule only allows `defineAction(...)`
 * call exports from this file (design spec §8.4). `components/demo/check-now-button.tsx`
 * redeclares the equivalent shape from `@factory/jobs`'s `CheckOutcome` instead of
 * importing it from here.
 */
type CheckNowResult = CheckOutcome | { status: "error"; summary: string };

export const checkNowAction = defineAction({
  auth: "required",
  input: monitorIdInput,
  rateLimit: { name: "check-now", windowSeconds: 60, max: 6 },
  action: async ({ session, input }): Promise<CheckNowResult> => {
    const monitor = await getMonitorForUser(input.id, session.user.id);
    if (!monitor) {
      throw new ApiError(404, "monitor_not_found", "That monitor is gone already.");
    }

    try {
      return await checkMonitor(input.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "The check failed.";
      await recordMonitorError(input.id, message);
      return { status: "error", summary: message };
    }
  },
});
