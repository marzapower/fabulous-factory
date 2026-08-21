import { defineHandler } from "@factory/core";
import { getBillingProvider } from "@factory/billing";

/**
 * Provider-agnostic billing webhook mount (m7-billing.md §H.2.8, corrected by H.10.1).
 *
 * `auth: "webhook"` is its own `defineHandler` discriminant — the signature check
 * performed inside the adapter's `handleWebhook` IS the authentication, so there is no
 * session lookup, auth gate, origin check, or `input` schema here at all (a `"public"`
 * arm would admit those keys silently and break the wrapper). This route is
 * deliberately left OUT of the rate limiter too: rate-limiting a webhook only teaches
 * the provider to retry harder, and origin checks are meaningless for server-to-server
 * delivery. `defineHandler`'s webhook branch already caps the body at 1 MiB (413)
 * before this function is ever invoked, and never itself reads the body — Stripe's
 * signature check needs the raw, single-consumption bytes, which the adapter owns
 * exclusively via one `await req.text()`.
 */
export const POST = defineHandler({
  auth: "webhook",
  webhook: async (req) => (await getBillingProvider()).handleWebhook(req),
});
