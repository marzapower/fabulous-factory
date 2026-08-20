import { serve } from "inngest/next";
import { functions, inngest } from "@factory/jobs";

// Allowlisted framework mount (plan G.2.8/G.10.11, mirrors the better-auth precedent at
// apps/web/app/api/auth/[...all]/route.ts): the raw-handler lint rule forbids every other
// form of exporting GET/POST(/PUT) from a route file, but this exact destructure — on
// this exact file, calling `serve` — is a registered `FRAMEWORK_MOUNTS` entry
// (eslint.config.mjs). `serve()` never throws at module scope (plan G.1): a missing
// signing key only rejects requests at request time, and only in cloud mode — dev mode
// (`INNGEST_DEV=1`) skips signature checks entirely. Safe to mount unconditionally,
// regardless of whether jobs are configured.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
