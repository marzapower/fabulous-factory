/**
 * `getBillingProvider()` — the spec §5.3 seam (plan H.2.5, corrected by H.10.3). Reads
 * `getCapabilities().billing` and resolves to a stateless module-singleton adapter: the
 * `disabled` adapter is imported STATICALLY (it touches no vendor SDK, so there's
 * nothing to guard), while the `stripe` adapter is loaded via a guarded dynamic
 * `import()` — the `stripe` package must NEVER be loaded into memory when billing is
 * disabled, mirroring `packages/email/src/send.ts` and `packages/llm/src/profile.ts`.
 *
 * `getBillingProvider` is itself `async` (H.10.3's cross-agent pin) purely because of
 * that dynamic import — the resolved provider object is memoized per capability value,
 * re-resolved only if `getCapabilities().billing` ever changes within the same process
 * (it doesn't in practice; capabilities are memoized too, but this keeps the cache
 * honest rather than assuming that invariant).
 */
import { getCapabilities, type PlanId } from "@factory/config";

import { disabledProvider } from "./adapters/disabled";

export interface BillingProvider {
  createCheckout(opts: {
    userId: string;
    plan: PlanId;
    successUrl: string;
  }): Promise<{ url: string }>;
  getPortalUrl(userId: string): Promise<{ url: string } | null>;
  handleWebhook(req: Request): Promise<Response>;
}

let cachedProvider: Promise<BillingProvider> | undefined;
let cachedCapability: string | undefined;

async function resolveProvider(capability: string): Promise<BillingProvider> {
  if (capability === "stripe") {
    const { stripeProvider } = await import("./adapters/stripe");
    return stripeProvider;
  }
  return disabledProvider;
}

export async function getBillingProvider(): Promise<BillingProvider> {
  const capability = getCapabilities().billing;
  if (!cachedProvider || cachedCapability !== capability) {
    cachedCapability = capability;
    cachedProvider = resolveProvider(capability);
  }
  return cachedProvider;
}
