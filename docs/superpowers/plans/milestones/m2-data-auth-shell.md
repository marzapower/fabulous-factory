# Part C — Milestone 2 contracts (data + auth + app shell)

> Extracted 2026-08-20 from `2026-08-20-master-plan.md` (single-file plan split per-milestone).
> Part A (milestone map + cross-milestone invariants) stays in the master plan.
> "Critique corrections" subsections are BINDING and supersede earlier text in this file.

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
