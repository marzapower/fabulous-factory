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
later. `apps/demo` may import anything; nothing imports `apps/*`.

| Package         | May import                                                           |
| --------------- | -------------------------------------------------------------------- |
| `config`        | (none — DAG root)                                                    |
| `db`            | `config`                                                             |
| `auth`          | `config`, `db`, `email`                                              |
| `email`         | `config`                                                             |
| `analytics`     | `config`                                                             |
| `observability` | `config`                                                             |
| `core`          | `config`, `db`, `auth`                                               |
| `llm`           | `config`, `db`, `core`, `observability`                              |
| `jobs`          | `config`, `db`, `core`, `llm`, `email`, `analytics`, `observability` |
| `billing`       | `config`, `db`                                                       |
| `demo` (app)    | anything                                                             |

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
- **Rate limiting lives in the wrapper (`defineHandler`/`defineAction`), never in
  middleware** — edge middleware cannot open a TCP connection to Postgres, and the
  Postgres-backed limiter needs one.
- `apps/demo/middleware.ts` is an optimistic first layer only (redirects obviously
  signed-out page loads before render) — it is **not** the security boundary; the
  wrapper's mandatory auth mode is.
- **Guarded zones**: `packages/auth`, `packages/core`, `packages/billing`,
  `middleware.ts`, and `packages/db` migrations. A PR touching any of these needs a
  security checklist and an independent, fresh-context security review before merging —
  no exceptions for "just a small change."
- Never log secrets or PII. LLM call logs store metadata (tokens, cost, latency), never
  raw payloads.
