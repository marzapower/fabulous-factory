# Part E — Milestone 4 contracts (thin services)

> Extracted 2026-08-20 from `2026-08-20-master-plan.md` (single-file plan split per-milestone).
> Part A (milestone map + cross-milestone invariants) stays in the master plan.
> "Critique corrections" subsections are BINDING and supersede earlier text in this file.

### E.0 Scope statement

**In:** `packages/email` (send() + templates + transports resend/console/disabled),
`packages/analytics` (PostHog server track + feature flags + client bootstrap through
ClientConfigProvider + no-op), `packages/observability` (Sentry no-op-first error capture +
OpenTelemetry no-op tracer seam); the **auth×email verification posture** (§5.2) wired live
(`requireEmailVerification` follows email capability; `sendVerificationEmail` + `magicLink`
call `packages/email`); doctor reports the three services; CI **full profile** added (§9 —
the mockable services now exist).

**Explicitly out:** LLM (M5 consumes the OTel tracer — this milestone only ships the
no-op seam); jobs/billing; a wired OTel exporter (guide-only per spec §5.4 — we ship
`@opentelemetry/api` no-op only); Sentry source-map upload / `withSentryConfig` build
plugin (see E.3 decision); real email-provider send in CI (contract tests + console
transport cover it; no live Resend calls).

### E.1 Verified library facts (research 2026-08-20)

- **Email**: `resend@^6.20.0`, `@react-email/render@^2.1.0` (React-19-safe, async
  `render(node, {plainText?}) => Promise<string>`). We **render ourselves and pass
  `html`+`text`** to `resend.emails.send({from,to,subject,html,text})` — never the `react`
  field (keeps `resend` the only vendor import, loaded via guarded dynamic import). Do NOT
  depend on the unified `react-email` package (open runtime bundle-bloat issue #3556) or
  the frozen `@react-email/components`; hand-author minimal JSX templates.
- **Analytics**: `posthog-node@^5.49.1` (`new PostHog(key,{host})`, `.capture({distinctId,
event,properties})`, async `.isFeatureEnabled/.getFeatureFlag(key, distinctId)` — work
  with the project key alone, `personalApiKey` only for local eval; call `.shutdown()` to
  flush). `posthog-js@^1.418.5` client. **Client init stays on `ClientConfigProvider`**
  (`useClientConfig().posthog` already modeled) in a `'use client'` component — NOT
  `instrumentation-client.ts` (that is build-time `NEXT_PUBLIC` only, banned by §5.1). App
  Router pageviews captured manually via a `usePathname`/`useSearchParams` effect.
- **Observability**: `@sentry/nextjs@^10.70.0`, `@opentelemetry/api@^1.9.1`. OTel: a
  bare `trace.getTracer("factory")` is a documented no-op until an SDK registers a
  provider — ship `@opentelemetry/api` only, no exporter (spec §5.4). `@sentry/nextjs`'s
  build plugin (`withSentryConfig`) cannot be made truly no-op per-runtime — see E.3.
- **Better Auth**: thread `capabilities.email !== "disabled"` into
  `emailAndPassword.requireEmailVerification`; add top-level `emailVerification.
sendVerificationEmail` (calls `@factory/email` send) and conditionally include the
  `magicLink({ sendMagicLink })` plugin (from `better-auth/plugins`) only when email is
  enabled — assembled at module init, matching the existing auth.ts constraints.

### E.2 `packages/email` (owner: email agent)

```
packages/email/
├── package.json     # "@factory/email"; deps: @factory/config, @react-email/render, react;
│                    #   resend is a dep but ONLY dynamically imported. peerDeps react ^19.
├── src/
│   ├── templates/{verify-email.tsx, magic-link.tsx}   # minimal hand-authored JSX, props-typed
│   ├── templates/index.ts     # TEMPLATES registry: name → (props) => JSX; TemplateProps type map
│   ├── send.ts                # send<T extends TemplateName>(template: T, to: string,
│   │                          #   props: TemplateProps[T]): Promise<SendResult>
│   └── index.ts               # import "server-only"; re-export send, SendResult, TemplateName
└── test/{send.test.ts, templates.test.ts}
```

`SendResult = { delivered: true } | { delivered: false; reason: 'disabled' | 'console' |
'provider-error' | 'not-configured' }`. `send()` reads `getCapabilities().email`:
`disabled` → `{delivered:false, reason:'disabled'}` (no render, no SDK); render html+text
always for the active paths; `console` → log rendered output, `{delivered:false,
reason:'console'}` (dev only — never claims delivery); `resend` → guarded
`await import("resend")`, send, map provider error → `{delivered:false,
reason:'provider-error'}` else `{delivered:true}`. `EMAIL_FROM` missing while resend active
→ `not-configured` + doctor warning. Contract test: the disabled/console paths never load
the `resend` module (assert via an import spy / module registry check).

### E.3 `packages/observability` (owner: observability agent) — Sentry decision

**Decision (declared, critic to challenge): NO `withSentryConfig` build plugin in v1.**
Wrapping `next.config.ts` runs Sentry's webpack/turbopack patching on every build
regardless of DSN, which the CI-builds-one-image model can't switch per-runtime — a direct
violation of the "no vendor SDK executes when disabled" contract (§2). Instead Sentry is a
**runtime-only, guarded** wrapper: `captureException`/`captureMessage` dynamically
`import("@sentry/nextjs")` and init lazily **only when `SENTRY_DSN` is present**; absent →
pure no-op, zero Sentry code loaded. We forgo automatic Next instrumentation + source-map
upload; `docs/guides/observability.md` (M10) documents running the Sentry wizard for
adopters who want the full build-time integration. This keeps the degradation contract
honest; doctor notes "basic error capture; run the Sentry wizard for full tracing".

```
packages/observability/
├── package.json    # deps: @factory/config, @opentelemetry/api; @sentry/nextjs a dep,
│                   #   dynamically imported only. NO next.config wrapping.
├── src/
│   ├── errors.ts   # captureException(err, ctx?), captureMessage(msg, level?) — guarded
│   │               #   dynamic import + lazy init when SENTRY_DSN present; no-op otherwise
│   ├── tracing.ts  # export const tracer = trace.getTracer("factory") — @opentelemetry/api
│   │               #   only, genuine no-op until a provider is registered (M5/guide)
│   └── index.ts    # import "server-only"; re-export captureException, captureMessage, tracer
└── test/{errors.test.ts, tracing.test.ts}   # no-op when unconfigured; guarded import proven
```

### E.4 `packages/analytics` (owner: analytics agent)

```
packages/analytics/
├── package.json    # deps: @factory/config, posthog-node; client entry deps posthog-js + react
├── src/
│   ├── track.ts       # track(event, { distinctId, ...props }): void — guarded dynamic
│   │                  #   import posthog-node + lazy singleton when analytics enabled; no-op else.
│   │                  #   isFeatureEnabled(key, distinctId): Promise<boolean> — false when disabled.
│   ├── shutdown.ts    # flushAnalytics(): Promise<void> — flush+shutdown the singleton (route teardown)
│   ├── index.ts       # import "server-only"; re-export track, isFeatureEnabled, flushAnalytics
│   └── client.tsx     # "use client": <AnalyticsProvider> reads useClientConfig().posthog,
│                      #   posthog-js init in useEffect (NOT instrumentation-client.ts), +
│                      #   a PageviewTracker (usePathname/useSearchParams effect). No-op when null.
└── test/{track.test.ts}   # no-op path loads no posthog-node; enabled path calls capture (mocked)
```

Client wiring: `apps/web`'s dashboard/root mounts `<AnalyticsProvider>` inside the existing
`ClientConfigProvider` subtree (server passes `posthog` publishables through the already-wired
`ClientConfig`). No new `NEXT_PUBLIC` vars.

### E.5 `packages/auth` edits (owner: observability agent — smallest auth surface, avoids collision)

- `deriveAuthOptions`: `requireEmailVerification` becomes `capabilities.email !== "disabled"`
  (was hardcoded `false` / TODO(M4)); add `enabledEmailFeatures: { verification: boolean;
magicLink: boolean }` to its return for the web layer if useful (optional).
- `auth.ts`: wire `emailVerification.sendVerificationEmail` → `@factory/email` send
  ("verify-email"); conditionally include `magicLink({ sendMagicLink })` (→ send
  "magic-link") only when `capabilities.email !== "disabled"`. `@factory/auth` gains dep
  `@factory/email`. Boundary DAG update (orchestrator, E.7): auth may now import email;
  email must NOT import auth (no cycle) — email sits beside auth, both above db/config.
- `options.test.ts`: update the verification-flag assertion (now capability-driven);
  add cases for email-enabled vs disabled.

### E.6 config + doctor + CI (owner: analytics agent for config/doctor; orchestrator for CI)

- Registry already has RESEND_API_KEY/EMAIL_FROM/POSTHOG_KEY/POSTHOG_HOST/SENTRY_DSN;
  no new vars. Doctor: email section notes console=dev-only + EMAIL_FROM requirement;
  analytics + errors sections already exist — extend errors to note the runtime-only
  posture.
- **CI full profile (spec §9.5)**: the `quality`/integration job gains a second run with
  all three services in a MOCKED-enabled state (env vars set to dummy values; the guarded
  dynamic imports are stubbed/the SDKs never actually called out — contract tests assert
  the wiring, not live delivery). Minimal profile unchanged. Document that full-profile
  mocks are shallow (spec §9.5): no live Resend/PostHog/Sentl calls.

### E.7 Layering (orchestrator pre-work)

Boundary DAG gains: `email` and `analytics` and `observability` each import only
`@factory/config` (+ their vendor SDKs, confined by rule); `auth` may additionally import
`@factory/email`. New vendor-confinement rules: `resend` only in packages/email,
`posthog-node`/`posthog-js` only in packages/analytics, `@sentry/nextjs` only in
packages/observability. `@opentelemetry/api` allowed in observability (+ llm in M5).
Orchestrator pre-adds all package.json files + the dependency-cruiser rules, runs the
single install, then implementers fill source.

### E.8 Tests + definition of done

- Unit: each package's no-op/disabled path loads no vendor SDK (module-registry/import
  spy); enabled path calls the mocked SDK; email renders html+text; `SendResult` reasons;
  feature-flag false-when-disabled; deriveAuthOptions capability-driven verification.
- Contract tests: the three transports/no-ops satisfy one shared shape per package (spec
  §8.4 "same interface").
- Integration/live verify (orchestrator): boot with email+analytics+errors env set to
  dummy values → app still boots, doctor shows them enabled, no crash; boot with them
  unset → no-op, no vendor code loaded; the M2/M3 auth flow still works, and with email
  "enabled" (console transport in dev) signup triggers a console-logged verification email.
- `pnpm check` green (all profiles); one Conventional Commit, approval-gated.

### E.9 Critique corrections (BINDING — supersede conflicting Part E text)

1. **Golden-path regression from verification-on (M1, the milestone's biggest risk).**
   Verified: with `requireEmailVerification: true`, better-auth 1.7.1 signup returns
   `{ token: null, user }` and sets NO session cookie. Since `capabilities.email` is
   `'console'` in dev, M4 turns verification ON by default, and the committed signup form
   unconditionally pushes to `/dashboard` → `requireSession()` bounces to `/login`. This
   is a real break of the M2/M3 golden path. Required design (owned by a WEB task, E.9.6):
   - **`signup-form.tsx` branches on the result**: better-auth's signup response indicates
     no active session when verification is required (no token/session). On that branch,
     render a "Check your email to verify your account" pending state instead of pushing
     to `/dashboard`. On the session-present branch (email disabled → immediate session),
     keep the current push. Detect via the returned data shape (token/session presence),
     not a capability read in the client.
   - **Orchestrator live-verify is rewritten**: the signup→dashboard-200 curl matrix is
     run in the EMAIL-DISABLED scenario (production mode with no RESEND_API_KEY → email
     `disabled` → verification off → immediate session — the honest §5.2 fallback). The
     EMAIL-ENABLED scenario (dev, console transport) is verified separately: signup →
     assert NO session cookie + a verification email is console-logged → extract the
     verification URL/token from the log → hit better-auth's verify endpoint → assert the
     session is then established and `/dashboard` returns 200. Both paths proven; E.8's
     single combined claim was wrong (they're mutually exclusive on one request).
2. **No direct `process.env` (M3).** email/analytics/observability read the DSN, keys, and
   capability ONLY through `@factory/config` (`getEnv()`/`getCapabilities()`); a raw
   `process.env` read fails the `factory/no-process-env` lint rule. Hard constraint — do
   NOT add these packages to the exception list (§5.1 single-source). Stated for every
   implementer.
3. **Sentry → `@sentry/node`, server-side capture only (A1).** Drop `@sentry/nextjs`
   entirely for v1: `packages/observability` depends on `@sentry/node` (lighter, no
   build-plugin baggage, clean guarded dynamic import). `captureException`/`captureMessage`
   lazy-init Sentry on first use ONLY when `SENTRY_DSN` present; no-op otherwise. Client
   error capture and source maps are explicitly out of v1 — documented as a wizard-run
   follow-up (M10 guide). Implementer MUST verify at build time that a runtime dynamic
   `import("@sentry/node")` + `init` + `captureException` actually reports (a unit test
   with a mock transport or a documented manual check), so the wrapper isn't a token
   gesture. Doctor: "server-side error capture; client capture via the Sentry wizard".
4. **posthog-js loaded only on configured runtimes (A2).** `client.tsx` does NOT statically
   `import posthog from "posthog-js"`; it `await import("posthog-js")` INSIDE the provider
   effect, guarded on `useClientConfig().posthog !== null`, so the library stays out of the
   client bundle's initial load and is fetched only where analytics is actually configured.
5. **Contract-test shape clarified (A3).** There is one real path + one no-op per package
   (not a multi-adapter suite). The "contract" each asserts: (a) disabled/no-op path returns
   the typed no-op result AND loads no vendor SDK (import-spy/module-registry check);
   (b) enabled path calls the mocked SDK with the expected args. That IS the shared-shape
   guarantee for these thin wrappers.
6. **Web-layer task is explicitly owned (M2).** A dedicated WEB sub-task (email agent, since
   it owns the email package and the verify UX belongs with it — or a 4th small pass; the
   orchestrator assigns) changes `apps/web/components/auth/signup-form.tsx` (verify-pending
   state, E.9.1) and MAY add a magic-link entry on the login page when
   `deriveAuthOptions` reports it enabled. `deriveAuthOptions` gains
   `email: { verification: boolean; magicLink: boolean }` (non-optional) so the web layer
   decides UI server-side. Shipping the magicLink plugin server-side with a login-page
   affordance is in scope; if the affordance is cut, declare it.
7. **CI full profile uses the console transport, not a dummy RESEND_API_KEY (A4).** A dummy
   key makes `capabilities.email = 'resend'` and any `send()` attempts a real network call.
   The full profile runs in dev mode (email `console`) with POSTHOG_KEY/SENTRY_DSN set to
   dummy values (those two are no-op/guarded and never call out from a mocked unit path);
   the app-boot smoke in full profile must NOT exercise signup→dashboard (verification is
   on) — it asserts boot + doctor shows services enabled. Keep §9.5 shallow-mock honesty.
8. **Lazy render note (A5)**: `@react-email/render` is invoked only inside the
   `sendVerificationEmail`/`sendMagicLink` callbacks (request time), never at auth module
   init — so auth→email adds no module-init cost.
9. **Analytics dual-entry (A6)**: `packages/analytics/package.json` exports
   `"./client": "./src/client.tsx"`; dependency-cruiser + the eslint client/server rules
   mirror the existing `@factory/auth/client` / `@factory/config/client` allowances so
   apps/web client components may import `@factory/analytics/client` while the server
   `track.ts` stays server-only. Orchestrator wires this in E.7 pre-work.
10. Fix E.6 typo "Sentl" → Sentry; document `track()` is fire-and-forget (posthog-node
    `.capture` queues), `isFeatureEnabled` is async.

### E.10 Accepted deviations & post-review fixes (M4)

- **Sentry is `@sentry/node`, server-side capture only** (E.9.3): no `@sentry/nextjs`, no
  `withSentryConfig` build plugin — that plugin runs on every build regardless of DSN,
  incompatible with the build-once/configure-at-runtime degradation model. Client capture
  - source maps are a wizard-run follow-up (M10 guide). Guarded dynamic import, no-op
    until `SENTRY_DSN` present.
- **posthog-js is loaded via dynamic `import()` inside the provider effect** (not a static
  top-level import), so it stays out of the initial client bundle and loads only on
  analytics-configured runtimes.
- **Supply-chain**: `resend` added to `trustPolicyExclude` (6.20.0 is a maintainer-rotation
  provenance gap, not a takeover — 6.20.0 is `latest`); `posthog-js` pinned to `^1.418.1`
  (newest version older than `minimumReleaseAge`'s 1-day window); `core-js` build script
  denied (funding-banner postinstall only).
- **auth gains `autoSignInAfterVerification: true`** (orchestrator, found in live verify):
  clicking the emailed verification link establishes the session, so signup→verify lands
  the user signed in rather than bouncing to /login. Full loop verified live.
- **Review (0 blocking) fixes**: dead `@opentelemetry` boundary regex corrected and proven
  to fire; `.catch` added to the fire-and-forget analytics dynamic imports (no
  unhandledRejection); `$current_url` made an absolute URL; `AnalyticsProvider` mounted in
  the dashboard so the client analytics seam has a live consumer; stale test comment fixed.
- **Declared deferrals**: `track()`/`captureException()`/`tracer` call sites and the
  login-page magic-link affordance are demo-domain and land in M6 (the demo exercises
  every package, spec §6); the magicLink plugin ships server-side now. Known nit:
  `send.test.ts`'s `everImported` module-load check is declaration-order-dependent (correct
  as ordered; per-test `constructed` flag is the order-independent backstop).

---
