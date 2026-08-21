/**
 * `disabled` adapter (plan H.2.6): the static counterpart of `adapters/stripe.ts`'s
 * guarded dynamic import (H.10.3) — safe to import unconditionally since it touches no
 * vendor SDK. A plain object literal is the whole "stateless singleton" here — there's
 * no client to memoize.
 */
import { BillingDisabledError } from "../errors";
import type { BillingProvider } from "../provider";

export const disabledProvider: BillingProvider = {
  async createCheckout() {
    throw new BillingDisabledError();
  },

  async getPortalUrl() {
    return null;
  },

  async handleWebhook() {
    return Response.json({ error: "no billing provider configured" }, { status: 404 });
  },
};
