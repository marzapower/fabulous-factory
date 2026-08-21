# Part I — M8: Docker + deploy

> Contract file for milestone M8. Binding together with Part A of the master plan
> (`../2026-08-20-master-plan.md`). Research verified empirically on 2026-08-21:
> both images were actually built and booted on the dev machine (Docker 29.4.0 /
> Compose v5.1.2) against a live `postgres:18-alpine` before this plan was written.

## I.1 Scope & exit criteria

In scope (master plan Part A, M8 row):

1. Multi-stage `Dockerfile` at repo root: **runtime** image (standalone Next server)
   and **migrate** image (one-shot migrator).
2. `docker-compose.yml` at repo root: base services (db + migrate + app) started by
   plain `docker compose up`; profile **jobs** (self-hosted Inngest) and profile
   **llm** (Ollama).
3. `.dockerignore` (load-bearing: `.env*` exclusion is a correctness requirement, §I.4).
4. CI: **docker job** (build + boot both images) and the **full-profile job** owed
   since M4 (E.9.7 / F.10.1 debt).
5. **Contract change (user decision, 2026-08-21): `BETTER_AUTH_SECRET` becomes
   REQUIRED, exactly like `DATABASE_URL`.** "Pg + auth is the minimum — both make
   sense together." The graceful-degradation baseline is now **Postgres + auth**;
   every optional service stays optional. Ripples: `packages/config` env validation,
   doctor, `.env.example`, CI `minimal-boot` env (red on main today — verified
   against run 32415746339, commit 4c043eb: Better Auth hard-throws on the default
   secret under `NODE_ENV=production`), compose fail-fast, README.
6. **Hardening fix**: `defineHandler` public-arm session tolerance — the master plan
   M8 row mandates `/api/health` **liveness-only**, so a public route must not 500
   because the auth stack is broken/misconfigured (that is what turned `minimal-boot`
   red). With §I.5 the secret is always present, so this is defense-in-depth, not the
   contract repair.

Exit criteria:

- `docker compose up` from a clean checkout with a `.env` containing
  `BETTER_AUTH_SECRET` (compose provides its own `DATABASE_URL`; missing secret fails
  fast with an actionable message) brings up db → migrate → app;
  `curl localhost:3000/api/health` → `{"status":"ok"}`.
- `docker build` needs **zero real env** — the two baseline vars ship as placeholder
  build ARGs (`DATABASE_URL` per plan C.4, `BETTER_AUTH_SECRET` per I.10.1), builder
  stage only; every optional service needs nothing.
- CI `minimal-boot` green again (now exporting `BETTER_AUTH_SECRET`, per the new
  minimum); new `docker` and `full-profile` jobs green.
- All gates green in both profiles (minimal: `DATABASE_URL` + `BETTER_AUTH_SECRET`;
  full: `TEST_DATABASE_URL` too).

Out of scope: registry publishing/`docker push`, multi-arch images, deploy targets
(Fly/Railway/K8s docs are M10 distribution polish), CSP headers, cron fan-out
chunking (M10).

## I.2 Verified facts and pinned artifacts

All pins verified 2026-08-21 (Docker Hub API, npm registry, `git ls-remote`, live boots).

| Artifact                                                     | Pin                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Base image (build + runtime + migrate)                       | `node:22.23.2-alpine3.23@sha256:46825fbbd4e996a78b7a2cdc08d75e38a5a505bdab95dcda55605359bf124bc6` |
| pnpm (via corepack, verified present & working in the image) | `11.22.0`                                                                                         |
| tsx (global, migrate image only)                             | `4.23.12`                                                                                         |
| postgres (compose)                                           | `postgres:18-alpine`                                                                              |
| inngest (compose, profile jobs)                              | `inngest/inngest:v1.43.0`                                                                         |
| ollama (compose, profile llm)                                | `ollama/ollama:0.32.15`                                                                           |
| docker/setup-buildx-action                                   | `37fe631027851001ddb9b187196cc803df7f5f0e # v4.3.0`                                               |
| docker/build-push-action                                     | `53b7df96c91f9c12dcc8a07bcb9ccacbed38856a # v7.3.0`                                               |
| actions/checkout (bump, Node-20 deprecation)                 | `3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`                                               |
| actions/setup-node (bump)                                    | `820762786026740c76f36085b0efc47a31fe5020 # v7.0.0`                                               |
| pnpm/action-setup (bump)                                     | `008330803749db0355799c700092d9a85fd074e9 # v6.0.9`                                               |

Policy: **digest-pinned** base image in the Dockerfile (mirrors the SHA-pinned-actions
house rule); **tag-pinned** third-party service images in compose (operators are
expected to bump those).

Hard facts the design leans on (each verified by building/booting, not from docs):

- Standalone layout mirrors the workspace root: entry is
  `.next/standalone/apps/web/server.js`; static files go to `./apps/web/.next/static`
  (NOT `./.next/static`); there is **no `apps/web/public`** in this repo — do not COPY it.
- `transpilePackages` compiles workspace TS into `.next/server/chunks`; the
  `packages/*` dirs in standalone contain only `package.json` files.
- `server.js` forces `NODE_ENV=production` and does `process.chdir(__dirname)`; reads
  `PORT` (default 3000) and `HOSTNAME` (default `0.0.0.0`).
- `getEnv()`'s dotenv path is **frozen at build time** to `<builder WORKDIR>/.env`
  (webpack inlines `import.meta.url`). Built at `/app`, the runtime image would read a
  leaked `/app/.env` — hence `.env*` in `.dockerignore` is a correctness rule. Absent
  file degrades cleanly to pure `process.env` (verified by live boot).
- `pnpm fetch`/`--offline` **does not work** here: the supply-chain trust policy check
  runs on every `--frozen-lockfile` install and needs live registry metadata (~30s).
  The recipe below installs once in `deps` and **never re-installs in `builder`**.
- `pnpm deploy` needs `--legacy` (pnpm 11, non-injected workspace) and a fresh target
  dir; `--prod` yields 31.3 MB with all TS-source workspace deps materialized; `tsx`
  must be added separately (Node's native type-stripping fails on extensionless
  relative imports — verified `ERR_MODULE_NOT_FOUND`).
- sharp musl prebuilds (`@img/sharp-linuxmusl-*`) are in the lockfile; **no
  `libc6-compat`** needed on alpine.
- `husky` prepare script exits 0 without `.git` — no `--ignore-scripts` (and build
  scripts must stay on for the `allowBuilds` esbuild/sharp entries).
- Runtime image has busybox `wget`, **no curl** → HEALTHCHECK uses wget.
- Inngest self-host: null entrypoint (`command: ["inngest", "start", ...]` full argv),
  `INNGEST_SQLITE_DIR=/data` + volume `/data`, `GET /health` → 200, no curl/wget in
  image (omit container healthcheck). SDK v4.18.1 honors `INNGEST_BASE_URL` from
  `process.env` in cloud mode; with keys set the app runs **signed cloud mode**
  (dev mode is structurally unreachable under `NODE_ENV=production` — verified 401
  signature enforcement on `/api/inngest`).
- Ollama: `OLLAMA_HOST=0.0.0.0:11434` baked in, data at `/root/.ollama`, OpenAI-compat
  base `http://ollama:11434/v1`, healthcheck idiom `["CMD", "ollama", "list"]`. Image
  is **2.78 GB** — quickstart must say so. Model pull is a documented manual step
  (`docker compose --profile llm exec ollama ollama pull <model>`).
- Postgres 18 image: `PGDATA=/var/lib/postgresql/18/docker`, declared volume
  `/var/lib/postgresql` (the `/var/lib/postgresql/data` habit is PG≤17 and wrong here).
- Measured: runtime image **78 MB**, migrate image **66 MB**; cold deps install ≈70s,
  `next build` ≈25s.

## I.3 Required `BETTER_AUTH_SECRET` + public-arm session tolerance

### I.3.a `BETTER_AUTH_SECRET` required (contract change, Worker C)

- `packages/config` env validation: `BETTER_AUTH_SECRET` becomes required non-empty
  (same tier as `DATABASE_URL`; enforce a sane minimum length, e.g. ≥16 chars, to
  reject placeholder values — implementer confirms against Better Auth's own
  expectations). The capability map is NOT touched: auth is not a `ServiceName`
  (`capabilities.ts:3-10`) and was never presence-derived — the change is registry
  `required` + validation only (I.10.6). `packages/auth` needs no change.
- doctor + `.env.example` (`pnpm gen:env-example`) + affected `packages/config`
  tests updated: the minimum profile everywhere becomes
  `DATABASE_URL` + `BETTER_AUTH_SECRET`.
- Documented generation idiom: `openssl rand -hex 32`.

### I.3.b Public-arm session tolerance (hardening, Worker C)

**Bug** (verified in code and via three independent boots + the real CI log):
`packages/core/src/define-handler.ts:139` runs `await getSession()` unconditionally
for the public and required arms. Better Auth hard-throws on the default secret when
`NODE_ENV=production`; standalone `server.js` always sets production → every public
route, including `/api/health`, 500s. With I.3.a the secret is always configured, but
the master plan mandates `/api/health` liveness-only: public routes must not depend
on the auth stack being healthy.

**Fix contract** (Worker C):

```ts
// step (1) — replaces the bare `const session = await getSession();`
let session: Awaited<ReturnType<typeof getSession>> = null;
try {
  session = await getSession();
} catch (err) {
  // auth: "required" routes fail loudly (500 via shapeError) — a broken auth stack
  // must not silently 401 users who hold valid cookies. Public routes degrade to
  // anonymous. CONTRACT (I.10.10): a public handler may observe `session: null`
  // for a request that carries a VALID cookie whenever the auth stack is failing —
  // `null` is never an authorization decision, only "no usable session here".
  if (opts.auth === "required") throw err;
  warnSessionFailureOnce(err); // console.error, emitted once per process (I.10 opt-6)
}
```

Semantics: public arm → anonymous (`ip:` rate-limit subject AND `session: null`
passed to the handler), required arm → rethrow (shaped 500 by the existing catch).
The webhook arm already short-circuits before step (1) and is untouched. The log is
once-per-process: `/api/health` is `rateLimit: "none"` and the Docker HEALTHCHECK
polls it every 30s — an unthrottled `console.error` would stream stack traces on
exactly the failure mode this fix exists to survive.

Also required (I.10.11):

- `defineAction` HAS a public arm (`define-action.ts:42-47`) and calls `getSession()`
  unconditionally (`:69`) → apply the SAME tolerance there, unconditionally. Its
  required-arm failure shape differs by design: the existing catch (`:105-114`) maps
  a rethrow to `{ ok: false, error: { code: "internal_error" } }` — no HTTP status.
  Every current call site is `auth: "required"` (`apps/web/app/dashboard/actions.ts`),
  so no live action changes behavior.
- Unit tests (mock `getSession` to throw), in BOTH `define-handler.test.ts` and
  `define-action.test.ts`: public → success AND the handler observed
  `session === null` (assert the argument, not just the 200); required → 500 /
  `internal_error` (not 401); webhook arm unaffected (no `getSession` call at all).

## I.4 Dockerfile (repo root, multi-stage)

Stages (single file, `--target` selects the image):

```dockerfile
# base: node:22.23.2-alpine3.23@sha256:46825f... + corepack enable +
#       corepack prepare pnpm@11.22.0 --activate; ENV NEXT_TELEMETRY_DISABLED=1
#       WORKDIR /app
#       I.10.12: wire the store BEFORE any install so the cache mount is real:
#       RUN pnpm config set store-dir /pnpm/store   (or ENV npm_config_store_dir)

# deps: COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
#       COPY apps/web/package.json apps/web/
#       COPY packages/<each of the 10>/package.json packages/<each>/
#       RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# builder: COPY --from=deps /app ./   (root AND per-project node_modules, workspace linked)
#          COPY . .                    (real source overlays)
#          ARG DATABASE_URL=postgres://build:build@127.0.0.1:5432/build   (plan C.4)
#          ARG BETTER_AUTH_SECRET=build-placeholder-secret-not-real   (I.10.1: getEnv()
#              runs at module scope in packages/auth during page-data collection, and
#              the secret is now required — same mechanism that forced the C.4 ARG;
#              ≥16 chars to pass the new min-length rule)
#          ENV DATABASE_URL=${DATABASE_URL} BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
#          RUN pnpm build              (NO second install)

# runner (default/last stage → plain `docker build` yields the runtime image):
#          FROM base; ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
#          addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs
#          COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
#          COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
#          USER nextjs; EXPOSE 3000
#          HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
#            CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
#          CMD ["node", "apps/web/server.js"]

# migrate-deploy: COPY --from=deps /app ./ ; COPY . . ;
#          RUN pnpm deploy --legacy --filter @factory/db --prod /prod/db

# migrate: FROM node:22.23.2-alpine3.23@sha256:46825f...; ENV NODE_ENV=production; WORKDIR /app
#          RUN npm install -g tsx@4.23.12 && npm cache clean --force
#          addgroup/adduser migrator (1001); COPY --from=migrate-deploy --chown=... /prod/db ./
#          USER migrator; CMD ["tsx", "scripts/migrate.ts"]
```

Notes binding for the implementer:

- BOTH placeholder ARGs (`DATABASE_URL`, `BETTER_AUTH_SECRET`) live in **builder
  only**; runtime/migrate stages `FROM` base fresh, so the placeholders never reach
  a shipped image (verified by env inspection for the C.4 one; assert the same for
  the secret during live verify).
- Stage order in the file must leave a sensible default target: put `migrate` before
  `runner` OR document `--target` for both; compose always passes explicit `target:`.
- Do NOT copy `apps/web/public` (doesn't exist) and do NOT use `next start`.

## I.5 `.dockerignore`

```
node_modules
**/node_modules
.next
**/.next
.git
.env
.env.*
!.env.example
coverage
*.tsbuildinfo
Dockerfile*
.dockerignore
```

`.env*` is a **correctness** entry (frozen dotenv path, §I.2), not hygiene. Context
measured at 1.9 MB with this file.

## I.6 `docker-compose.yml` (repo root)

Env strategy — decided, with rationale (corrected per I.10.4): the app service loads
the operator's root `.env` via `env_file: [{path: ./.env, required: false}]` and
compose-controlled keys via explicit `environment:` (which **overrides** env_file).
Why env_file and not per-var interpolation: it forwards the operator's whole env
surface without compose having to enumerate every optional var. The `${VAR:-}`
empty-string outcome is **safe for config-validated vars** — `readMergedEnv`
(`env-file.ts:62`) and `parseEnv` (`env.ts:66`) both drop `""` before zod or
`deriveCapabilities` see it — so `${VAR:-}` fallbacks are a legitimate tool here.
The one place empty strings DO matter is vars a vendor SDK reads straight from
`process.env` (exactly `INNGEST_BASE_URL`). Interpolation from `.env` is still used
where a value must be shared between two services (Inngest keys). `:?` fail-fast is
used ONLY on the always-on `app` service (`BETTER_AUTH_SECRET`): compose interpolates
the whole file at load time regardless of active profiles, so `:?` on a profiled
service would break the minimal quickstart too (found in live verify — see §I.11).

```yaml
services:
  db: # always on
    image: postgres:18-alpine
    environment: { POSTGRES_PASSWORD: postgres }
    volumes: [ff-db-data:/var/lib/postgresql] # PG18 path, NOT .../data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d postgres"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s

  migrate: # always on, one-shot
    build: { context: ., target: migrate }
    restart: "no"
    environment: { DATABASE_URL: postgres://postgres:postgres@db:5432/postgres }
    depends_on: { db: { condition: service_healthy } }

  app: # always on
    build: { context: ., target: runner }
    ports: ["${APP_PORT:-3000}:3000"]
    env_file: [{ path: ./.env, required: false }]
    environment: # overrides env_file
      DATABASE_URL: postgres://postgres:postgres@db:5432/postgres
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?required — generate with `openssl rand -hex 32` and put it in .env}
      # Operator's APP_URL wins (origin check + billing redirects break behind a real
      # domain otherwise — I.10.5); empty interpolation is safe, "" is dropped by
      # readMergedEnv/parseEnv before zod ever sees it (I.10.4).
      APP_URL: ${APP_URL:-http://localhost:${APP_PORT:-3000}}
      INNGEST_BASE_URL: http://inngest:8288 # harmless when jobs profile is off (SDK-read, not capability-derived)
      # NO LLM_LOCAL_BASE_URL here: capabilities.ts derives `llm: local` from its mere
      # presence, which would advertise a non-running Ollama in the default quickstart
      # (I.10.3). Documented in README next to LLM_PROFILE=local instead.
    depends_on:
      db: { condition: service_healthy }
      migrate: { condition: service_completed_successfully }

  inngest: # profile: jobs
    image: inngest/inngest:v1.43.0
    profiles: [jobs]
    command: ["inngest", "start", "-u", "http://app:3000/api/inngest"]
    environment:
      # NOT `:?` — compose interpolates the whole file at load time regardless of
      # active profiles, so a required-var error here would break the MINIMAL
      # quickstart too (verified during live verify, I.12). Empty defaults instead;
      # with the jobs profile on and keys missing, the inngest server refuses to
      # start with its own error, and the README documents the requirement.
      INNGEST_EVENT_KEY: ${INNGEST_EVENT_KEY:-}
      INNGEST_SIGNING_KEY: ${INNGEST_SIGNING_KEY:-}
      INNGEST_SQLITE_DIR: /data
    ports: ["8288:8288"]
    volumes: [ff-inngest-data:/data]
    # service_healthy, not service_started: the -u sync fires at boot and must hit a
    # LISTENING app; the runner image's HEALTHCHECK provides the signal (I.10 opt-2).
    depends_on: { app: { condition: service_healthy } }

  ollama: # profile: llm (image is 2.78 GB — documented)
    image: ollama/ollama:0.32.15
    profiles: [llm]
    volumes: [ff-ollama-data:/root/.ollama]
    healthcheck: { test: ["CMD", "ollama", "list"], interval: 30s, timeout: 5s, retries: 3 }

volumes: { ff-db-data: {}, ff-inngest-data: {}, ff-ollama-data: {} }
```

Operator contract (documented in README §I.8):

- Minimal quickstart: put `BETTER_AUTH_SECRET` (`openssl rand -hex 32`) in `.env`,
  then `docker compose up --build`. A missing secret fails fast at compose
  interpolation time with an actionable message — it never reaches a half-booted app.
- Jobs: put `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` (even-length hex) in `.env`,
  run `docker compose --profile jobs up`. The app picks the same keys up via
  `env_file` → signed cloud mode against the self-hosted server; the server syncs the
  app via `-u`.
- LLM: set `LLM_PROFILE=local` in `.env`, run `--profile llm`, then pull a model
  manually. Without `LLM_PROFILE=local`, an `OPENROUTER_API_KEY` in `.env` would win
  the `deriveLlm` precedence and silently route to OpenRouter — this is the
  documented reason the flag is explicit.
- The devcontainer compose (`.devcontainer/docker-compose.yml`) is dev-tooling; M8
  touches it ONLY to add the now-required `BETTER_AUTH_SECRET` (fixed dev-only
  value, I.10.9). It publishes no ports (3000 is forwarded by `devcontainer.json`).

## I.7 CI (`.github/workflows/ci.yml`)

1. **New job `docker`** (needs: quality, mirrors minimal-boot's role for images):
   - `docker/setup-buildx-action` + two `docker/build-push-action` steps
     (`target: runner`, `target: migrate`), `load: true`, `platforms: linux/amd64`
     only, cache `type=gha` / `type=gha,mode=max` with per-target `scope`.
   - `postgres:18-alpine` **service container** (the pattern quality/minimal-boot
     already use), then: `docker run --network host` the migrate image (assert
     "Running pending migrations... Done."), then the runtime image with
     `DATABASE_URL` + a dummy `BETTER_AUTH_SECRET` (the new minimum), poll
     `http://127.0.0.1:3000/api/health` (build-only was explicitly rejected: the
     boot is what would have caught the I.3 blocker).
2. **New job `full-profile`** (the M4 E.9.7 debt). Two assertions, split because
   "dev-mode boot" is impossible for the standalone server (it forces production):
   - **doctor matrix** (plain tsx, no build): run `pnpm factory:doctor` with
     `NODE_ENV` unset + the new minimum (`DATABASE_URL` + `BETTER_AUTH_SECRET`) +
     dummy keys for every service EXCEPT `RESEND_API_KEY` → grep: all services
     enabled, `email: console`. Then run it again with only the minimum → grep the
     degradation notices. Dummy values must satisfy validation: well-formed
     `SENTRY_DSN` URL, even-length-hex `INNGEST_SIGNING_KEY`.
   - **full boot**: `next build` once, boot standalone with the full dummy set PLUS
     `RESEND_API_KEY`, assert `/api/health` ok and **zero outbound calls needed**
     (all vendor SDKs are lazy — verified empirically in research; the job simply
     has no network expectations).
3. **Action bumps** (Node-20 deprecation warnings in current logs): checkout v7.0.1,
   setup-node v7.0.0, pnpm/action-setup v6.0.9 — SHAs in §I.2. All other pins and the
   injection-safe `PR_BODY` pattern stay as they are.
4. **`security` job is failing on main** (seen in run 32415746339). Not M8 scope:
   diagnose during implementation; fix in this milestone ONLY if it's a trivial
   config/pin matter, otherwise record the diagnosis as a debt in §I.11.
5. `minimal-boot`: add `BETTER_AUTH_SECRET` (dummy hex) to its boot env — it is part
   of the minimum now. Together with I.3.b this turns the job green.

## I.8 Docs + env registry

- `README.md`: a "Run with Docker" quickstart section (minimal, jobs, llm profiles,
  the required `BETTER_AUTH_SECRET` + generation idiom, the Ollama size + model-pull
  step, `APP_PORT` override) AND update any "only DATABASE_URL required" claims to
  the new pg+auth minimum. Keep it terse — the compose file is the source of truth.
- `packages/config`: register `INNGEST_BASE_URL` as **optional** in the env registry
  (today the SDK reads it from `process.env` directly, so it works but is invisible
  to doctor/`.env.example` — a documentation gap, not a behavior change). Regenerate
  `.env.example` (`pnpm gen:env-example`). No `deriveJobs` behavior change.

## I.9 Task split (disjoint files), tests, verification

No new npm dependencies anywhere → **no pnpm install step, no lockfile change**.

| Worker        | Model  | Files (exclusive)                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `m8-docker` | Sonnet | `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `README.md`, `.devcontainer/docker-compose.yml` (one line, I.10.9)                                                                                                                                                                                                                                                                                                       |
| B `m8-ci`     | Sonnet | `.github/workflows/ci.yml`                                                                                                                                                                                                                                                                                                                                                                                                    |
| C `m8-kernel` | Sonnet | `packages/core/src/define-handler.ts`, `packages/core/src/define-action.ts` (I.10.11), `packages/core/test/define-handler.test.ts`, `packages/core/test/define-action.test.ts`, `packages/config/src/*` (env validation + registry; capabilities untouched per I.10.6), `packages/config/scripts/doctor.ts`, `packages/config/scripts/gen-env-example.ts` (I.10.7), `packages/config/test/*` (I.10.8), `.env.example` (regen) |

- A and B consume §I.2 pins verbatim; C consumes the §I.3 contract verbatim.
- Orchestrator: pre-reads (done), gates both profiles after fold-in, **live verify**:
  `docker compose build` + `docker compose up` minimal (health + homepage + migrate
  logs), `docker compose --profile jobs up` with generated keys (server up, app
  `/api/inngest` reachable from server network, sync attempt visible in logs),
  `docker compose config` for all profiles. The **llm profile is verified
  config-only** (no 2.78 GB pull on the dev machine) — declared deviation, §I.11.
- Test env hygiene as always: `env -u OPENROUTER_API_KEY -u ANTHROPIC_API_KEY -u OPENAI_API_KEY`.

## I.10 Critique corrections (binding)

Verdict: **APPROVED WITH CORRECTIONS** (fresh Opus critic, 2026-08-21; re-read the
plan after the required-secret amendment). All 12 mandatory corrections are folded —
the plan body above was amended in place where it was factually wrong; this list is
the authoritative record and OVERRIDES any body text it contradicts.

1. **Builder stage needs a `BETTER_AUTH_SECRET` placeholder ARG** — `packages/auth/src/auth.ts:54`
   runs `getEnv()` at module scope via the auth route import; a now-required var
   without a value kills `next build` page-data collection (the same mechanism behind
   plan C.4). Folded into §I.4; exit criterion in §I.1 restated (two placeholders).
2. **CI: the secret goes in JOB-LEVEL `env:`** in `minimal-boot` (ci.yml:94-95) and
   the new `full-profile` job — `pnpm build` (ci.yml:110) runs before any boot step,
   so a step-level var is too late. Binding on Worker B.
3. **No `LLM_LOCAL_BASE_URL` in `app.environment`** — `capabilities.ts:50` derives
   `llm: local` from mere presence: the default quickstart would advertise a
   non-running Ollama and every changed-hash monitor check would ECONNREFUSED instead
   of taking the typed `LlmDisabledError` path. README documents it next to
   `LLM_PROFILE=local`. Folded into §I.6.
4. **The "empty-string trap" rationale was false** — `env-file.ts:62` and `env.ts:66`
   both drop `""` before zod/`deriveCapabilities`; `${VAR:-}` fallbacks are safe for
   config-validated vars. env_file stays (right call, corrected reason: forwards the
   whole operator env without enumeration); the only empty-string-sensitive vars are
   SDK-read ones (`INNGEST_BASE_URL`). Folded into §I.6.
5. **`APP_URL` must not be stomped** — hard-setting it breaks the origin check
   (`define-handler.ts:284-291` → 403 on every state-changing request behind a real
   domain) and billing redirects (`doctor.ts:223`). Now
   `${APP_URL:-http://localhost:${APP_PORT:-3000}}`. Folded into §I.6.
6. **No `deriveAuth`/capability change exists to make** — auth is not a `ServiceName`
   (`capabilities.ts:3-10`) and was never presence-derived; the change is registry
   `required` + validation only; `packages/auth` untouched. Folded into §I.3.a.
7. **`gen-env-example.ts` joins Worker C's files** — its hard-coded header
   (`gen-env-example.ts:49-51`) says "Only DATABASE_URL is required", and `formatVar`
   (`:39-41`) emits required vars UNCOMMENTED with their example: a working default
   secret would ship in `.env.example` (gitleaks allowlists that file). Required-var
   `example` for the secret must be non-working (empty example + comment with the
   `openssl rand -hex 32` idiom), plus a doctor warning on a literal placeholder
   value (mirror the `/REPLACE/` Stripe check, `doctor.ts:216`).
8. **Four existing tests assert the old "exactly one required var" world** —
   `registry.test.ts:16-19`, `registry.test.ts:97-102` (auth vars "none required"),
   `gen-env-example.test.ts:25-31`, and its "comments out every optional var" case.
   Update the ASSERTIONS (don't delete the tests); add a positive test that
   `BETTER_AUTH_SECRET` is required. Binding on Worker C.
9. **The devcontainer must keep working** — `.devcontainer/docker-compose.yml` sets
   only the DB URLs; with the secret required, `pnpm dev` inside it would throw
   `EnvValidationError` (breaks the M2 Codespaces promise). Worker A ADDS
   `BETTER_AUTH_SECRET` (fixed dev-only value) to `.devcontainer/docker-compose.yml`
   `app.environment` — the file joins Worker A's exclusive list; §I.6's "untouched"
   claim is amended to "touched only for the new required var". (Also: it publishes
   no ports — the old "(port 5433)" parenthetical was wrong.)
10. **Honest public-arm contract** — the session is passed to public handlers
    (`define-handler.ts:47`, `:181`), not only used for rate-limit subjects. The
    binding comment + tests state: `session: null` may occur for a valid-cookie
    request while the auth stack is failing; `null` is never an authorization
    decision. Tests assert the handler OBSERVED `null`. Folded into §I.3.b.
11. **`defineAction` tolerance is required, not "iff"** — public arm exists
    (`define-action.ts:42-47`), `getSession()` unconditional (`:69`); its required-arm
    failure surfaces as `{ ok: false, error: { code: "internal_error" } }`
    (`:105-114`), no HTTP status. `define-action.test.ts` joins Worker C's files.
    Folded into §I.3.b.
12. **Wire the pnpm store to the cache mount** — corepack pnpm defaults its store
    under the user home, so `--mount=target=/pnpm/store` alone caches an empty dir
    and every build re-downloads. `base` sets the store dir explicitly. Folded into
    §I.4.

Adopted optional suggestions (binding where stated):

- **opt-2**: `inngest.depends_on.app = service_healthy` (sync must hit a listening
  app; the HEALTHCHECK provides the signal). Folded into §I.6.
- **opt-3**: ONE shared GHA cache scope for both build targets (per-target scopes
  duplicate base/deps layers and neither imports the other).
- **opt-5**: doctor-step dummies simplified — `SENTRY_DSN` is not URL-validated
  (`env.ts:8`) and `INNGEST_SIGNING_KEY` is only `min(1)` at config level;
  even-length hex matters only for the SDK (full-boot step, compose). CI greps use
  `grep -qF 'billing: stripe'`-style fixed strings, never the ✓/✗ glyphs.
- **opt-6**: the public-arm `console.error` is once-per-process (see §I.3.b).
- **opt-7**: README line ~104 ("CI runs minimal (only DATABASE_URL) and full
  profile") is explicitly in Worker A's update scope — the full-profile job finally
  makes its second half true.
- **opt-1**: `.dockerignore` `.env*` rationale corrected: the runtime image copies
  only standalone output, so the real risk is build-time (a developer `.env` entering
  cached deps/builder layers and `next build`'s env view), not runtime reads.
- **opt-8/9**: README notes — Ollama "healthy" ≠ model pulled (healthcheck passes
  with zero models); `migrate` intentionally has no `env_file` (compose owns the DB;
  external-DB operators run the migrate image directly with their own
  `DATABASE_URL`).
- **opt-4**: record for adopters: whether `pnpm deploy --legacy --prod` re-triggers
  the supply-chain trust check (needs live registry metadata) is verified during
  live verify and documented in the README Docker section if it does.

Rejected: opt-10 (PR security-checklist line — moot, milestones land as direct
commits after approval).

## I.11 Accepted deviations

- llm profile live-verified **config-only** (`docker compose config`) — no 2.78 GB
  Ollama pull on the dev machine; the profile's wiring facts (baked `OLLAMA_HOST`,
  `/v1` endpoint, volume path) were verified by the research agent's live boot.
- `security` CI job failing on main: DIAGNOSED (run 32415746339) — `pnpm audit`
  passes; the failure is semgrep `p/owasp-top-ten` rule
  `pnpm-minimum-release-age`, which requires `minimumReleaseAge ≥ 10080` (7 days)
  vs our 1440. RESOLVED by keeping 1440 and suppressing the rule with an inline,
  justified `nosemgrep` annotation. A first attempt bumped the value to 10080 and
  was reverted the same hour: pnpm's dependency-status check re-evaluates the
  policy against already-locked packages, so a 7-day floor rejects fresh-but-locked
  deps (`@posthog/types@1.405.0`, `@vitest/expect@4.1.11`) and blocks every local
  `pnpm run` script — a template must install cleanly on day one. The 1-day wait is
  the deliberate spec §8.5 posture; CI `--frozen-lockfile` installs were unaffected
  either way (resolution-time rule, verified in the M8 research).
- `.devcontainer/docker-compose.yml` is no longer "untouched": it gains exactly one
  line (`BETTER_AUTH_SECRET`, fixed dev-only value) per I.10.9.
- Inngest keys in compose use `${VAR:-}` empty-defaults, NOT the `:?` fail-fast §I.6
  originally mandated: compose interpolation is global (runs before profile
  filtering), so `:?` on the profiled `inngest` service broke plain
  `docker compose up` — caught during live verify. Verified compensating behavior:
  `inngest start` with empty keys refuses to boot with its own actionable error
  ("Error: signing-key is required"); README documents the requirement.
- The once-per-process session-failure warning flag has no test reset hook; the
  "logs once" assertions are execution-order-dependent within their test files
  (documented in-file). Accepted as a nit — a reset-only export from a guarded-zone
  module wasn't worth the API surface.
- Runtime image measures ~88 MB compressed (research said 78 MB) — lockfile drift
  since the research build; no contract asserts the number.

## I.12 Review outcome

Independent review (fresh Opus agent on the full uncommitted diff, 2026-08-21):
**FINDINGS, no blockers** — every §I.10 correction verified honored, all six
checkpoint areas confirmed correct. 4 MINOR + 6 NIT findings; all fixed except one
accepted nit (once-flag test order dependency, recorded in §I.11):

- MINOR fixes: §I.6/§I.11 record for the inngest `${VAR:-}` deviation (+ empirical
  proof: `inngest start` with empty keys → "Error: signing-key is required");
  `packages/auth` comments updated to the required-secret contract; registry test
  exclusion made name-based (I.10.7 stays a single documented exception); CI docker
  job gained an "Assert placeholders not shipped" step (`docker inspect` on both
  image tags — the §I.4 security property is now machine-guarded).
- NIT fixes: README notes LLM_LOCAL_BASE_URL's compose-only hostname; `openssl rand
-hex 32` idiom added to the primary quickstart; doctor placeholder regex broadened
  (`replace|placeholder|changeme|dummy|not-for-production|not-real`); order-dependency
  comments above the "logs once" test assertions; HEALTHCHECK uses `${PORT}`;
  fabulous-feature SKILL.md minimal-profile wording updated.

Orchestrator live verify (Docker 29.4.0 / Compose v5.1.2, dev machine):

- Minimal quickstart: db healthy → migrate one-shot ("Running pending migrations...
  Done.", exited) → app boot, `/api/health` → `{"status":"ok"}`, homepage 200,
  container `(healthy)` via the wget HEALTHCHECK.
- Shipped-image hygiene: `docker inspect` on both images — no `DATABASE_URL`, no
  `BETTER_AUTH_SECRET` in config env (placeholders stayed in builder).
- Jobs profile: self-hosted Inngest v1.43.0 synced the app end-to-end — GQL apps
  query: `connected: true, functionCount: 3, error: null` (signed cloud mode; the
  joined handshake research had only verified in halves).
- Compose interpolation: plain `up`/`config` works WITHOUT inngest keys (post-fix);
  missing `BETTER_AUTH_SECRET` still fails fast with the actionable message.
- llm profile: config-only per §I.11.

Final gates (after all review fixes, both profiles, LLM keys scrubbed from env):

- minimal (`DATABASE_URL`-less local run, no TEST_DATABASE_URL): lint + boundaries +
  format + typecheck + tests — 424 passed, 17 skipped (integration suites skip with
  visible notices), exit 0.
- full (`TEST_DATABASE_URL` → dockerized Postgres 18): 441/441 passed, exit 0.
- Runtime image rebuilt after the HEALTHCHECK `${PORT}` change; boot re-verified.
