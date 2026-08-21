# Part H — Milestone 7 contracts (billing)

> Written 2026-08-21. "Critique corrections" (H.10) are BINDING and supersede earlier
> text in this file.

### H.0 Scope statement

**In:** `packages/billing` — the spec §5.3 `BillingProvider` seam with `stripe` and
`disabled` adapters, one shared contract suite proving both; `plans.ts` catalog in
`packages/config` (`providerRefs` slot); webhook-cached `subscriptions` table +
`billing_events` dedupe table (migration 0005); `defineHandler` gains the reserved
`webhook` union arm (D.9.17 redeemed); provider-agnostic webhook route; checkout +
customer-portal server actions and a dashboard billing card (hidden entirely when
billing is disabled — the exit criterion); demo entitlement: `packages/jobs`'s monitor
cap becomes plan-driven; doctor billing extensions; boundary rules (stripe SDK confined
to packages/billing).

**Explicitly out:** usage metering, invoicing, tax (spec §5.3); MoR adapters (v2);
`@better-auth/stripe` (exists, mature, compatible-to-ignore: it couples billing into the
auth schema/routes, contradicting the independent `capabilities.billing` degradation
contract — documented decision, not revisited); `@stripe/stripe-js` (hosted Checkout +
Portal are pure server redirects); Stripe CLI as a dependency (documented native
install); dunning emails/UX (`invoice.payment_failed` is logged, not surfaced — M10
polish candidate).

### H.1 Verified library facts (research subagent, 2026-08-21 — npm + compiled typings + runtime probes + docs.stripe.com)

- **`stripe@22.5.0`** (2026-08-10, provenance ✓, ZERO runtime deps). Default-import
  idiom (`import Stripe from "stripe"`; default===named at runtime). **v22 types hang
  off the class namespace** (`Stripe.Subscription`, `Stripe.Event`,
  `Stripe.Checkout.Session`) — top-level named type imports FAIL (TS2614);
  `Stripe.DiscriminatedEvent` no longer exists — `Stripe.Event` IS the discriminated
  union; `switch (event.type)` narrows `event.data.object` under strict TS
  (compile-verified). Constructor is inert (no env/network); SDK pins API version
  `2026-07-29.dahlia`.
- **Checkout**: `stripe.checkout.sessions.create({ mode: "subscription", line_items:
[{ price, quantity: 1 }], success_url, cancel_url, client_reference_id: userId,
subscription_data: { metadata: { userId } }, customer? })` → 303 redirect to
  `session.url`. Correlation belt-and-braces: `client_reference_id` (echoed on
  checkout.session.completed) + `subscription_data.metadata.userId` (lands on the
  Subscription — every subscription.* event self-identifies). Checkout waits ≤10 s for
  the completed-webhook 2xx: handler must be fast.
- **Portal**: `stripe.billingPortal.sessions.create({ customer, return_url })`; a portal
  CONFIGURATION must exist per mode (unconfigured test-mode error text unverified —
  PLAUSIBLE; mitigation: document the Dashboard save + degrade the action to a friendly
  error).
- **Webhooks**: Node-only → sync `stripe.webhooks.constructEvent(rawBody, sig, secret)`
  (tolerance 300 s, replay-protected); raw body via ONE `await req.text()` (Next 15 app
  router does not pre-parse; body is single-consumption — the wrapper must never also
  json()-parse). Minimal mirror event set: `checkout.session.completed`,
  `customer.subscription.created/updated/deleted` (ALL status transitions arrive via
  `.updated`), plus cheap `.paused`/`.resumed`; `invoice.payment_failed` logged only.
  **basil renames in effect**: `current_period_end` lives on
  `sub.items.data[0].current_period_end` (GONE from Subscription);
  `invoice.subscription` → `invoice.parent.subscription_details.subscription`. Delivery
  is UNORDERED → upserts guarded by `event.created`; duplicates → record processed
  `event.id`s (Stripe's current official recipe). Pin the webhook ENDPOINT's API version
  to dahlia when registering (payloads render at endpoint version, not SDK pin) —
  documented in the runbook comment.
- **Statuses** (full enum + forward-compat escape hatch — never exhaustive-switch
  without default): entitled = `active`, `trialing`, and `past_due` (grace period;
  revoke at `unpaid`) — as an exported constant.
- **Testing**: `stripe.webhooks.generateTestHeaderString({ payload, secret, ... })` —
  v22 takes ONE options object (runtime-verified roundtrip with constructEvent). No
  stripe-mock (Go binary, wrong tool); hand-rolled fakes + signed test payloads.
  Local forwarding: `stripe listen --forward-to localhost:3005/api/billing/webhook`
  (dev secret from `--print-secret`, NOT the dashboard secret).

### H.2 Declared design decisions (critic to challenge)

1. **DAG**: `billing` imports `config` + `db` only (+ stripe, confined). `jobs` gains a
   `billing` edge (entitlement at the monitor cap); `web` consumes billing. Final order:
   config ← db ← {auth,email,observability,analytics} ← core ← llm ← billing ← jobs ← web.
2. **`plans.ts` lives in `packages/config/src/plans.ts`** (spec; pure data, DAG-root
   safe): `interface Plan { id: PlanId; name: string; monitorLimit: number | null;
priceUsdMonthly: number | null; providerRefs: { stripe?: string } }`;
   `PLANS = { free: { monitorLimit: 3, price null }, pro: { monitorLimit: 25,
priceUsdMonthly: 9, providerRefs: { stripe: "price_REPLACE_ME" } } }` (placeholder
   catalog — template content adopters replace; `PlanId` derived via keyof;
   `FREE_PLAN_ID` exported). Doctor warns when billing is enabled and a paid plan's
   stripe ref is missing or matches `/REPLACE/`.
3. **Entitlement semantics (degradation matrix)**: `getEntitlement(userId)` in
   packages/billing → `{ planId: PlanId; monitorLimit: number | null; source:
"disabled" | "free" | "subscription" }`. Billing DISABLED → `monitorLimit: null`
   (unlimited free monitors, matrix row 1). Enabled without an entitled subscription →
   the free plan. Enabled + cached subscription with status in `ENTITLED_STATUSES`
   (`active | trialing | past_due`, exported constant) → the subscription's plan.
   Reads ONLY the Postgres cache — never the provider API (spec hot-path rule).
4. **Schema (migration 0005)**: `subscriptions` — `user_id` text PK → user.id cascade
   (ONE subscription per user — KISS, template-honest), `provider` text notNull
   ('stripe'), `provider_subscription_id` text notNull UNIQUE, `provider_customer_id`
   text notNull, `plan_id` text notNull, `status` text notNull, `current_period_end`
   timestamptz NULL, `cancel_at_period_end` boolean notNull default false,
   `last_event_created` bigint notNull (ordering guard), `updated_at` timestamptz
   notNull defaultNow. `billing_events` — `id` text PK (Stripe event id), `type` text
   notNull, `created_at` timestamptz notNull defaultNow (dedupe ledger; prune is a
   non-goal at template scale).
5. **`BillingProvider`** exactly per spec §5.3 (createCheckout/getPortalUrl/
   handleWebhook) with `handleWebhook(req: Request): Promise<Response>` — the
   "normalized events" of the spec are internalized: the adapter maps provider events
   onto cache upserts and returns the HTTP response; a `WebhookResult` DTO between
   adapter and route adds a layer with one consumer (KISS). `getBillingProvider()`
   memoized on `capabilities.billing`.
6. **`disabled` adapter**: `createCheckout` → throws typed `BillingDisabledError`;
   `getPortalUrl` → `null`; `handleWebhook` → 404 Response ("no billing provider
   configured"). The shared contract suite runs BOTH adapters over one behavioral spec
   (checkout returns url XOR throws BillingDisabledError; portal url-or-null; webhook
   always returns a Response; entitlement always answers).
7. **`defineHandler` webhook arm (D.9.17)**: third union member —
   `{ auth: "public"; webhook: (req: NextRequest) => Promise<Response> }` (no `input`
   key, no `rateLimit` key — a webhook's auth IS its signature; rate-limiting it only
   causes provider redelivery storms; origin checks are skipped by construction since
   the wrapper goes straight to the webhook fn inside its error-shaping try/catch). The
   wrapper NEVER touches the body (single-consumption raw text belongs to the adapter).
   Type-proof file extended: webhook arm accepts no input/rateLimit keys (excess-property
   checks), handler ctx untouched for the other arms.
8. **Webhook route**: `app/api/billing/webhook/route.ts` (provider-agnostic path) —
   `export const POST = defineHandler({ auth: "public", webhook: (req) =>
getBillingProvider().handleWebhook(req) })`.
9. **Stripe adapter webhook processing order**: constructEvent (400 on bad signature) →
   dedupe insert of event.id into billing_events (`onConflictDoNothing` + rowCount
   check → already-seen returns 200 immediately) → switch on the 4+2 event types →
   resolve userId (client_reference_id / subscription metadata) → upsert subscriptions
   guarded by `last_event_created <= event.created` → 200 `{ received: true }`.
   Unknown/unhandled types → 200 (never 4xx/5xx for "not interesting").
   `invoice.payment_failed` → console.warn + captureException? NO — track()? Decision:
   `console.warn` only (observability wiring for dunning is out of scope, H.0).
10. **Plan resolution from price id**: reverse lookup `priceId → PlanId` over
    `PLANS[*].providerRefs.stripe`; unknown price → cache the subscription with
    `plan_id: "pro"`? NO — cache with the FREE plan? Neither: store the raw
    `plan_id: "unknown"` sentinel and treat as NOT entitled, `console.warn` (an
    unknown price means the catalog and the Stripe account disagree — doctor-warned
    configuration drift, never silent entitlement).
11. **Jobs integration**: `createMonitorRow` swaps `MAX_MONITORS` for
    `getEntitlement(userId).monitorLimit` (null → uncapped); `MONITOR_LIMIT_MESSAGE`
    becomes plan-aware ("Upgrade to add more" when billing enabled). `MAX_MONITORS`
    constant deleted (the n/20 chip reads the entitlement limit via the dashboard's
    server component).
12. **UI (frontend-design skill)**: dashboard billing card — visible ONLY when
    `isEnabled("billing")`: current plan, usage vs limit, Upgrade (checkout redirect
    action) or Manage subscription (portal redirect action, only when a customer id is
    cached); `/billing/success` lightweight confirmation page (session_id ignored —
    the webhook is the source of truth; page just links back to the dashboard).
    Monitors card's limit chip becomes entitlement-driven.
13. **Server actions for redirects**: `createCheckoutAction`/`openPortalAction` via
    `defineAction` returning `{ url }` (client `window.location.assign`) — Next
    `redirect()` inside defineAction's envelope contract would fight the never-throws
    contract; returning the url is honest and testable.

### H.3 Orchestrator pre-work

`packages/billing` skeleton (package.json: stripe 22.5.0 EXACT, workspace
config/db/core? — core NOT needed; server-only; devDeps @types/node, typescript, vitest,
pg/@types/pg, drizzle-orm for the integration test only) + tsconfig/vitest.config (M6
patterns) + placeholder src/index.ts; db schema `subscription.ts` + `billing-event.ts` +
migration 0005; `.dependency-cruiser.cjs`: `stripe-only-in-billing` (physical path),
`dag-billing-imports-config-db` closed-form rule, `jobs` allowlist gains billing,
`diff`-style vendor confinement precedent followed; apps/web package.json gains
`@factory/billing`; transpilePackages += `@factory/billing`; ONE `pnpm install`;
migration + boundary fixture proofs delegated to the helper.

### H.4 Agent split (Sonnet implementers, disjoint files; Opus critic/review per model-tiering)

- **Agent A — packages/billing**: `src/{errors,provider,plans-lookup,entitlement,
adapters/{stripe,disabled},index}.ts` + contract suite + webhook unit tests
  (generateTestHeaderString roundtrips: good signature, bad signature → 400, duplicate
  event.id → 200 short-circuit, out-of-order event.created ignored, basil-shaped
  subscription payloads incl. `items.data[0].current_period_end`) + integration test
  (advisory-lock idiom, real migrator, cache upsert assertions).
- **Agent B — core + config + jobs**: defineHandler webhook arm + type-proofs + tests;
  `plans.ts` + its invariant tests (unique ids, free has no providerRefs, PlanId
  derivation) + doctor billing extensions (placeholder-ref warning, portal-config
  runbook hint); jobs entitlement swap (`createMonitorRow`, constants, tests).
- **Agent C — apps/web (frontend-design skill FIRST)**: billing card + actions +
  `/billing/success` + webhook route mount + monitors-card chip wiring.

Cross-agent pins: `getEntitlement(userId): Promise<{ planId: PlanId; monitorLimit:
number | null; source: "disabled" | "free" | "subscription" }>`;
`getBillingProvider(): BillingProvider`; `BillingDisabledError` (code
`billing_disabled`); `ENTITLED_STATUSES`; plans shape per H.2.2.

### H.5 Tests + definition of done

Both adapters pass the SAME contract suite (Part A exit criterion); webhook signature/
dedupe/ordering/basil-fields unit matrix green; integration cache-upsert green under the
shared advisory lock (key 4230011); `pnpm check` green in both profiles (billing
disabled everywhere in minimal — UI hidden, unlimited monitors); doctor matrix
(disabled hints / enabled + placeholder-ref warning / enabled + real-looking ref);
live verify: dev server with dummy STRIPE keys → billing card renders, checkout action
fails gracefully against a dummy key (typed error surfaced, not a crash), signed fake
`customer.subscription.updated` via curl → cache row upserted → entitlement reflects it
→ monitor cap enforced at the plan limit; disabled profile → no billing card, monitor
creation uncapped. One Conventional Commit (`Milestone 7:` body), approval-gated.

### H.10 Critique corrections (BINDING — supersede any conflicting Part H text)

Opus critic verdict 2026-08-21: APPROVED WITH CORRECTIONS. (A stalled first critic left a
partial file on disk, deleted — its two divergent claims were re-verified and REJECTED by
the second critic: H.1's TS2614 fact stands; unlimited-when-disabled is spec-mandated.)
Verified clean: migration numbering, advisory-lock key, no FRAMEWORK_MOUNTS entry needed
for the webhook route, no new env vars (registry already complete), no DAG cycle,
ENTITLED_STATUSES membership, the three rejected dependencies.

1. **`webhook` arm gets its own discriminant `auth: "webhook"`** — compile-proven: a
   `"public"`-discriminant arm admits input/rateLimit/handler silently (union
   excess-property semantics) AND breaks the wrapper body (TS2339 on opts.rateLimit/
   opts.input). Runtime pinned: the webhook branch is checked FIRST (before
   getSession() — no session/DB work), inside the shapeError try/catch (throw → 500 →
   provider retries). Type-proofs: @ts-expect-error fixtures for input/rateLimit on the
   webhook arm; existing D.9.7 fixtures re-proven.
2. **Dedupe insert + cache upsert share ONE transaction** (the G.12.1 bug class):
   constructEvent → BEGIN → insert event.id onConflictDoNothing (0 rows → COMMIT + 200)
   → resolve userId → guarded upsert → COMMIT → 200. Commit is the ONLY thing that
   marks an event processed; concurrent replays serialize on the PK; best-effort work
   (invoice.payment_failed warn, prune) post-commit.
3. **Stripe SDK behind a guarded dynamic import** (spec §2, house precedent):
   `await import("./adapters/stripe")` only on the stripe branch; lazy client singleton
   keyed on STRIPE_SECRET_KEY; type-only `import("stripe").Stripe` references.
   **`getBillingProvider(): Promise<BillingProvider>`** (async — cross-agent pin).
   Adapters stateless; the CLIENT is what's memoized.
4. **`drizzle-orm` is a RUNTIME dep of packages/billing**; boundary rule renamed/widened
   `no-bare-drizzle-outside-db-core-jobs-billing` (M6 G.11 precedent).
5. **`subscriptions` PK = `provider_subscription_id`**; `user_id` indexed (not unique);
   `last_event_created` is per-subscription; new column `provider_price_id` text
   notNull; `getEntitlement` = best entitled row for the user (ENTITLED_STATUSES,
   tie-break `current_period_end desc`). Kills the resubscribe/second-checkout
   lost-subscription bug of a per-user PK.
6. **Unknown price id**: NEW subscription → `plan_id: "unknown"`, not entitled,
   `captureException` (never console.warn alone); EXISTING entitled row keeps its cached
   `plan_id` (false-REVOKE of a paying customer is the worse failure); doctor reports
   catalog↔Stripe drift using `provider_price_id`.
7. **`checkout.session.completed` is LOG-ONLY** (no upsert, no `subscriptions.retrieve`
   — hot-path rule + response-time budget): the cache is fed solely by
   `customer.subscription.*` (`.created` carries the full object). **userId resolution
   chain pinned**: `subscription.metadata.userId` → existing row by
   `provider_customer_id` → else warn + 200 + record nothing (Dashboard-created
   subscriptions have no metadata).
8. **Typed errors reach the UI**: the two server actions map billing failures to
   `ApiError` themselves (option b — billing does NOT gain a core dep): codes
   `billing_disabled`, `billing_provider_error`. H.3's "core NOT needed" stands.
9. **Entitlement resolves at the ACTION layer**, passed down as
   `createMonitorRow({ userId, name, url, monitorLimit: number | null })` — never a
   second `getDb()` checkout inside the advisory-locked transaction (pool-exhaustion
   deadlock). **The `jobs → billing` DAG edge is DELETED** (H.2.1/H.2.11 amended: only
   apps/web imports billing).
10. **Rate limits pinned**: checkout `{ name: "billing-checkout", windowSeconds: 60,
max: 5 }`; portal `{ name: "billing-portal", windowSeconds: 60, max: 5 }`.
11. **Contract suite asserts status codes AND side effects**: disabled → 404 + zero
    writes; stripe → 400 bad signature; 200 + exactly one upsert on valid
    subscription.updated; 200 + zero writes on replay; 200 + zero writes on stale
    event.created; 200 on unhandled types.
12. **Null-limit UI semantics**: `atLimit = limit !== null && count >= limit`; uncapped
    chip rendering when null; the limit message has ONE source (plan-aware); over-limit
    (existing > new plan limit) renders honestly and blocks only NEW creations.
13. **`bigint("last_event_created", { mode: "number" })`** (mode is required; bigint
    mode won't compare with `event.created: number`); ordering guard via
    `onConflictDoUpdate({ setWhere: stored < incoming })` — STRICT less-than (same-second
    later-arriving stale events must not win; a dropped same-second legitimate event
    heals on the next event).
14. **APP_URL resolution helper** (one place) — billing actions require it; doctor warns
    when billing is enabled and APP_URL is unset; the adapter itself REQUIRES
    success/cancel/return urls (the create-params types leave them optional).
15. **Spec deviations recorded**: `handleWebhook → Promise<Response>` (compensated by
    11); `createCheckout` keeps the spec signature `{ userId, plan, successUrl }` —
    `cancelUrl` is adapter-derived from the APP_URL helper (`/dashboard`), not an
    interface param; `getPortalUrl` returns `{ url } | null` exactly.
16. **Unlimited-when-disabled is spec §6 verbatim** — declared trade-off, plus an
    absolute abuse ceiling `MONITOR_HARD_CEILING = 200` (packages/jobs constant)
    enforced in every profile alongside the plan limit.
17. **Fact corrections adopted**: `invoice.parent?.subscription_details?.subscription`
    (nullable chain); the "Checkout waits ≤10 s" claim is PLAUSIBLE (docs-only), design
    keeps the handler fast regardless; past_due wording fixed (default dunning ends at
    `canceled`; `unpaid` is a non-default config — statuses stay outside
    ENTITLED... past_due remains entitled as the grace-period stance).
18. **Hardening + coordination**: content-length > 1 MB → 413 before `req.text()`;
    `billing_events` 30-day opportunistic prune inside the webhook transaction;
    cross-agent pins = BillingProvider's three signatures, async `getBillingProvider`,
    `PLANS`/`PlanId`/`FREE_PLAN_ID`, `createMonitorRow`'s `monitorLimit` param; agent
    sequencing: C typechecks only after A+B land (expected-red rule restated); named
    boundary fixtures (stripe outside billing; billing imported outside allowlist;
    widened bare-drizzle rule); the endpoint-API-version trap surfaces in doctor's
    billing section, not just a comment.
19. **Demanded tests added to H.5**: dedupe-transaction rollback regression (failure
    after event.id insert → row absent → redelivery processed); resubscribe survival
    (stale `deleted` for an old subscription never clobbers the live one); entitlement
    matrix table test; billing-enabled-with-invalid-credentials typed-failure row;
    the webhook-arm type-proofs (exist only under correction 1).

### H.11 Accepted deviations (discovered during implementation)

- **`Plan.id` is typed `string`, not `PlanId`** — the self-referential type under
  `satisfies` doesn't compile (TS2502/TS2456, compiler-repro'd); the id===key invariant
  lives in plans.test.ts instead.
- **H.10.6's `captureException` became `console.error` in the stripe adapter** — billing's
  DAG is config+db only (H.10.9); and the compensating doctor drift-report half is
  DECLARED OUT (doctor never connects to the DB by design, M1) — catalog↔Stripe drift is
  webhook-side stdout only. Recorded, not hidden.
- **The webhook-arm content-length guard returns 411 on missing/malformed headers**
  (extends H.10.18(a) after review: `Number(null) === 0` made the 413 guard bypassable
  via chunked transfer; server-to-server senders always send content-length).
- **`billing_events` prune moved post-commit best-effort** — H.10.2's
  commit-marks-processed principle wins over H.10.18(b)'s in-tx wording (a prune hiccup
  must never 500 a processed payment event).
- **`describeBillingError()` lives in packages/billing** (H.10.8 option b refined): the
  mapping DATA comes from billing (unit-testable there), the `ApiError` is constructed in
  the actions — billing still never imports core.
- **`createCheckoutAction` 409s (`already_subscribed`) when already entitled via
  subscription** — beyond plan; closes the double-checkout path that would let a cheaper
  second subscription win the entitlement tie-break.
- **`hardCeilingMessage()` vs `monitorLimitMessage(limit)`** — the abuse ceiling no
  longer masquerades as a plan limit in user-facing copy.
- **Middleware allowlist: `/api/billing/webhook` + `/api/inngest` as EXACT entries** —
  the live verify discovered cookie-less server-to-server POSTs were 307'd to /login
  before route-level auth could run; **this was a latent M6 gap for /api/inngest**
  (its live smoke always carried a browser cookie). Proven fixed by cookie-less curl on
  both routes; protected pages still redirect. No-trailing-slash + exact-match reasoning
  documented in the file.
- **`zod` removed from packages/billing deps** (declared but never imported).
- **FIX 3's real-Postgres rollback proof uses a genuinely reachable failure** (FK
  violation via a nonexistent `metadata.userId`), not an artificial hook.

### H.12 Independent review outcome (M7 cycle, post-gates)

Opus reviewer (per the model-tiering directive), one-pass, read-only: **APPROVE WITH
CHANGES** — 0 blocking, 4 MAJOR, 11 MINOR, plus a precision note on the middleware fix.
All fixed same-cycle except the declared FIX-8 skip (H.11). Highlights: (1) the
signature-failure log dumped the attacker-controlled body via
StripeSignatureVerificationError's enumerable `payload` prop — message-only now; (2) the
413 guard trusted content-length (chunked bypass) — 411 rule added; (3) the strict-`<`
ordering and rollback atomicity were proven only against the in-memory double — both now
have real-Postgres integration rows; (4) the H.10.8 error mapping had zero automated
coverage — `describeBillingError` extracted and unit-tested. The reviewer independently
compile-probed the webhook-arm type-proofs (exit 0), the guarded dynamic import graph
(zero stripe code on the disabled path), the transaction semantics, and every Stripe v22
fact in H.1. Its deadlock hypothesis on the in-tx prune was self-refuted; the prune moved
post-commit anyway (H.11).

**Live verify (H.5) executed by the Sonnet helper**: full signed-webhook loop against the
dev server (signup → console-verification → Free card 0/3 → basil-shaped
customer.subscription.created signed with the dummy secret → 200 → subscriptions row
plan 'pro' → dashboard Pro 0/25 → replay dedupe → bad signature 400 → oversized body 413) and the disabled profile (no billing UI, uncapped `0/∞` chip). Final gates: full
profile 431/431 (41 files); minimal profile re-run post-fixes (helper Task 4).
