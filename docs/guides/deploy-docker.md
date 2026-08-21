# Deploy with Docker

`docker-compose.yml` (repo root) is the source of truth for exact service wiring — this
guide walks through it; check that file for anything not covered here.

## Quickstart

```bash
cp .env.example .env
openssl rand -hex 32       # → paste as BETTER_AUTH_SECRET in .env
docker compose up --build
```

`db` → `migrate` → `app` boot in that order (each `depends_on` a healthy/completed
predecessor). Once `app` is healthy: `curl localhost:3000/api/health` returns
`{"status":"ok"}`.

`docker build` itself needs no real secrets — `DATABASE_URL`/`BETTER_AUTH_SECRET` ship as
placeholder build args (`next build` reads them at module scope, so the build fails
without _something_ there) and neither placeholder reaches the final image; `runner` and
`migrate` both start fresh `FROM base`, not from the `builder` stage that saw them.

## The `.env` contract

Compose supplies its own `DATABASE_URL` (pointed at the `db` service) — you don't set
one. `BETTER_AUTH_SECRET` is the one var compose refuses to start without:

```yaml
BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?required — generate with `openssl rand -hex 32` and put it in .env}
```

Missing it fails fast at compose's variable-interpolation step, before any container
starts — not a half-booted app. `.env` at the repo root is loaded automatically by the
`app` service (`env_file`, `required: false`); everything else in `packages/config`'s
`ENV_REGISTRY` (billing, LLM, email, analytics, errors vars) is picked up from there the
same way, and stays optional.

## Image targets

The root `Dockerfile` is multi-stage:

- `docker build .` (or `--target runner`) → the runtime image: standalone Next.js
  server, non-root (`nextjs` user), `wget`-based `HEALTHCHECK` against `/api/health`.
- `docker build --target migrate .` → a one-shot migrator image: non-root (`migrator`
  user), runs `tsx scripts/migrate.ts` and exits. No dev toolchain beyond `tsx`.

## Options

- **Port** — `APP_PORT=8080 docker compose up` maps the app to 8080 instead of 3000.
- **Jobs profile** (self-hosted Inngest) — set `INNGEST_EVENT_KEY` and an
  even-length-hex `INNGEST_SIGNING_KEY` in `.env`, then:

  ```bash
  docker compose --profile jobs up
  ```

  This starts an `inngest` service (`inngest/inngest`) wired to sync against
  `http://app:3000/api/inngest`. `INNGEST_BASE_URL=http://inngest:8288` is already set
  on the `app` service in compose (harmless when the profile is off — it's SDK-read, not
  capability-derived, so it doesn't advertise `jobs` as enabled on its own).

- **LLM profile** (local Ollama) — set `LLM_PROFILE=local` and
  `LLM_LOCAL_BASE_URL=http://ollama:11434/v1` in `.env`, then:

  ```bash
  docker compose --profile llm up
  ```

  That `ollama` hostname only resolves inside the compose network — running `pnpm dev`
  or `pnpm factory:doctor` on the host with the same value would falsely claim `llm:
local` against nothing listening. Host users pointing at a locally-run Ollama should
  use `http://127.0.0.1:11434/v1` instead. The `ollama/ollama` image is **2.78 GB**.
  Healthy doesn't mean a model is pulled — do that once, manually:

  ```bash
  docker compose --profile llm exec ollama ollama pull <model>
  ```

- **Migrating an external Postgres** — the `migrate` service has no `env_file` by
  design (it always targets the compose `db`). To migrate a different Postgres, run the
  migrate image directly instead of going through compose:

  ```bash
  docker build --target migrate -t ff-migrate .
  docker run --rm -e DATABASE_URL=<your connection string> ff-migrate
  ```

## Registry-driven env, end to end

Every var above traces back to one place: `packages/config/src/registry.ts`
(`ENV_REGISTRY`). `.env.example` is generated from it (`pnpm gen:env-example`), and
`pnpm factory:doctor` reports which capabilities are live from the same source — so the
compose file, the generated `.env.example`, and what actually boots can't drift apart.
