import { defineHandler } from "@factory/core";

// Liveness only (design spec §12): the full capability map is recon data for an
// attacker and is exposed only via `pnpm factory:doctor`, never over this public HTTP
// endpoint. `rateLimit: "none"` is deliberate — liveness must never be limited (plan
// D.6).
export const GET = defineHandler({
  auth: "public",
  input: "none",
  rateLimit: "none",
  handler: async () => ({ status: "ok" }),
});
