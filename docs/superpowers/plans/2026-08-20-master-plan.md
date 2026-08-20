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

---

## Part D — Milestone 3 contracts (enforcement kernel)

### D.0 Scope statement

**In:** `packages/core` (`defineHandler`/`defineAction`, `ApiError` + error shaping,
Postgres fixed-window rate limiter, `safeFetch`, `untrusted()`); raw-handler lint ban +
architecture boundary rules wired into `pnpm check`; security headers; `middleware.ts`
(optimistic allowlist — explicitly NOT the security boundary, spec §8.5); migration of the
existing raw routes to the wrappers; guarded-zones CI job + PR security checklist
template; gitleaks/dependency-audit/semgrep CI gates; `rate_limits` table in
`packages/db` (+ migration 0001).

**Explicitly out:** the `webhook` option of `defineHandler` (M7 — the option name is
reserved in the type as an optional never-used field or omitted entirely until M7; decide
at implementation with a TODO(M7)); CSRF beyond what Next + Better Auth already enforce
plus Origin checks in the wrapper (documented); full CSP (headers ship without CSP in M3,
follow-up recorded — see D.1 once research lands); no new product surface; no email/llm/
billing packages.

### D.1 Verified tooling facts (orchestrator verification, 2026-08-20)

- **Better Auth session cookie helper** (verified in the installed 1.7.1 dist):
  `import { getSessionCookie } from "better-auth/cookies"` —
  `getSessionCookie(request: Request | Headers, config?)`. Cookie-presence only, no DB —
  exactly what the optimistic middleware needs.
- **Drizzle atomic upsert** (verified in installed 0.45.2 types):
  `db.insert(rateLimits).values(...).onConflictDoUpdate({ target: [...], set: { count: sql`${rateLimits.count} + 1` } }).returning()`.
  Window start computed app-side from epoch math (`floor(now/windowMs)*windowMs`) — no DB
  clock round-trip needed; document the single-clock assumption.
- **safeFetch mechanism** (undici Connector docs, nodejs/undici main): `packages/core`
  depends on `undici` (^8, currently 8.10.0; Node 22 bundles 6.x internally but does not
  expose Agent/fetch dispatcher types — the explicit dep pins behavior) and uses its
  `fetch` with an `Agent` whose custom `connect` wraps `buildConnector(...)`: after the
  socket connects, validate `socket.remoteAddress` against the deny-list
  (loopback, RFC1918, link-local 169.254/16 incl. metadata 169.254.169.254, IPv6
  loopback/link-local/ULA, 0.0.0.0/8) via `net.BlockList`; destroy + error when denied.
  Post-connect validation kills the DNS-rebinding TOCTOU by construction (the ACTUAL
  address is checked, not the pre-resolved one). Manual redirect loop (max 5) re-enters
  the same agent so every hop is re-validated. `request-filtering-agent` (3.2.1) targets
  node http agents, not fetch — not used.
- **gitleaks**: do NOT use `gitleaks/gitleaks-action@v2` — org use requires a license key
  AND the action runs on Node 20, which GitHub removes from runners in Sept 2026. Run the
  MIT-licensed CLI directly instead: official container
  (`docker run --rm -v $PWD:/repo ghcr.io/gitleaks/gitleaks:latest git /repo --redact
--no-banner` or the equivalent binary download) in a plain step. Implementer verifies
  the current image tag/invocation.
- **semgrep**: OSS invocation without tokens: `semgrep scan --config p/owasp-top-ten
--error` (registry `p/` configs are anonymously fetchable) via the official
  `semgrep/semgrep` container or pipx install. `semgrep ci` requires an account — not
  used. Implementer verifies current image/flags.
- **pnpm audit**: `pnpm audit --prod --audit-level high` as the CI gate (dev-only
  advisories don't block); implementer verifies flag behavior under pnpm 11.
- **Next 15.5 Server Actions** ship built-in Origin↔Host verification for POSTs
  (`serverActions.allowedOrigins` to extend) — `defineAction` therefore does NOT
  duplicate origin checks; `defineHandler` DOES check Origin (when present) against
  Host/APP_URL for state-changing methods, since route handlers get no framework CSRF
  protection. Implementer verifies against the shipped Next docs in node_modules.
- **ESLint 10 flat config** supports inline plugin objects (`plugins: { factory: { rules:
{...} } }`) — write the two enforcement rules as a small inline plugin in
  `eslint.config.mjs` (more precise than `no-restricted-syntax` selectors for the
  "CallExpression-initializer-only" allowance); scope via flat-config `files` globs.
  Fixture-style rule tests (D.8) prove both directions.
- **dependency-cruiser 18.2.0** for boundary rules (`.dependency-cruiser.cjs`,
  `depcruise --config` in CI/`pnpm boundaries`); it resolves TS sources + workspace
  `exports` (implementer verifies the two nontrivial resolutions — `@factory/config/node`
  subpath and TS-source workspace links — with a deliberate violation fixture before
  trusting green).

### D.2 Layering decision (declared)

`packages/core` imports `@factory/auth` (session resolution), `@factory/db` (rate-limit
table), `@factory/config` (env/capabilities). Nothing imports core yet except `apps/web`.
Rationale: the kernel glues auth + validation + limiting; dependency injection here would
be ceremony against KISS. `@factory/auth` must NOT import core (no cycle). Boundary rules
encode this DAG: config ← db ← auth ← core ← web.

### D.3 `packages/db` additions (orchestrator pre-work, like C.2)

- `src/schema/rate-limit.ts`: table `rate_limits` — `key` text (caller-composed:
  `${name}:${subject}`), `window_start` timestamptz, `count` integer not null default 1,
  PRIMARY KEY (`key`, `window_start`). Exported from `schema/index.ts`.
- Migration `0001_*` generated via drizzle-kit, checked in.
- No API changes to `getDb()`.

### D.4 `packages/core` — file manifest and contracts (owner: core agent)

```
packages/core/
├── package.json          # "@factory/core"; exports ".": src/index.ts; deps: @factory/{auth,db,config}, zod, server-only
├── tsconfig.json / vitest.config.ts
├── src/
│   ├── errors.ts         # ApiError(status, code, message?, details?) extends Error; toResponse() shaping;
│   │                     #   shapeError(err): Response — zod → 400 invalid_input (issue list, no stack);
│   │                     #   ApiError → its status/code; unknown → 500 internal_error, logged server-side,
│   │                     #   generic body (never leaks message/stack)
│   ├── rate-limit.ts     # checkRateLimit(opts: { name: string; subject: string; windowSeconds: number;
│   │                     #   max: number }): Promise<{ allowed: boolean; remaining: number;
│   │                     #   retryAfterSeconds: number }> — Postgres fixed-window via atomic upsert
│   │                     #   (insert … onConflictDoUpdate count = count + 1 RETURNING); window start
│   │                     #   computed APP-SIDE from epoch math (floor(Date.now()/windowMs)*windowMs —
│   │                     #   multi-replica skew only blurs window edges, acceptable per §8.5); pruning
│   │                     #   (delete expired windows, probabilistic ~1% of calls + always on window roll);
│   │                     #   FAIL-CLOSED for 'public' handlers / FAIL-OPEN? → decision: fail-open with a
│   │                     #   server-side error log (a broken DB already breaks the handler body anyway;
│   │                     #   documented in the module comment)
│   ├── define-handler.ts # THE wrapper (contract below)
│   ├── define-action.ts  # server-action wrapper (contract below)
│   ├── safe-fetch.ts     # safeFetch(url, init?) — scheme allowlist http/https; resolves ALL A/AAAA
│   │                     #   records and rejects private/loopback/link-local/metadata/ULA ranges;
│   │                     #   connects only to validated IPs (mechanism per D.1 research);
│   │                     #   redirect: manual loop (max 5) re-validating every hop; response size cap
│   │                     #   (default 5 MB) enforced while streaming; overall timeout (default 15s)
│   │                     #   via AbortSignal; typed SafeFetchError with reason codes
│   ├── untrusted.ts      # Untrusted<T> branded type + untrusted(value) + isUntrusted();
│   │                     #   minimal in M3 — the LLM gateway (M5) consumes the brand
│   └── index.ts          # import "server-only"; re-exports everything
└── test/
    ├── define-handler.test.ts   # auth modes (mock @factory/auth via vi.mock), input validation paths,
    │                            #   rate-limit wiring (mock), error shaping incl. unknown-error opacity
    ├── define-action.test.ts    # same matrix for actions; result envelope; never-throws contract
    ├── errors.test.ts
    ├── untrusted.test.ts
    ├── safe-fetch.test.ts       # against a local http server: allowed fetch, size cap, timeout,
    │                            #   redirect-to-private blocked, literal-IP private blocked, scheme denied
    └── integration/rate-limit.test.ts  # TEST_DATABASE_URL skip-clean; window rolls, max enforced,
                                        #   concurrent increments atomic (Promise.all)
```

**`defineHandler` contract (the headline API):**

```ts
type RateLimitPolicy = { windowSeconds: number; max: number };

// Options is a UNION on auth mode: public handlers MUST state a rate-limit decision.
type HandlerOptions<S extends z.ZodTypeAny | "none"> =
  | {
      auth: "required";
      input: S;
      rateLimit?: RateLimitPolicy | "none";
      handler: (ctx: HandlerCtx<S, Session>) => Promise<Response | unknown>;
    }
  | {
      auth: "public";
      input: S;
      rateLimit: RateLimitPolicy | "none"; // ← required key
      handler: (ctx: HandlerCtx<S, null>) => Promise<Response | unknown>;
    };

interface HandlerCtx<S, Sess> {
  req: NextRequest;
  session: Sess extends null ? Session | null : Session; // 'required' → non-null Session
  input: S extends z.ZodTypeAny ? z.infer<S> : undefined;
  params: Record<string, string | string[]>; // awaited Next 15 params
}

export function defineHandler<S extends z.ZodTypeAny | "none">(
  opts: HandlerOptions<S>,
): (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string | string[]>> },
) => Promise<Response>;
```

Runtime order inside the wrapper: (1) resolve the session ONCE via `getSession()` —
fast path: no session cookie present → skip the DB entirely, session = null; (2) rate
limit — subject `user:{id}` when a session exists, else `ip:{clientIp}` via the pinned
`getClientIp(req)` helper (first `x-forwarded-for` entry; trustworthy on Vercel/behind a
proxy, spoofable bare — spec §8.5 caveat applies: this is abuse mitigation, not DDoS
defense; header-less traffic shares one `ip:unknown` bucket, consciously); honest caveat:
cookie-bearing floods still cost one session lookup per request; (3) auth decision
(`'required'` + null session → 401 JSON); (4) origin check for POST/PUT/PATCH/DELETE:
when an `Origin` header is present it must match `APP_URL` when set, else the `Host`
header (absent Origin — curl, webhooks — passes; `Sec-Fetch-Site: cross-site` is
additionally rejected when present); (5) input parse — GET/HEAD from `URL.searchParams`
entries, other methods from JSON body; the WRAPPER'S OWN zod parse failure → 400 (parsed
at the call site — a ZodError escaping the user's handler body is a bug and stays a 500);
(6) handler; `instanceof Response` returns pass through, anything else is
`Response.json`-wrapped. 429 responses carry `Retry-After`.

**`defineAction` contract:**

```ts
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; issues?: EnvIssueLike[] } };

defineAction<S extends z.ZodTypeAny | "none", T>(opts:
  | { auth: "required"; input: S; rateLimit?: RateLimitPolicy | "none";
      action: (ctx: { session: Session; input: ... }) => Promise<T> }
  | { auth: "public";  input: S; rateLimit: RateLimitPolicy | "none";
      action: (ctx: { session: Session | null; input: ... }) => Promise<T> }
): (rawInput: unknown) => Promise<ActionResult<T>>;
```

Actions NEVER throw to the caller — every failure is a typed `{ ok: false }` envelope
(Next masks server errors in prod; a typed envelope is the only honest client contract).
No server actions exist yet; the demo (M6) is the first consumer.

### D.5 Lint ban + boundary rules (owner: guard agent)

- **Raw-handler ban** in root `eslint.config.mjs` (inline plugin or no-restricted-syntax
  per D.1): in `apps/*/app/**/route.ts`, exported HTTP-method bindings are legal ONLY as
  `export const GET = defineHandler(...)` (CallExpression initializer) or the documented
  framework-mount destructuring `export const { GET, POST } = toNextJsHandler(auth)`
  (allowlisted file: `app/api/auth/[...all]/route.ts` with an explanatory comment).
  `export async function GET/...` and arrow/function-expression initializers are errors.
  In `"use server"` files: every export must be a `defineAction(...)` call result.
- **Boundary rules** (tool per D.1 research): encode the D.2 DAG plus — `better-auth`
  imports only in `packages/auth`; `pg`/`drizzle-orm` only in `packages/db`;
  `@factory/config/node` importable only by package scripts + `packages/db`; no package
  imports from `apps/*`. Wired as `pnpm boundaries`, added to `pnpm check` between lint
  and typecheck.
- **process.env ban**: ESLint `no-restricted-properties`/`no-process-env`-style rule
  everywhere EXCEPT `packages/config/src`, `packages/config/scripts`, `**/test/**`,
  `*.config.*` — the M2 documented exceptions become machine-enforced.

### D.6 App integration (owner: guard agent)

- `apps/web/app/api/health/route.ts` → `defineHandler({ auth: "public", input: "none",
rateLimit: "none" })` (liveness must never be limited), body unchanged.
- `apps/web/middleware.ts`: optimistic layer ONLY (spec §8.5 — cf. CVE-2025-29927):
  public allowlist (`/`, `/login`, `/signup`, `/api/auth/*`, `/api/health`, static
  assets); everything else redirects to `/login` when the Better Auth session cookie is
  absent (cookie-presence check per D.1 — no DB call in middleware). A comment states the
  real boundary is the wrapper.
- Security headers (location per D.1 research): X-Content-Type-Options nosniff,
  X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin,
  Permissions-Policy minimal, HSTS (prod only). CSP deliberately deferred with a
  documented follow-up.
- Dashboard/login/signup pages keep working — middleware must not break the verified M2
  flows (the C.9 curl matrix is re-run as the M3 regression check).

### D.7 CI security gates (owner: guard agent)

- New `security` job: gitleaks (full-history scan), `pnpm audit` (fail on high+),
  semgrep OWASP ruleset (versions/actions per D.1). Keep runtimes reasonable (semgrep on
  changed files for PRs is acceptable if the action supports it; full scan on main).
- New `guarded-zones` job (PR only): detect changes vs base touching
  `packages/auth|billing|core`, `apps/web/middleware.ts`, `packages/db/migrations`;
  if touched, require the PR body to contain the completed security-checklist marker
  (`- [x] security-checklist`) — fail with a helpful message otherwise.
- `.github/PULL_REQUEST_TEMPLATE.md` with the checklist (auth decision reviewed, input
  validated, no secrets logged, migrations reversible-or-safe, rate limits considered).
- `pnpm check` gains the boundaries step; CI `quality` job inherits it via `pnpm check`?
  — NO: CI runs discrete steps; add `pnpm boundaries` as its own step after lint.

### D.8 Definition of done (M3)

A raw `export async function GET` in a route file fails `pnpm lint` (proven by a fixture
test or a temporary file during verification, not committed); boundary violations fail
`pnpm boundaries` (same proof); `pnpm check` green; rate-limit integration test green
against live Postgres; safeFetch test suite green incl. private-IP and redirect cases;
the M2 curl matrix (signup/session/dashboard/health) re-verified with middleware + new
headers active; 429 path manually exercised on a rate-limited test route (temporary,
not committed) or via the integration suite; CI file review; one Conventional Commit,
approval-gated.

### D.9 Critique corrections (BINDING — supersede any conflicting text in D.0–D.8)

Implementers MUST read this section; where it conflicts with earlier Part D text, D.9 wins.

1. **Rate-limit clock**: app-side epoch math everywhere
   (`new Date(Math.floor(Date.now() / windowMs) * windowMs)`); never DB `now()`.
2. **Wrapper order**: session-first (already rewritten in D.4). Cookie-less requests skip
   the session DB lookup.
3. **Raw-handler lint rule — exact semantics** (kills the `export { h as GET }` bypass):
   in `apps/*/app/**/route.ts`: (a) `export * from` is FORBIDDEN entirely; (b) any export
   specifier (`export { x as GET }`, re-exports included) whose exported name is an HTTP
   method (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS) is FORBIDDEN; (c) `export
async function GET…` and `export const GET = <non-CallExpression>` are FORBIDDEN;
   (d) `export const GET = defineHandler({...})` is legal ONLY when the callee is exactly
   the identifier `defineHandler` (aliasing `const dh = defineHandler` errors — acceptable
   false positive, canonical form is the point); (e) the single allowlisted file
   `app/api/auth/[...all]/route.ts` may use exactly
   `export const { GET, POST } = toNextJsHandler(auth)` (callee identifier
   `toNextJsHandler`). In `"use server"` files: every exported value must be a
   `defineAction(...)` call by the same callee-identifier rule.
4. **safeFetch deny-list — complete enumeration** (table-driven test over EVERY entry,
   including `::ffff:` IPv4-mapped forms, which `socket.remoteAddress` reports on
   dual-stack sockets — unmap before checking): loopback 127.0.0.0/8 and ::1/128;
   RFC1918 10/8, 172.16/12, 192.168/16; link-local 169.254/16 (metadata
   169.254.169.254 included) and fe80::/10; CGNAT 100.64/10; 192.0.0.0/24;
   benchmarking 198.18.0.0/15; multicast 224.0.0.0/4 and ff00::/8; broadcast
   255.255.255.255/32; unspecified 0.0.0.0/8 and ::/128; ULA fc00::/7; documentation
   ranges 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24.
5. **`packages/core` package.json contract**: deps `@factory/auth` `@factory/config`
   `@factory/db` (workspace:*), `undici ^8`, `zod ^4`, `server-only`; peerDeps
   `next ^15`; devDeps `next ^15.5.23`, `@types/node ^22`, `typescript ~6.0.3`,
   `vitest ^4`, `tsx`.
6. **Security-gate pre-verification (before the CI wiring is committed)**: run gitleaks
   LOCALLY over the full history; commit a `.gitleaks.toml` path-allowlisting
   `.env.example`, `docs/**` (research docs + plan contain deliberate example
   keys/connection strings). Run `pnpm audit --prod --audit-level high` locally; resolve
   or record any current failure BEFORE the gate lands. CI must use the same config.
7. **Type-level proof**: a compile-time type-test file in packages/core (vitest
   `expectTypeOf` and/or `// @ts-expect-error` fixtures) proving: public handler without
   `rateLimit` fails to compile; `auth:'required'` → non-nullable `ctx.session`;
   `input` schema infers `ctx.input`; `input:'none'` → `ctx.input: undefined`. If the
   single-signature union degrades inference, falling back to TWO OVERLOADS is
   pre-approved — the proofs stay the same.
8. Handler return type: `Promise<unknown>` with the doc comment + runtime
   `instanceof Response` check (the `Response | unknown` union is decorative — don't
   write it).
9. `params` type: `Record<string, string | string[] | undefined>` (optional catch-alls).
10. `getClientIp(req)` is a pinned exported helper of packages/core (D.4 order rules) —
    one implementation, used by the wrapper; documented spoofability caveat.
11. Origin comparison source: `APP_URL` when set, else `Host` header; reject
    `Sec-Fetch-Site: cross-site` when the header is present. Absent both → pass.
12. Wrapper-input ZodErrors → 400 at the parse site only; ZodError from inside the
    user handler stays 500 (see rewritten D.4 order).
13. **defineAction input**: `rawInput instanceof FormData` is converted via
    `Object.fromEntries(rawInput.entries())` before the zod parse; documented.
14. **Middleware pins**: matcher `"/((?!_next/static|_next/image|favicon.ico).*)"`;
    in-code allowlist exact-match `/`, `/login`, `/signup`, `/api/health` + prefix-match
    `/api/auth/`; `getSessionCookie` verified for BOTH cookie names — dev
    (`better-auth.session_token`) and prod-https (`__Secure-` prefix): cite the prefix
    logic from better-auth source in a comment AND verify via one HTTPS-simulated check
    (e.g. `x-forwarded-proto: https` request against prod server) or better-auth source
    reading during verification.
15. Guarded-zones job: read the PR body via env var (injection-safe), tolerate null body.
16. Boundary fixtures: ONE deliberate-violation fixture PER rule class (vendor-SDK leak,
    `@factory/config/node` from app code, DAG-edge violation) — each must fail
    `pnpm boundaries` before the rule is trusted; fixtures are temporary during
    verification, not committed.
17. **`webhook` option**: OMITTED from the M3 types entirely (optional never-used keys
    weaken excess-property checks that correction 7 relies on). M7 adds it.

### D.10 Accepted deviations & post-review fixes (discovered during implementation)

- **`drizzle-orm` added to `packages/core` deps** — the atomic rate-limit upsert needs
  `sql`/operators; raw-string SQL would inject the attacker-influenced subject. Boundary
  rule confines the bare entry to `packages/(db|core)` + test dirs; the driver subpath
  stays db-only (D.9.5 amended).
- **`pg`/`@types/pg` in `packages/core` devDeps** — the integration test builds its own
  disposable Pool; boundary rules exempt `packages/*/test/**` for `pg` and the drizzle
  driver subpath.
- **Supply-chain hardening in `pnpm-workspace.yaml`** (semgrep OWASP findings):
  `minimumReleaseAge: 1440`, `blockExoticSubdeps: true`, `trustPolicy: no-downgrade` with
  a scoped `trustPolicyExclude: [undici-types]` (its old @types/node-pinned releases
  predate provenance); `overrides` pin `sharp>=0.35.0` / `postcss>=8.5.18` to clear three
  transitive high-severity advisories reaching us through `next` (drop when next ships
  patched ranges). CI action refs SHA-pinned; gitleaks/semgrep images version-pinned.
- **Security review (3 BLOCKING, all fixed + re-verified)**: (B1) rate-limit pruning
  deleted other buckets' current windows — now prunes against a fixed 24h floor, not the
  caller's window; (B2) rate-limit bucket keyed on concrete pathname → dynamic-route
  bypass + unbounded row cardinality — now keyed on the derived route PATTERN
  (`deriveRouteName` replaces param values with `:key`); (B3) five raw-handler lint
  bypasses (array/object destructure binding, `let`/`var` reassignment, `route.js`,
  `src/app` layout) — all closed and re-proven by fixture. Plus 6 minors (redirect
  credential stripping + 303/302 method handling in `safeFetch`, bare-drizzle boundary
  tightening, three-dot guarded-zones diff, image pins, stale comments, middleware
  protocol-relative `next=` guard).
