# Agent conventions

Canonical, deterministic rulebook. `CLAUDE.md` and `AGENTS.md` — root and `payload/`
alike — point here instead of copying it; this is the single source. If a mirror and
this file ever disagree, this file wins.

## Kernel rules

- **`defineHandler()`** (route handlers) and **`defineAction()`** (server actions), both
  from `@factory/core`, are the only legal way to declare either. A raw
  `export async function GET/POST/...` in a route file, or a raw exported function in a
  `"use server"` file, fails lint by construction — the rule is dumb on purpose, so it
  has no false negatives.
- **Auth mode is mandatory, with no default.** `defineHandler`/`defineAction` take
  `auth: "required" | "public"` (routes also get `"webhook"`, for signature-verified
  server-to-server callers like Stripe/Inngest — no `input`/`rateLimit`/`handler` keys on
  that arm; verification happens inside the adapter). There is nowhere to omit the
  decision.
- **Input is always a zod schema, or the explicit `input: "none"`.** The wrapper parses
  and validates before your handler body ever runs; a zod failure shapes its own error
  response — you never hand-check `req.json()`.
- **`rateLimit` policy is mandatory on `auth: "public"`, optional on `"required"`.** A
  public handler/action must state `{ windowSeconds, max }` (`{ name, ... }` too, for
  actions — there's no URL to derive a bucket name from) or the explicit `"none"`
  opt-out. An authenticated-only endpoint may skip it; limiting it is a judgment call,
  not a mandatory one.

## Package DAG (deny-by-default)

Enforced by `pnpm boundaries` (dependency-cruiser, `dag-*` rules in
`.dependency-cruiser.cjs`). Each package may import only the workspace packages listed as
its allowlist below — anything not listed is denied by default, including packages added
later. Every preset app under `apps/*` (`apps/untangle` here, the example throughout
this table; also `apps/nothing`, `apps/brainstorm` — `apps/web` in a scaffolded repo,
which ships exactly one) may import anything; nothing imports `apps/*`.

| Package         | May import                                                      |
| --------------- | --------------------------------------------------------------- |
| `config`        | (none — DAG root)                                               |
| `db`            | `config`                                                        |
| `auth`          | `config`, `db`, `email`                                         |
| `email`         | `config`                                                        |
| `analytics`     | `config`                                                        |
| `observability` | `config`                                                        |
| `core`          | `config`, `db`, `auth`                                          |
| `ui`            | `config`, `auth`, `i18n`                                        |
| `i18n`          | (none — DAG leaf)                                               |
| `llm`           | `config`, `db`, `core`, `observability`                         |
| `jobs`          | `config`                                                        |
| `billing`       | `config`, `db`                                                  |
| `brainstorm`    | `config`, `db`, `core`, `llm`                                   |
| `untangle`      | `config`, `db`, `core`, `llm`, `email`, `observability`, `jobs` |
| preset app      | anything                                                        |

`packages/jobs` is residual infrastructure only — the Inngest client
(`packages/jobs/src/client.ts`) and the generic, empty `functions` registry a preset's own
domain package populates. Domain packages (`untangle`, `brainstorm`) ship ONLY with their
own preset, wired through that preset's `preset.json` `packages` field — not into every
preset's scaffold. Each domain package's migration chain lives under its own
`packages/db/migrations/<domain>/` directory, with its own journal/snapshot metadata;
`pnpm db:generate:<domain>` (e.g. `db:generate:untangle`, `db:generate:brainstorm`)
regenerates that chain. The base migration chain (`packages/db/migrations/`, no domain
subdirectory) ships with every preset.

Vendor SDKs (Stripe, Resend, Better Auth, Anthropic/OpenAI, …) are confined to the
adapter package that owns them — importing one anywhere else fails `pnpm boundaries`, not
a code review.

## Graceful degradation

**Required baseline: `DATABASE_URL` + `BETTER_AUTH_SECRET`. Nothing else is required.**
Every other service (billing, LLM, email, jobs, analytics, observability) is optional,
detected at request time from the environment, and replaced by a well-defined fallback
when absent — never a crash, never a half-broken feature. When you add or touch a
service integration, its disabled path must be exercised by a test, not left to hope.

## Env discipline

- Every env var the factory knows about is registered once, in
  `packages/config/src/registry.ts` (`ENV_REGISTRY`) — name, group, description,
  example, `required`, `secret`, `enables`.
- `.env.example` is **generated**, never hand-edited: `pnpm gen:env-example` regenerates
  it from the registry; `pnpm gen:env-example --check` (run in CI, ci.yml) fails if it's
  stale.
- `pnpm factory:doctor` derives its capability report and enablement hints from the same
  registry — the generated file, the doctor output, and the zod validation in `env.ts`
  can never disagree, because they all read one source.
- Read env only through `@factory/config` — never `process.env` directly outside
  `packages/config` itself (enforced by the `factory/no-process-env` lint rule).

## Test conventions

- Pure unit tests (vitest) live alongside each package's `src/`-adjacent `test/` dir and
  need no external service.
- Postgres integration tests live under each package's `test/integration/` and are
  gated on `TEST_DATABASE_URL`: **absent → skip cleanly with a visible notice**, never a
  silent pass and never a hard failure. This is what keeps `pnpm check` green on a
  zero-config machine.
- Scripts under `packages/config/scripts/` export their logic as pure functions and gate
  their CLI entrypoint behind an `invokedDirectly` check — tests import the functions
  directly, never subprocess-exec the script.

## Localization

- Every user-facing string in `packages/ui` and each app's own pages/components routes
  through `t()` — `useTranslations`/`getTranslations`, imported from `@factory/i18n`
  (isomorphic root) or `@factory/i18n/server` (async server components), never a raw
  `next-intl` import: `packages/i18n` is the only place `next-intl` may be imported,
  with a single unavoidable seam, each app's own `next.config.ts` (build-time
  `next-intl/plugin` wiring).
- Key convention: `<namespace>.<component>.<key>`, where the namespace is the owning
  package's name — `ui.*` for `packages/ui`'s own catalog, `app.*` for each app's own
  (moved shared pages, page metadata under `app.meta.*`). Catalogs are plain JSON,
  `<pkg>/messages/<locale>.json`, merged by the app with per-key fallback to the default
  locale.
- `pnpm i18n:check` (wired into `pnpm check`) diffs every `<locale>.json` catalog
  against the base catalog, which is **`en.json` by convention** — the file named after
  the locale, not derived from any app's `defaultLocale` (`packages/i18n` is a DAG leaf
  and reads no app config). Apps: a missing OR an extra key fails the check. Packages
  (e.g. `packages/ui`): a missing key only warns, an extra key fails.
- Not localized (ADR-0007, deliberate, not an oversight): emails (`@factory/email`),
  `defineHandler`/`defineAction` error messages, and LLM output — English only.

## Definition of done

`pnpm check` (lint → boundaries → format:check → typecheck → test) green is the
machine-checkable definition of done. Humans judge the running product; the repo judges
the code.

## Commits

[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), lowercase
subject, enforced by commitlint (`commit-msg` husky hook) and a CI PR-title check.

## Security posture

- **`safeFetch()`** (`@factory/core`) is mandatory for any fetch of a user-supplied URL —
  scheme allowlist, private/link-local/metadata-range denial, size/time limits,
  redirect re-validation.
- Every vendor client carries an explicit timeout and a bounded retry. The timeout half
  holds everywhere, with no documented exceptions. The bounded-retry half holds everywhere
  except two reasoned, documented cases, named inline below: Inngest's transport-level
  `fetch` override adds no retry of its own (the SDK's own `send()` retry plus its
  step/function retry semantics already cover it — a second, transport-level retry would
  risk a duplicate send), and Resend's `deliver()` adds no retry at all (email isn't
  idempotent; a timed-out send may already be in flight, so retrying risks sending twice).
  Where the SDK exposes a native knob, that
  knob is used directly: Stripe (`packages/billing/src/adapters/stripe.ts`'s `getClient`)
  sets `timeout`/`maxNetworkRetries` explicitly; PostHog (`packages/analytics/src/track.ts`)
  sets `requestTimeout` explicitly, on top of the SDK's own bounded-retry default;
  Postgres (`packages/db/src/client.ts`'s `getDb`) sets pool-level
  `connectionTimeoutMillis`/`max`/`idleTimeoutMillis` plus query-level
  `statement_timeout`/`query_timeout` on the `Pool` config. Where the SDK exposes no such
  knob, the bound is applied one layer out instead: Inngest
  (`packages/jobs/src/client.ts`) has no `timeout`/`retries` option on the client itself,
  so a `fetch` override built on `AbortSignal.timeout(10_000)` (composed with any signal
  the SDK already attaches to a given call) is passed to `new Inngest({ fetch: … })`,
  bounding every HTTP call the client makes; no retry is added at that layer since
  `inngest.send()` already wraps its own call in a bounded retry and Inngest's own
  step/function retry semantics are the bounded-retry story for job execution — a second,
  transport-level retry there would risk a duplicate send. Resend
  (`packages/email/src/send.ts`'s `deliver()`) similarly has no client-level timeout knob
  (`getResendClient`), so `deliver()` races the actual `resend.emails.send` call against a
  local ~10s timeout and returns a typed `{ delivered: false, reason: "timeout" }` result
  if it loses; email deliberately gets no retry — it isn't idempotent, and a timed-out send
  may already be in flight at Resend, so retrying risks sending twice.
- **Rate limiting lives in the wrapper (`defineHandler`/`defineAction`), never in the
  proxy** — rate limiting needs Postgres via the wrapper; the rule stands even though
  `proxy.ts` now runs in the `nodejs` runtime (Next 16) and could technically reach
  Postgres directly — a DB round trip on every request there is avoidable latency the
  wrapper doesn't pay, not something the runtime merely used to be incapable of.
- Your app's `proxy.ts` (`apps/*/proxy.ts`) is an optimistic first layer only (redirects
  obviously signed-out page loads before render) — it is **not** the security boundary;
  the wrapper's mandatory auth mode is. The shared allowlist logic lives in
  `packages/ui/src/middleware.ts` (`@factory/ui/middleware`); each app's `proxy.ts` calls
  `createAuthProxy({ i18n, extraExactAllowlist? })` — `i18n` (a `createLocaleRouting(...)`
  handler from `@factory/i18n/middleware`) is required, every preset always passes one;
  `extraExactAllowlist` is its own extra allowlist entries, same as before.
- **Guarded zones**: `packages/auth`, `packages/core`, `packages/billing`, `proxy.ts`
  (`apps/*/proxy.ts`), `packages/ui/src/middleware.ts`, `packages/i18n/src/middleware.ts`,
  `packages/i18n/src/routing.ts`, and `packages/db` migrations. A PR touching any of these
  needs a security checklist and an independent, fresh-context security review before
  merging — no exceptions for "just a small change."
- Never log secrets or PII. LLM call logs store metadata (tokens, cost, latency), never
  raw payloads.
