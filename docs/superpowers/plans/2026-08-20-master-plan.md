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
