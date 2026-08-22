import "server-only";

// The spec §5.3 BillingProvider seam (plan H.0/H.4). apps/web is the only external
// consumer (H.10.9 — the jobs → billing edge was deleted; entitlement is resolved at
// the action layer and passed down to `createRun`), so this barrel exports
// exactly the cross-agent-pinned surface and nothing else.
export { getBillingProvider, type BillingProvider } from "./provider";
export { getEntitlement, ENTITLED_STATUSES, type Entitlement } from "./entitlement";
export { BillingDisabledError, describeBillingError, type BillingErrorDescription } from "./errors";
