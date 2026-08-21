# Graceful degradation

The core contract, in one line: **`DATABASE_URL` + `BETTER_AUTH_SECRET` are required;
every other service is optional and must fail soft.** Unset a var, the feature politely
steps aside — never a crash, never a half-broken page, never a silent lie about what
happened.

## The capability map

`packages/config`'s `deriveCapabilities(env, mode)` (`packages/config/src/capabilities.ts`)
is a pure function — env values and app mode in, a `Capabilities` object out — computed
fresh **on the server, at request time**. There is no build-time baking: a Docker image
built in CI with zero secrets lights up correctly from whatever env it's actually run
with, and the same image is honest in both a bare `docker run` and a fully-configured
deploy.

```ts
interface Capabilities {
  billing: "stripe" | "disabled";
  llm: "local" | "openrouter" | "direct" | "disabled";
  email: "resend" | "console" | "disabled";
  jobs: "inngest" | "disabled";
  analytics: "posthog" | "disabled";
  errors: "sentry" | "disabled";
}
```

Nothing here is `NEXT_PUBLIC_*` — those get inlined into the client bundle at _build_
time, which is exactly the "coherent build, honest runtime" promise this map exists to
avoid breaking. Instead, a server component calls `getClientConfig()` and mounts
`<ClientConfigProvider config={...}>`, which exposes only **on/off booleans** to client
code via `useClientConfig()` (`packages/config/src/public-config.ts`,
`packages/config/src/client.tsx`). Adapter identities (`"stripe"`, `"sentry"`, …) never
cross that boundary — they're recon data for an attacker, not something a page needs to
render. `pnpm factory:doctor` is the one place the full identity map is printed, and it's
a local CLI command, never an HTTP response. The dashboard's `CapabilityPanel`
(`apps/web/app/capability-panel.tsx`) is the on/off view of that same boolean map.

**The precise boundary**, now that the public `/features/*` pages exist alongside the
dashboard: runtime config — anything a request can trigger, in-app or over HTTP — exposes
boolean capabilities only, never the resolved adapter identity. That line doesn't move for
a public page any more than it does for the dashboard. **Static template documentation**
(the feature-explainer pages' prose, the README) is a different thing entirely: it may
name every adapter the template _supports_ for a capability — that's public knowledge the
moment the repo is public, not a fact about any one deployment — but it must never render
which adapter a live deployment actually resolved to. For a capability with only one
supported adapter (billing → Stripe, jobs → Inngest), the boolean _is_ the identity by
construction — "billing: enabled" only ever means Stripe — and that inference is accepted
as inherent public-repo knowledge, not a leak; there's no second adapter for it to
distinguish from.

## How a capability turns on

Every service's enabling var(s) are marked `enables: true` in the single source of
truth, `packages/config/src/registry.ts`'s `ENV_REGISTRY` — `doctor` derives its
enablement hints straight from that field, so the registry, `.env.example`, and the
capability derivation logic can never drift apart. In short, per service:

| Service   | Turns on when…                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| billing   | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are both set (unless `BILLING_PROVIDER=disabled`)                                                      |
| llm       | `OPENROUTER_API_KEY`, or `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, or `LLM_LOCAL_BASE_URL` (checked in that order; `LLM_PROFILE` can force one explicitly) |
| email     | `RESEND_API_KEY` set → `resend`; unset in development → `console`; unset in production → `disabled`                                                    |
| jobs      | `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` (any mode), or `INNGEST_DEV=1` outside production                                                          |
| analytics | `POSTHOG_KEY`                                                                                                                                          |
| errors    | `SENTRY_DSN`                                                                                                                                           |

## What each service does when disabled

- **billing** — `getEntitlement()` (`packages/billing/src/entitlement.ts`) returns the
  free plan with `monitorLimit: null` — **unlimited**, not zero — and `source:
"disabled"`; checkout UI stays hidden. This is deliberate: a template with billing
  turned off should never gate the product it's demonstrating.
- **llm** — `generate()` throws `LlmDisabledError` before any provider SDK is imported.
  The page-monitor demo (`packages/jobs/src/demo/check-monitor.ts`) catches that by
  design: every change gets a diff-based fallback summary (`source: "diff"`) computed
  from the raw content diff, no LLM call involved; when `llm` is live, that diff summary
  is upgraded to an AI summary (`source: "llm"`) as a post-commit step, never blocking
  the write.
- **email** — `send()` (`packages/email/src/send.ts`) no-ops (`{ delivered: false,
reason: "disabled" }`), no vendor SDK loaded. Better Auth's `requireEmailVerification`
  and the magic-link plugin both follow the same `email !== "disabled"` check
  (`packages/auth/src/auth.ts`), so auth never deadlocks waiting on an email that will
  never send — sign-up just skips verification. In development with no `RESEND_API_KEY`,
  email falls back to `console` — logged, never claimed as delivered.
- **jobs** — cron-driven checks don't fire, but nothing about the feature disappears:
  the dashboard's manual "check now" action (`checkNowAction`,
  `apps/web/app/dashboard/actions.ts`, backed by `checkMonitor()`) runs the exact same
  check pipeline synchronously, independent of whether Inngest is wired up.
- **analytics** — `track()`/`isFeatureEnabled()` (`packages/analytics/src/track.ts`)
  no-op silently; the PostHog SDK is never imported.
- **errors** — `captureException()`/`captureMessage()`
  (`packages/observability/src/errors.ts`) return immediately; `@sentry/node` is never
  imported, and reporting never itself throws (a broken env re-thrown by
  `getCapabilities()` is caught and swallowed here specifically, so error reporting can
  never become a second failure inside someone else's catch block).

## Adding a new degradable service

Follow the `add-integration-package` skill: registry entry (with `enables` set
correctly) → capability wiring in `packages/config` → an adapter package whose vendor SDK
import lives behind a guarded dynamic import → the same shared contract-test suite every
sibling adapter (including the disabled one) passes → a `doctor` hint → the boundary
allowlist. The disabled path is not optional scope — it's exercised by a test from day
one, same as every other adapter.

## How tests handle it

- Pure unit tests assert `deriveCapabilities()`/adapter behavior against constructed env
  objects — no real service, no network, no database. See
  `packages/config/test/degradation-matrix.test.ts` for the declarative sweep: baseline
  env only → every service `disabled`; each service's enabling var(s) alone → exactly
  that service lights up, nothing else.
- Postgres integration tests (`test/integration/` in each package) gate on
  `TEST_DATABASE_URL`: **absent → skip cleanly with a visible console notice**, never a
  silent pass and never a hard failure. That's what keeps `pnpm check` green on a
  zero-config machine while still giving CI's full-profile job (which sets
  `TEST_DATABASE_URL`) real coverage.
