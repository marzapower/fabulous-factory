import { createAuthProxy } from "@factory/ui/middleware";

// `/api/billing/webhook` (Stripe) and `/api/inngest` (Inngest cloud/dev invocations) are
// server-to-server routes — cookie-less by nature, since the caller is Stripe or Inngest,
// never a signed-in browser. This proxy is optimistic-only (spec §8.5, see
// `@factory/ui/middleware`'s file doc comment); the REAL boundary for both is each
// route's own request-time auth — Stripe signature verification
// (`defineHandler({ auth: "webhook", ... })` in `app/api/billing/webhook/route.ts`) and
// Inngest's own request signing inside `serve()` (`app/api/inngest/route.ts`) — so
// redirecting an unauthenticated delivery to `/login` here only breaks it before that real
// check ever runs. EXACT entries, not prefixes (H.10 review fix): both are single flat
// routes with no sub-paths of their own — unlike `/api/auth/`, which fans out to many
// sub-paths under Better Auth's `[...all]` catch-all and genuinely needs a prefix — so a
// prefix match here was looser than its own justification, silently also allowlisting
// anything an attacker appended after either path (e.g. `/api/inngest/../../some-protected-
// route` would never reach that far, but `/api/billing/webhook-evil` or any other
// same-prefix sibling route added later would slip through unauthenticated for free).
// `/api/inngest` closes a gap that has existed since M6 (the route shipped without this
// entry); found live during the M7 billing-webhook verify, which hit the identical failure
// mode on the new `/api/billing/webhook` route.
export const proxy = createAuthProxy({
  extraExactAllowlist: ["/api/billing/webhook", "/api/inngest"],
});

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
