# Deploy to Vercel

Vercel and Docker (`docs/guides/deploy-docker.md`) are both first-class — same app code,
different config. This guide covers the Vercel path.

## 1. Import the repo

In Vercel, "Add New… → Project" and import your GitHub repo. Set:

- **Root Directory**: the app under `apps/` (`apps/untangle` here; `apps/web` in a
  scaffolded repo). This is a pnpm workspace (`pnpm-workspace.yaml` + `pnpm-lock.yaml`
  at the repo root) — Vercel detects that and installs from the workspace root even
  with Root Directory set to that app directory, then runs the build inside it.
  Framework Preset auto-detects as Next.js; leave the Build/Install commands on their
  defaults unless you've changed the workspace layout. (The npx installer renames
  every installed product's app directory to `apps/web` uniformly, so this same Root
  Directory setting applies to a scaffolded repo too.)
- `next.config.ts` sets `output: "standalone"` for the Docker path (see
  `deploy-docker.md`) — Vercel's own build pipeline does its own output tracing and
  ignores the standalone folder. It's harmless on Vercel, just unused there.

## 2. Required environment variables

Set these in **Project Settings → Environment Variables**, for both the Production and
Preview environments:

- `DATABASE_URL` — a reachable Postgres connection string.
- `BETTER_AUTH_SECRET` — `openssl rand -hex 32`.

Both are read at module scope during `next build`'s page-data collection (the Better Auth
instance, `packages/auth/src/auth.ts`), so a missing or malformed value fails the build
outright — not a runtime-only requirement.

Everything past those two is optional and lights up progressively; the full list with
descriptions is `packages/config/src/registry.ts` (or run `pnpm factory:doctor` locally
against your prod-shaped env). Commonly set for a real deployment:

- `APP_URL` — set this explicitly to your Vercel domain (custom domain or the
  `*.vercel.app` one). It defaults to `http://localhost:3000` when unset, which is wrong
  for billing redirects and the auth origin check on anything but localhost. Vercel's own
  `VERCEL_URL`/`VERCEL_PROJECT_PRODUCTION_URL` are not read by this app — `APP_URL` is
  the only var that matters here.
- Billing (`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`), LLM (`OPENROUTER_API_KEY` is
  the recommended production profile — `LLM_LOCAL_BASE_URL`/Ollama has no serverless
  equivalent), email (`RESEND_API_KEY` + `EMAIL_FROM`), analytics (`POSTHOG_KEY`),
  errors (`SENTRY_DSN`) — each as needed.

## 3. Migrations

**There is no automated migration step on Vercel.** The predev hook
(`pnpm db:migrate --predev`, chained into `pnpm dev`) only runs for local development;
`next build`/`next start` never run migrations, and per this repo's conventions
migrations never run from the app's own entrypoint. Docker's equivalent is a dedicated
one-shot `migrate` image (see `deploy-docker.md`) — there's no Vercel counterpart to it
yet.

Run migrations yourself before (or as part of) each deploy that adds one:

```bash
DATABASE_URL=<your production connection string> pnpm db:migrate
```

Run it from CI, a Vercel deploy hook chained to your own migration step, or by hand — the
template doesn't wire this up for you. Don't skip it: a deploy that ships a new migration
without running it first will 500 on any query touching the new schema.

## 4. Jobs and cron

Inngest's self-hosted server (the Docker `jobs` compose profile) needs a long-running
process — there's no serverless equivalent. On Vercel, use **Inngest Cloud** instead:

1. Create an app in the Inngest dashboard, pointed at
   `https://<your-domain>/api/inngest`.
2. Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` (from that dashboard) as Vercel
   environment variables.

Without both keys (or `INNGEST_DEV`, which is development-only and ignored in
production), the `jobs` capability stays disabled and cron-driven checks don't run — the
manual "check now" action in the dashboard still works regardless.

## 5. Verify

After the first deploy: `curl https://<your-domain>/api/health` should return
`{"status":"ok"}`, and the capability panel on the running app should show exactly the
services you configured as enabled — everything else disabled, not broken.
