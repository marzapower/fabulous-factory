/**
 * `describeBillingError` unit matrix (H.10 review fix) — the two branches the dashboard
 * server actions rely on, plus a mocked provider rejection flowing all the way through
 * `describeBillingError` the way `createCheckoutAction`'s own catch block would see it.
 */
import { describe, expect, it } from "vitest";

import { BillingDisabledError, describeBillingError } from "../src/errors";

describe("describeBillingError", () => {
  it("BillingDisabledError → 409 billing_disabled with a friendly message", () => {
    const result = describeBillingError(new BillingDisabledError());
    expect(result).toEqual({
      status: 409,
      code: "billing_disabled",
      message: "Billing isn't turned on for this deployment.",
    });
  });

  it("any other error → 502 billing_provider_error with a Stripe-configuration hint", () => {
    const result = describeBillingError(new Error("stripe: no such price 'price_missing'"));
    expect(result.status).toBe(502);
    expect(result.code).toBe("billing_provider_error");
    expect(result.message).toMatch(/stripe configuration/i);
  });

  it("a non-Error thrown value still maps to the 502 branch", () => {
    const result = describeBillingError("not an Error instance");
    expect(result).toMatchObject({ status: 502, code: "billing_provider_error" });
  });

  it("a mocked createCheckout rejection flows through to the 502 branch", async () => {
    async function createCheckout(): Promise<{ url: string }> {
      throw new Error("stripe checkout session response had no url");
    }

    let described;
    try {
      await createCheckout();
    } catch (err) {
      described = describeBillingError(err);
    }

    expect(described).toMatchObject({ status: 502, code: "billing_provider_error" });
  });

  it("a mocked createCheckout rejection with BillingDisabledError flows through to the 409 branch", async () => {
    async function createCheckout(): Promise<{ url: string }> {
      throw new BillingDisabledError();
    }

    let described;
    try {
      await createCheckout();
    } catch (err) {
      described = describeBillingError(err);
    }

    expect(described).toMatchObject({ status: 409, code: "billing_disabled" });
  });
});
