/**
 * Typed billing errors (plan H.0/H.4). `BillingDisabledError` is the ONE error class
 * pinned across the billing/web boundary (cross-agent contract, H.10.18): the `disabled`
 * adapter's `createCheckout` throws it before touching any provider, and apps/web's
 * checkout server action maps it to `ApiError`'s `billing_disabled` code itself (H.10.8
 * — billing does not depend on `@factory/core` for that mapping; the DAG stays
 * `billing → config, db` only).
 */
export class BillingDisabledError extends Error {
  readonly code = "billing_disabled" as const;

  constructor(message?: string) {
    super(message ?? "Billing is not configured for this environment.");
    this.name = "BillingDisabledError";
  }
}

/** The shape apps/web's server actions need to build an `ApiError` — status/code/message
 * only, never the `@factory/core` type itself (H.10.8: billing stays free of a `core`
 * dependency). */
export interface BillingErrorDescription {
  status: number;
  code: string;
  message: string;
}

/**
 * Maps any error a `BillingProvider` call can throw onto the two typed shapes the UI
 * needs to render (H.10 review fix — this used to be duplicated inline in both dashboard
 * server actions; unit-testable here instead). `BillingDisabledError` → a calm 409 the UI
 * can render inline; anything else (bad/missing Stripe keys, network trouble, an
 * unconfigured price id, a portal-unconfigured account) → a 502 with a hint to check the
 * Stripe configuration, never a raw provider stack trace.
 */
export function describeBillingError(err: unknown): BillingErrorDescription {
  if (err instanceof BillingDisabledError) {
    return {
      status: 409,
      code: "billing_disabled",
      message: "Billing isn't turned on for this deployment.",
    };
  }
  return {
    status: 502,
    code: "billing_provider_error",
    message:
      "We couldn't reach the billing provider. Check the Stripe configuration and try again.",
  };
}
