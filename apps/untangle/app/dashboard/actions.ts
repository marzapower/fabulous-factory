"use server";

import { z } from "zod";

import { ApiError, defineAction } from "@factory/core";
import { describeBillingError, getBillingProvider, getEntitlement } from "@factory/billing";
import { getAppUrl, PLANS, type PlanId } from "@factory/config";
import { createManualTask, deleteTaskRow, MAX_TITLE_CHARS, setTaskStatus } from "@factory/untangle";

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

const taskIdInput = z.object({ id: z.uuid() });

/**
 * Flips a task between `open`/`done` (the workspace's checkbox). `setTaskStatus` is
 * ownership-scoped by `(id, userId)` at the query layer (`packages/untangle/src/tasks/
 * queries.ts`) — this action adds no second, unscoped lookup on top of it; a 404 here
 * means either the task never existed or it belongs to someone else, and both read the
 * same to the caller.
 */
export const toggleTaskAction = defineAction({
  auth: "required",
  input: taskIdInput.extend({ status: z.enum(["open", "done"]) }),
  action: async ({ session, input }) => {
    const updated = await setTaskStatus(input.id, session.user.id, input.status);
    if (!updated) {
      throw new ApiError(404, "task_not_found", "That task is gone already.");
    }
    return { id: input.id, status: input.status } as const;
  },
});

/** Postgres `integer` ceiling. The offsets land in `int4` columns
 * (`packages/db/src/schema/task.ts`), so an unbounded number is not a "big offset" — it
 * is an overflow that surfaces as an opaque 500 instead of a 400 naming the field. */
const PG_INT4_MAX = 2_147_483_647;

const createManualTaskInput = z
  .object({
    // `.trim()` before `.min(1)`: the client trims, but the boundary is what has to
    // enforce it — a title of pure whitespace is not a task.
    title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
    // Set when the task is created from a leftover (unconsumed) span of a capture's dump
    // text (K.9's "click a leftover span" affordance) — omitted for a plain manual add.
    // Ownership of the capture is verified in `createManualTask`, not here.
    captureId: z.uuid().optional(),
    sourceStart: z.number().int().min(0).max(PG_INT4_MAX).optional(),
    sourceEnd: z.number().int().min(0).max(PG_INT4_MAX).optional(),
  })
  .refine(
    (v) => v.sourceStart === undefined || v.sourceEnd === undefined || v.sourceEnd > v.sourceStart,
    { path: ["sourceEnd"], message: "sourceEnd must be greater than sourceStart" },
  );

export const createManualTaskAction = defineAction({
  auth: "required",
  input: createManualTaskInput,
  rateLimit: { name: "create-manual-task", windowSeconds: 60, max: 20 },
  action: async ({ session, input }) => {
    return createManualTask({
      userId: session.user.id,
      title: input.title,
      captureId: input.captureId ?? null,
      sourceStart: input.sourceStart ?? null,
      sourceEnd: input.sourceEnd ?? null,
    });
  },
});

export const deleteTaskAction = defineAction({
  auth: "required",
  input: taskIdInput,
  action: async ({ session, input }) => {
    const deleted = await deleteTaskRow(input.id, session.user.id);
    if (!deleted) {
      throw new ApiError(404, "task_not_found", "That task is gone already.");
    }
    return { deleted: true } as const;
  },
});
