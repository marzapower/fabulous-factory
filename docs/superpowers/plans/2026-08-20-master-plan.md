# Fabulous Factory — Development Master Plan

**Date:** 2026-08-20
**Source spec:** `docs/superpowers/specs/2026-08-20-fabulous-factory-design.md` (approved)
**Process:** `fabulous-feature` cycle per milestone. This document holds the milestone map
(M1–M10) and the full implementation contracts for **Milestone 1**, which is built in the
current cycle. Later milestones get their contract sections appended when their cycle starts.

---

## Part A — Milestone map (from spec §14)

Each milestone is one fabulous-feature cycle: contracts → critique → parallel
implementation → review → gates → approval-gated Conventional Commit.

| #   | Name                        | Delivers                                                                                                                                                                                                                                                 | Exit criterion                                                                                 |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| M1  | Workspace + config keystone | pnpm workspace, `packages/config` (server-only capability map, env registry, `ClientConfigProvider`), generated `.env.example`, `pnpm factory:doctor`, commitlint/husky, minimal `apps/web` skeleton, CI with **minimal-profile boot check**             | CI green: lint, typecheck, unit tests, boot check with only `DATABASE_URL` set                 |
| M2  | Data + auth + app shell     | `packages/db` (Drizzle schema/client/migrations/seed), `packages/auth` (Better Auth, `requireSession`), Tailwind + shadcn/ui app shell, `.devcontainer`/Codespaces, predev self-healing migrations                                                       | First milestone of the promise: full app boots with only Postgres; signup/login works          |
| M3  | Enforcement kernel          | `packages/core`: `defineHandler`/`defineAction`, raw-handler lint ban, boundary rules (dependency-cruiser/eslint-boundaries), security headers + CSRF, Postgres rate limiter, `safeFetch`, `untrusted()`, guarded zones, gitleaks/audit/semgrep CI gates | A raw route handler fails lint; all existing routes migrated to wrappers; boundary suite green |
| M4  | Thin services               | `packages/email` (resend/console/disabled), `packages/analytics` (PostHog + no-op), `packages/observability` (Sentry + OTel + no-op); auth×email verification posture (§5.2)                                                                             | Contract suites pass for every transport/no-op; doctor reports the three services              |
| M5  | LLM gateway                 | `packages/llm`: `generate()`, profiles local/openrouter/direct, routing config, `pricing.json` cost accounting, `LlmDisabledError`, OTel spans                                                                                                           | Unit tests for routing/cost math; degraded path typed and tested                               |
| M6  | Jobs + demo loop            | `packages/jobs` (Inngest client/functions), page-monitor demo: URL watch, cron fetch via `safeFetch`, hash diff, LLM summary, in-app feed, manual "check now" fallback                                                                                   | Golden-path smoke passes in both profiles; no-LLM-call-on-unchanged-hash tested                |
| M7  | Billing                     | `BillingProvider` interface, `adapters/{stripe,disabled}`, shared contract suite, webhook-cached subscription table, `plans.ts` catalog with `providerRefs`                                                                                              | Both adapters pass the same contract suite; checkout hidden when disabled                      |
| M8  | Docker + deploy             | Multi-stage Dockerfile (runtime + migrate images), compose profiles (base/jobs/llm), `/api/health` liveness-only, CI docker-build check                                                                                                                  | `docker compose up` is the minimal-boot quickstart; image builds with zero service env         |
| M9  | Factory layer               | Slim Adoption Ledger (`manifest.json`, `factory:status`, `preflight`), `.factory/handoff/` set, `factory:init`, adopter + factory-dev skills, `pnpm gen` scaffolds                                                                                       | `factory:init` one-shot works on a fresh clone; preflight stage-aware in CI                    |
| M10 | Polish + distribution       | Degradation-matrix tests, guides (deploy×2, llm-evals, make-it-yours), README final pass, live demo deploy, template publish + launch checklist                                                                                                          | Live demo up with "what's disabled" panel; quickstart verified from a clean clone              |

Cross-milestone invariants (enforced from M1, never regressed):

- English-only repo content; Conventional Commits.
- No `NEXT_PUBLIC_*` capability signals; capability map is server-only, request-time.
- `pnpm check` is the machine-checkable definition of done; it must stay green on a
  zero-config machine (integration tests skip cleanly with a visible notice).
- CI runs the suite in minimal profile from M1; the full (mocked) profile is added in M4
  when the first mockable service exists.

---

## Part B — Milestone 1 contracts

### B.0 Scope statement

**In:** root workspace scaffolding; `packages/config`; generated `.env.example`;
`pnpm factory:doctor`; commitlint + husky; minimal `apps/web` (landing page, capability panel,
`/api/health`); `.github/workflows/ci.yml` with the minimal-profile boot check.

**Explicitly out (excluded impacts):** zero database code and zero migrations (Postgres is
_referenced_ by `DATABASE_URL` in the registry but never connected to); no auth; no
Tailwind/shadcn (M2); no `defineHandler` (M3 — the health route is a temporary raw handler,
flagged with a `TODO(M3)`); no Docker; no vendor SDK of any kind is installed.

### B.1 Toolchain decisions (declared autonomously)

- Node ≥ 22 (`engines` as floor), pnpm pinned to an exact current 11.x via
  `packageManager` (e.g. `pnpm@11.22.0`). Dependency rule: **latest stable within the
  majors the spec freezes** — `next@^15` (NOT 16, which is latest on npm) with the React
  19 version Next 15 requires; implementers verify exact versions against the npm registry
  rather than trusting memory.
- TypeScript strict; a single `tsconfig.base.json` all packages extend.
- ESLint 9 flat config at root (`eslint.config.mjs`), typescript-eslint, plus
  `eslint-config-prettier`. Prettier with default options (`.prettierrc.json` pins only
  `printWidth: 100`).
- Vitest at root with `projects` config; internal packages consumed as TS source (spec
  §3): each package's `package.json` `exports` points at `.ts` files, no build step. Next
  does **not** transpile workspace packages automatically: `apps/web`'s `next.config.ts`
  must list them explicitly via `transpilePackages: ['@factory/config']` (§B.4).
- **`server-only` under vitest:** the `server-only` package throws under Node's default
  export condition. Unit tests import pure modules directly (`capabilities.ts`,
  `registry.ts`), and additionally the root vitest config aliases `server-only` to an
  empty stub so accidental transitive imports don't detonate tests.

### B.2 Root workspace — file manifest

```
package.json                 # scripts (below), devDeps, packageManager, engines
pnpm-workspace.yaml          # packages: ["apps/*", "packages/*"]
tsconfig.base.json           # strict, moduleResolution bundler, paths none (pnpm resolves)
eslint.config.mjs            # flat config, ts + prettier-compat
.prettierrc.json / .prettierignore
vitest.config.ts             # projects: packages/*, alias server-only → stub
commitlint.config.mjs        # extends @commitlint/config-conventional
.husky/commit-msg            # pnpm commitlint --edit "$1"
.gitignore                   # extended: .next, coverage, *.tsbuildinfo
```

Root scripts contract:

```jsonc
{
  "dev": "pnpm --filter web dev",
  "build": "pnpm --filter web build",
  "lint": "eslint .",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "typecheck": "pnpm -r run typecheck", // each workspace defines "typecheck": "tsc --noEmit"; no composite/build mode
  "test": "vitest run",
  "check": "pnpm lint && pnpm format:check && pnpm typecheck && pnpm test",
  "factory:doctor": "tsx packages/config/scripts/doctor.ts", // "doctor" is shadowed by pnpm 11's built-in command
  "gen:env-example": "tsx packages/config/scripts/gen-env-example.ts",
  "prepare": "husky",
}
```

### B.3 `packages/config` — file manifest and contracts

```
packages/config/
├── package.json             # name "@factory/config"; exports "." (server) and "./client"
├── tsconfig.json
├── src/
│   ├── registry.ts          # THE single source: env var registry
│   ├── env.ts               # zod parse of process.env (server), memoized
│   ├── capabilities.ts      # pure derivation: (env) => Capabilities
│   ├── public-config.ts     # (env, caps) => ClientConfig (serializable, no secrets)
│   ├── index.ts             # server entry: imports "server-only", re-exports API
│   └── client.tsx           # client entry: ClientConfigProvider + useClientConfig
├── scripts/
│   ├── doctor.ts            # pnpm factory:doctor
│   └── gen-env-example.ts   # writes ../../.env.example; --check mode for CI
└── test/
    ├── capabilities.test.ts
    ├── registry.test.ts
    └── gen-env-example.test.ts
```

**Registry** (single source for `.env.example`, doctor, and zod schema):

```ts
export type ServiceGroup =
  "core" | "billing" | "llm" | "email" | "jobs" | "analytics" | "observability";

export interface EnvVarSpec {
  name: string; // e.g. "STRIPE_SECRET_KEY"
  group: ServiceGroup;
  description: string; // one line, shown in .env.example comment and doctor hints
  example?: string; // placeholder value for .env.example (never a real secret)
  required?: boolean; // only DATABASE_URL is true
  secret?: boolean; // doctor masks the value
}

export const ENV_REGISTRY: readonly EnvVarSpec[];
```

Registry contents in M1 (vars for services built in later milestones are registered now so
`.env.example` and doctor are complete from day one; detection logic may be refined in the
owning milestone): `DATABASE_URL` (required); `APP_URL`; `BILLING_PROVIDER`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; `LLM_PROFILE`, `LLM_LOCAL_BASE_URL`,
`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`; `RESEND_API_KEY`,
`EMAIL_FROM`; `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`; `POSTHOG_KEY`, `POSTHOG_HOST`;
`SENTRY_DSN`.

**Capabilities** (pure, fully unit-testable):

```ts
export interface Capabilities {
  billing: "stripe" | "disabled";
  llm: "local" | "openrouter" | "direct" | "disabled";
  email: "resend" | "console" | "disabled";
  jobs: "inngest" | "disabled";
  analytics: "posthog" | "disabled";
  errors: "sentry" | "disabled";
}
export type ServiceName = keyof Capabilities;

/** Pure. `mode` is NODE_ENV-derived: 'development' | 'production' | 'test'. */
export function deriveCapabilities(env: RawEnv, mode: AppMode): Capabilities;
```

Detection rules (spec §5.1, provisional entries owned by later milestones are marked):

- `billing`: `'stripe'` iff `STRIPE_SECRET_KEY` **and** `STRIPE_WEBHOOK_SECRET` are both
  set; `BILLING_PROVIDER=disabled` forces off. Anything else → `'disabled'`.
- `llm`: explicit `LLM_PROFILE` wins if its credentials are present (else `'disabled'` +
  doctor warning). Otherwise by presence, precedence `openrouter` (`OPENROUTER_API_KEY`) →
  `direct` (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) → `local` (`LLM_LOCAL_BASE_URL`) →
  `'disabled'`.
- `email`: `RESEND_API_KEY` → `'resend'`; else `'console'` **only when mode is
  development**; else `'disabled'` (spec: console is dev-only, prod unconfigured =
  disabled).
- `jobs` _(provisional, refined in M6)_: both `INNGEST_EVENT_KEY` and
  `INNGEST_SIGNING_KEY` → `'inngest'`; else `'inngest'` in development (local `inngest dev`
  server, degrades if absent — M6 owns the final semantics); else `'disabled'`.
- `analytics`: `POSTHOG_KEY` → `'posthog'` else `'disabled'`.
- `errors`: `SENTRY_DSN` → `'sentry'` else `'disabled'`.

**Server entry** (`index.ts`, first line `import 'server-only'`):

```ts
export function getEnv(): Env; // zod-validated, memoized; throws EnvValidationError with per-var messages
export function getCapabilities(): Capabilities; // memoized derive over getEnv()
export function isEnabled(service: ServiceName): boolean;
export function getClientConfig(): ClientConfig; // for ClientConfigProvider
```

**Client contract** (`client.tsx` — NO `server-only`, no `process.env` reads):

```ts
export interface ClientConfig {
  /** On/off facts ONLY. Adapter identities ('stripe', 'sentry', …) are recon data
   *  (spec §12) and must never cross the server boundary. */
  capabilities: Record<ServiceName, boolean>;
  appUrl: string; // defaults to "http://localhost:3000" when APP_URL unset
  posthog: { key: string; host: string } | null; // only non-secret publishables ever appear here
}
export function ClientConfigProvider(props: {
  config: ClientConfig;
  children: React.ReactNode;
}): React.JSX.Element;
export function useClientConfig(): ClientConfig; // throws outside the provider
```

**Doctor** output contract: one line per service — status glyph, active adapter, and for
disabled services the exact env vars that would enable it (from the registry); required
vars missing → red block at top; exits 0 always in M1 (it is a report, not a gate).
Doctor consumes the non-throwing pair (`ENV_REGISTRY` + `deriveCapabilities`) directly —
never `getEnv()`, which throws on invalid env (exactly the state doctor must report on).
The `local` LLM hint mentions Ollama's well-known default (`http://localhost:11434/v1`);
final `local`-profile semantics are M5's to own.

**gen-env-example**: deterministic output, grouped by `ServiceGroup`, each var preceded by
its description comment, required vars uncommented, optional vars commented out.
`--check` re-generates in memory and exits 1 with a diff hint if `.env.example` on disk
differs (CI staleness gate — spec §8.1 "the two can never disagree").

**Error semantics:** `getEnv()` failures throw a single aggregated `EnvValidationError`
listing every invalid/missing var with its registry description — never a bare zod stack.

### B.4 `apps/web` — file manifest and contracts

```
apps/web/
├── package.json             # name "web"; next 15, react 19; dep @factory/config
├── next.config.ts           # output: 'standalone', transpilePackages: ['@factory/config'],
│                            #   outputFileTracingRoot: workspace root (deterministic standalone path for CI)
├── tsconfig.json
└── app/
    ├── layout.tsx           # html shell ONLY — config-free (see rule below)
    ├── page.tsx             # landing: motto + capability panel; `export const dynamic = 'force-dynamic'`;
    │                        #   calls getClientConfig() and mounts ClientConfigProvider here
    ├── capability-panel.tsx # client component consuming useClientConfig() — proves the seam end-to-end
    └── api/health/route.ts  # GET → 200 {"status":"ok"} — liveness only (spec §12); TODO(M3): migrate to defineHandler
```

**Convention (recorded here, enforced from M1): the root layout stays config-free.** Next
statically prerenders `/_not-found` at build time, and that render includes the root
layout — a `getClientConfig()` call there would freeze build-machine capabilities into
static HTML, violating spec §5.1. `getClientConfig()`/`ClientConfigProvider` live inside
`force-dynamic` pages (or route-group layouts explicitly marked dynamic) only. `page.tsx`
is `force-dynamic` (spec §5.1: capability-conditional routes render dynamically). No
styling framework yet — inline minimal CSS, replaced in M2.

### B.5 CI — `.github/workflows/ci.yml`

Triggers: `pull_request` + `push` to `main`. Jobs:

1. **pr-title** (PR events only): Conventional Commit lint of the PR title (commitlint on
   `github.event.pull_request.title`).
2. **quality**: pnpm install (frozen lockfile) → `pnpm lint` → `pnpm format:check` →
   `pnpm gen:env-example --check` → `pnpm typecheck` → `pnpm test`.
3. **minimal-boot**: env contains **only** `DATABASE_URL=postgres://placeholder:5432/x`
   (no real DB in M1 — nothing connects yet; M2 upgrades this job to a Postgres service
   container). Steps: `pnpm build` → start the standalone server
   (`node apps/web/.next/standalone/apps/web/server.js`) → poll `GET /api/health` until
   200 (30 s budget) → assert body. This is the spec's §9.5 minimal-profile enforcement,
   in embryo from day one.

### B.6 Tests planned (all pure unit — no DB in M1)

- `capabilities.test.ts`: table-driven env permutations — empty env (everything
  disabled/console-in-dev); each service lighting up; `LLM_PROFILE` override with and
  without credentials; email console-vs-disabled by mode; stripe requiring both keys;
  `BILLING_PROVIDER=disabled` forcing off.
- `registry.test.ts`: registry invariants — unique names, `DATABASE_URL` present and the
  only `required`, every var has description and group.
- `gen-env-example.test.ts`: golden output snapshot; `--check` fails on drift; secrets
  never carry example values that look real.
- `EnvValidationError` aggregation: multiple invalid vars → one error listing all.
- `client.test.tsx` (jsdom environment, @testing-library/react): `useClientConfig()`
  throws outside the provider; inside it, returns the exact object passed in.

### B.7 Parallel implementation split (disjoint files)

- **Agent A — workspace root:** everything in §B.2. Owns all root-level files.
- **Agent B — config package:** everything in §B.3 plus generated `.env.example`
  (top-level file, but only B writes it).
- **Agent C — web app + CI:** everything in §B.4 plus `.github/workflows/ci.yml`.

B and C import nothing from each other. A's outputs (tsconfig.base, eslint config) are
contracts pinned above; B and C are told a red typecheck caused solely by A's missing root
files is expected during parallel work, not something to fix. **No agent touches
`pnpm-lock.yaml` or runs `pnpm install`**: every agent only declares deps in its own
`package.json`; the lockfile is created exactly once, by the orchestrator's single final
`pnpm install` after all three report done.

### B.8 Definition of done (M1)

`pnpm check` green on this machine with an empty `.env`; `pnpm factory:doctor` prints the full map
with every optional service disabled and correct enablement hints; `pnpm build` + health
check succeed locally with only `DATABASE_URL` set; CI file passes `actionlint` (if
available) or careful review; one Conventional Commit, approval-gated.

### B.9 Accepted deviations (discovered during implementation)

- **`pnpm doctor` → `pnpm factory:doctor`.** pnpm ≥ 7 ships a built-in `doctor` command
  that always shadows a package.json script of the same name. The capability report is
  therefore exposed as `factory:doctor` (consistent with the spec's `factory:*`
  namespace). The design spec's `pnpm doctor` mentions (§2, §5.1, §5.2, §8.1, §8.6, §12)
  should be read as `pnpm factory:doctor`; amending the spec text is left as a follow-up.
- **ESLint 10, not 9.** Current stable at implementation time; flat-config format
  unchanged. Plan §B.1's "ESLint 9" reads as "ESLint flat config, current stable".
- **TypeScript pinned `~6.0.3`, not latest (7.0.2).** typescript-eslint 8.x does not
  support TS 7.0; 6.0.3 is the latest supported stable line, pinned in all three
  workspaces.
- **Root `package.json` gained `"type": "module"`** so the root `vitest.config.ts` loads
  as ESM without warnings.
- **`allowBuilds` in `pnpm-workspace.yaml`** (esbuild, sharp): pnpm 11 blocks dependency
  build scripts by default and scaffolds this key itself; both are required (vitest/tsx
  need the esbuild binary, Next.js uses sharp).

---

## Part C — Milestone 2 contracts

### C.0 Scope statement

**In:** `packages/db` (Drizzle + node-postgres, Better Auth schema, migrations, seed
stub, programmatic migrator); `packages/auth` (Better Auth on Postgres, session helpers);
Tailwind 4 + shadcn/ui app shell (login/signup/dashboard); auth route mount; self-healing
migrations chained into `pnpm dev`; `.devcontainer` with Codespaces support; CI upgraded with a real
Postgres service (integration tests + minimal-boot against a live DB); registry additions
for auth vars; `@factory/config/node` entry for Node scripts.

**Explicitly out (excluded impacts):** no `defineHandler` (M3; the auth catch-all mount
and health route stay raw with `TODO(M3)`); no middleware (M3); no email sending — **email
verification posture and magic links are M4** (per Part A; M2 ships
`requireEmailVerification: false` with a `TODO(M4)`); no billing/llm/jobs code; no Docker
images (M8; the devcontainer's compose file is dev-only tooling); demo seed data is M6
(`db:seed` exists but only prints a notice); root landing page keeps its M1 look
(capability panel intact).

### C.1 Verified library facts (research, 2026-08-20)

- `drizzle-orm@^0.45.2`, `drizzle-kit@^0.31.10`, driver `pg@^8.23.0` (node-postgres —
  matches better-auth's peer deps; drizzle client via
  `import { drizzle } from "drizzle-orm/node-postgres"`), programmatic migrator
  `import { migrate } from "drizzle-orm/node-postgres/migrator"` with
  `{ migrationsFolder }` (typecheck this import in CI — known TS regression window,
  GH drizzle-orm#5289).
- `better-auth@^1.7.1`. Adapter import **verified against the installed exports map**:
  `better-auth/adapters/drizzle` (`drizzleAdapter(db, { provider: "pg", schema })`).
  Mount: `better-auth/next-js` → `toNextJsHandler(auth)` in
  `app/api/auth/[...all]/route.ts`. RSC session:
  `auth.api.getSession({ headers: await headers() })`. React client:
  `better-auth/react` → `createAuthClient()`. Schema generation CLI is the npm package
  `auth` (`npx auth@latest generate`); Drizzle schemas are applied via drizzle-kit, never
  `auth migrate` (Kysely-only). `requireEmailVerification` lives under `emailAndPassword`;
  `sendVerificationEmail` is a separate top-level `emailVerification` block (M4). Secret:
  `BETTER_AUTH_SECRET` — silent dev fallback, throws in production when unset.
  Social providers take explicit `clientId`/`clientSecret` (no env auto-read).
- Tailwind `4.x` config-file-less: `postcss.config.mjs` with `@tailwindcss/postcss`,
  `@import "tailwindcss"` in `app/globals.css`, no tailwind.config.
- shadcn CLI: package `shadcn` (NOT deprecated `shadcn-ui`), Tailwind 4 + React 19
  native; non-interactive: `pnpm dlx shadcn@latest init -d`, `... add <c> -y`. Scaffolds
  `components.json`, `lib/utils.ts` (cn), theme CSS variables in globals.css,
  `components/ui/*`.
- Postgres: image `postgres:18-alpine`; GH Actions service healthcheck
  `--health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5`.

### C.2 Sequencing change vs M1 (orchestrator pre-install)

The M1 pain point was agents working without `node_modules`. M2 inverts it: the
orchestrator FIRST commits the dependency skeleton — new/updated `package.json` files for
`packages/db`, `packages/auth`, `apps/web`, root scripts — and runs the single
`pnpm install`. Implementation agents then work with a live toolchain (can run `tsc`,
`vitest`, `drizzle-kit generate`, the `auth` CLI) but remain forbidden from touching any
`package.json` or the lockfile; a needed-but-missing dep is reported back, added by the
orchestrator.

### C.3 `packages/config` additions (owner: auth agent)

- `src/registry.ts`: new group `'auth'` in `ServiceGroup`; new vars — `BETTER_AUTH_SECRET`
  (secret; description notes: optional in dev, REQUIRED in production),
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (secret), `GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET` (secret). `Capabilities` is UNCHANGED (auth is always-on, not a
  capability).
- New export `"./node": "./src/node.ts"`: re-exports `getEnv`, `getCapabilities`,
  `parseEnv`, `deriveCapabilities`, `loadEnvFile`, `readMergedEnv` WITHOUT the
  `server-only` poison. Doc comment: for Node-only scripts (migrator, seed, doctor) —
  never import from app code (boundary lint enforces this in M3).
- `src/env-file.ts`: extracted from `doctor.ts` with BOTH primitives —
  `loadEnvFile(path?): Record<string, string>` (raw parse) and `readMergedEnv(): RawEnv`
  (doctor's exact semantics: parse `.env`, merge UNDER real `process.env`, filter to
  registry vars, drop empty strings). Doctor and `migrate.ts` both call `readMergedEnv`.
- **gen-env-example hardening (mandatory):** the generator's `GROUP_ORDER` and
  `GROUP_TITLES` constants must both gain `'auth'`, and a new invariant test asserts every
  group used in `ENV_REGISTRY` appears in `GROUP_ORDER` (today a missing group silently
  drops its vars from `.env.example`).
- Doctor: new `auth` section — always-on line; per-provider OAuth status (google/github by
  key presence); `BETTER_AUTH_SECRET` warning in production ("auth endpoints will fail")
  AND as an advisory in development ("set it before deploying").
- Tests: registry invariants keep passing (group enum extended); new cases for the auth
  vars; the `GROUP_ORDER` invariant test; `.env.example` regenerated via the generator.

### C.4 `packages/db` (owner: db agent)

```
packages/db/
├── package.json          # "@factory/db"; exports ".": src/index.ts, "./schema": src/schema/index.ts
├── tsconfig.json         # extends base; types: ["node"]
├── vitest.config.ts      # node env; server-only alias (same stub path as config)
├── drizzle.config.ts     # defineConfig({ dialect: "postgresql", schema: "./src/schema/index.ts", out: "./migrations" })
├── migrations/           # drizzle-kit generate output (SQL + meta), checked in
├── src/
│   ├── schema/auth.ts    # Better Auth core tables (user, session, account, verification) — generated via `npx auth@latest generate` with a throwaway config, adapted; default (singular) table names, DO NOT rename
│   ├── schema/index.ts   # export * from "./auth"
│   ├── client.ts         # getDb(): NodePgDatabase<typeof schema> — memoized; env via @factory/config/node
│   │                     #   readMergedEnv() (NOT the poisoned entry, so scripts stay importable);
│   │                     #   drizzle({ client: pool, schema }) — schema passed for typed queries
│   └── index.ts          # import "server-only"; re-exports getDb + schema (app-facing poison lives HERE only)
├── scripts/
│   ├── migrate.ts        # env via @factory/config/node readMergedEnv(); builds its OWN Pool and calls
│   │                     #   drizzle migrate() — never imports src/index.ts (poisoned).
│   │                     #   Two modes: plain (used by `pnpm db:migrate` and CI) hard-fails on error;
│   │                     #   --predev ALWAYS exits 0 — prints a warning when DB is unreachable or
│   │                     #   FACTORY_SKIP_MIGRATIONS=1, so `pnpm dev` still starts.
│   └── seed.ts           # M2 stub: prints "demo seed data ships with the demo product (M6)"
└── test/integration/
    └── migrations.test.ts  # mechanism pinned: `describe.skipIf(!process.env.TEST_DATABASE_URL)` +
                            #   a module-scope console.warn notice when skipping; 30s per-test timeout
                            #   (migrator over a cold CI service can exceed the 5s default);
                            #   otherwise: run migrator against it, assert the four auth tables exist
```

Contract: `getDb()` memoized; `schema` namespace re-export. Integration tests build their
own `Pool` from `TEST_DATABASE_URL` (documented exception to the process.env rule — test
code, wiped DB). Root scripts (orchestrator, exact):
`"db:migrate": "tsx packages/db/scripts/migrate.ts"`,
`"db:seed": "tsx packages/db/scripts/seed.ts"`,
`"db:generate": "pnpm --filter @factory/db exec drizzle-kit generate"` (cwd matters for
drizzle.config.ts relative paths).

**Build-time note (recorded for M8):** the auth route imports the module-scope
`betterAuth(...)` instance, so `next build`'s page-data collection now requires a
syntactically valid `DATABASE_URL` (the Pool never connects at build). Fine for M2 CI;
M8's Docker build must pass a placeholder build ARG to keep §5.1 honest.

### C.5 `packages/auth` (owner: auth agent)

```
packages/auth/
├── package.json          # "@factory/auth"; exports ".": src/index.ts, "./client": src/client.ts
├── tsconfig.json / vitest.config.ts
├── src/
│   ├── options.ts        # PURE, exact return type (web agent renders from it):
│   │                     #   deriveAuthOptions(env: RawEnv, capabilities: Capabilities): {
│   │                     #     requireEmailVerification: boolean;            // always false in M2 (TODO(M4))
│   │                     #     socialProviders: { google?: { clientId: string; clientSecret: string };
│   │                     #                        github?: { clientId: string; clientSecret: string } };
│   │                     #     enabledProviders: Array<'google' | 'github'>;
│   │                     #   }
│   ├── auth.ts           # betterAuth({ database: drizzleAdapter(getDb(), { provider: "pg", schema }),
│   │                     #   emailAndPassword: { enabled: true, requireEmailVerification: false /* TODO(M4) */ },
│   │                     #   baseURL: env.APP_URL (undefined → Better Auth same-origin default),
│   │                     #   secret: env.BETTER_AUTH_SECRET — undefined is fine in dev (built-in fallback)
│   │                     #   but REQUIRED in production: better-auth 1.7.1 throws on the default secret
│   │                     #   when NODE_ENV=production, so auth endpoints 500 until it is set. This is
│   │                     #   the documented §5.2 tension: auth needs only the DB *plus one secret* in prod.
│   │                     #   socialProviders: from options.ts })
│   ├── session.ts        # getSession(): Promise<Session | null> (RSC idiom);
│   │                     #   requireSession(opts?: { redirectTo?: string }): Promise<Session> — redirect("/login") when absent
│   ├── index.ts          # import "server-only"; exports auth, getSession, requireSession, deriveAuthOptions, types
│   └── client.ts         # "use client" module: createAuthClient from better-auth/react;
│                         #   exports authClient + { signIn, signUp, signOut, useSession }
└── test/options.test.ts  # pure tests: providers appear only when BOTH keys present; verification flag currently always false
```

Consumed-by-web contract (pin): `import { getSession, requireSession } from "@factory/auth"`;
`import { authClient } from "@factory/auth/client"`; OAuth button visibility is decided
SERVER-SIDE on the login page via `deriveAuthOptions` (ClientConfig unchanged).

### C.6 `apps/web` shell (owner: web agent)

```
apps/web/
├── postcss.config.mjs, app/globals.css   # Tailwind 4 + shadcn theme variables
├── components.json, lib/utils.ts          # HAND-WRITTEN from the shadcn registry idiom — the CLI is
├── components/ui/{button,input,card,label}.tsx   #   forbidden here: `shadcn init/add` edits package.json
│                                          #   + lockfile (orchestrator territory). The C.2 skeleton
│                                          #   pre-adds the dep set the components need: clsx,
│                                          #   tailwind-merge, class-variance-authority, lucide-react,
│                                          #   tw-animate-css. (CLI allowed ONLY if package.json and
│                                          #   lockfile end up byte-identical.)
├── components/auth/{login-form,signup-form}.tsx  # "use client"; authClient email flows + error states
├── app/layout.tsx                         # + import "./globals.css" (still config-free)
├── app/page.tsx                           # M1 landing restyled minimally with Tailwind; links to /login /signup /dashboard
├── app/(auth)/login/page.tsx              # force-dynamic server component; OAuth buttons via deriveAuthOptions
├── app/(auth)/signup/page.tsx             # force-dynamic
├── app/dashboard/page.tsx                 # force-dynamic; await requireSession(); shows user email + sign-out + capability panel
├── app/api/auth/[...all]/route.ts         # export const { GET, POST } = toNextJsHandler(auth) — TODO(M3) note
├── tsconfig.json                          # + "baseUrl": ".", "paths": { "@/*": ["./*"] } (shadcn imports
│                                          #   use @/lib/utils; existing relative imports remain valid)
└── package.json (orchestrator)            # "dev": "tsx ../../packages/db/scripts/migrate.ts --predev && next dev"
                                           #   (pnpm does NOT run pre/post scripts by default — no "predev";
                                           #   the --predev mode always exits 0, so dev always starts)
```

Design note: form components follow shadcn idiom; no design-system work beyond clean
defaults (brand-it is a later ledger item). Sign-out via `authClient.signOut()` +
`router.refresh()`.

### C.7 `.devcontainer` + CI (owner: web agent)

- `.devcontainer/devcontainer.json` + `.devcontainer/docker-compose.yml`: app service
  (`mcr.microsoft.com/devcontainers/typescript-node:22`) + `db` service
  (`postgres:18-alpine`, POSTGRES_PASSWORD=postgres, volume), `DATABASE_URL` and
  `TEST_DATABASE_URL` preset, forwardPorts [3000], postCreateCommand
  `corepack enable && pnpm install`.
- `ci.yml`: `quality` job gains a postgres service + `TEST_DATABASE_URL` env (integration
  tests now RUN in CI, skip-clean locally); `minimal-boot` gains the same service, its env
  stays `DATABASE_URL` ONLY — but the VALUE changes from the placeholder to the real
  service URL (`postgres://postgres:postgres@127.0.0.1:5432/postgres`) since migrate now
  actually connects — and the job runs `pnpm db:migrate` before `pnpm build`, then boots +
  polls `/api/health` as before. Comment updated (promise fulfilled: boots with only
  Postgres).

### C.8 Tests planned

- Pure: `deriveAuthOptions` permutations (C.5); config registry additions (C.3).
- Integration (skip-clean without `TEST_DATABASE_URL`): migrator creates the four auth
  tables (C.4).
- Existing 66 tests must keep passing; `.env.example` staleness gate covers the registry
  change.
- NOT in M2: e2e signup/login browser tests (golden-path smoke is M6+; the CI boot check
  plus Better Auth's own tested internals cover M2's exit criterion pragmatically —
  signup/login is verified manually against the dev server before commit).

### C.9 Definition of done (M2)

`pnpm check` green locally (integration visibly skipped without a test DB); with Postgres
via docker: `db:migrate` runs, `pnpm dev` boots, signup → session → dashboard →
sign-out works — **verified in development mode** (production auth requires
`BETTER_AUTH_SECRET`, C.5), manually by the orchestrator with a live browser or curl,
including one check that a missing prod secret manifests as 500s on `/api/auth/*` (not a
boot crash — the auth context promise stores its rejection until first await; expected
behavior, not a regression); CI green incl. integration tests and DB-backed minimal-boot;
devcontainer config reviewed; one Conventional Commit, approval-gated.

### C.10 Accepted deviations (discovered during implementation)

- **`getEnv()` reads the merged env view, not bare `process.env`.** Review finding
  (blocking): Next.js only auto-loads env files from the app directory, and dev-mode
  workers don't inherit `next.config.ts` side effects — so the documented root-`.env`
  quickstart never reached the app. Since all env access flows through `packages/config`
  (§8.4), `getEnv()` now parses `readMergedEnv()` (root `.env` merged UNDER real env; in
  production bundles the file doesn't exist and this degrades to plain `process.env`).
  One env view for app, migrator, and doctor. Supersedes B.3's "reads process.env once"
  wording. Verified against the literal quickstart.
- **`FACTORY_SKIP_MIGRATIONS` is a registered var** (group core) — review finding: it was
  an unregistered raw `process.env` read, invisible to `.env.example`/doctor and inert in
  `.env` files. Now read through `readMergedEnv` like everything else.
- **apps/web tsconfig uses `paths` without `baseUrl`** — TS 6 hard-errors on `baseUrl`
  (TS5101, removed); `paths` resolve relative to the tsconfig directory, identical result.
- **`apps/web/css.d.ts`** ambient-declares `*.css` — Next's generated `next-env.d.ts` only
  covers `*.module.css`, and `tsc --noEmit` needs the side-effect import to typecheck.
- **Button/Label are radix-free.** shadcn registry sources use `radix-ui` (Slot/`asChild`,
  `Label.Root`), which isn't in the dep set; the components keep identical classes/variants
  with plain `<button>`/`<label>`. Re-add `radix-ui` when a call site needs `asChild`.
  Nav links use `buttonVariants()` + `<Link>` (correct for navigation anyway).
- **`lucide-react` is installed but unused** until the first icon lands (contract pre-add);
  `pnpm-workspace.yaml` carries a pnpm-generated release-age exclude pinned to 1.33.0.
- **Devcontainer volume mounts `/var/lib/postgresql`** (not `.../data`) — postgres:18
  moved PGDATA; the old mount silently lost data to an anonymous volume.
- Nit left on record: `resolveMode()` exists in three places (config index, node entry,
  doctor) — extract on next touch.
