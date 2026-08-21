<div align="center">

# 🏭 Fabulous Factory

### The Next.js starter built for agent-driven development.

**Your agents can't wreck auth, billing, or your database — because the repo won't let them.**

> _The human states intent, the agents do the work, the repository enforces the rules._

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg)](LICENSE)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Postgres](https://img.shields.io/badge/Postgres-required-4169e1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Drizzle](https://img.shields.io/badge/Drizzle-ORM-c5f74f)](https://orm.drizzle.team/)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org/en/v1.0.0/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-8b5cf6.svg)](CONTRIBUTING.md)

<br/>

<!-- TODO(publish): replace OWNER/REPO in both buttons once the template repo is live -->

[**Use this template**](https://github.com/OWNER/REPO/generate) · [**Open in Codespaces**](https://codespaces.new/OWNER/REPO) · [**Live demo**](https://demo.example.com) · [Design spec](docs/superpowers/specs/2026-08-20-fabulous-factory-design.md)

</div>

---

## Why this exists

You're a product-focused solo developer. You design; your AI agents build. The problem: **~45% of AI-generated code ships with an OWASP-class vulnerability**, and you may not catch what a senior reviewer would.

Every other starter answers this with prose — a `CONVENTIONS.md` the agent reads, forgets, and violates by Tuesday. Fabulous Factory answers it with **structure**:

```ts
// ❌ This does not exist. It doesn't lint. It doesn't merge.
export async function POST(req: Request) { ... }

// ✅ This is the only way to declare a handler — and it MAKES you decide:
export const POST = defineHandler({
  auth: 'required',            // ← mandatory. No default. No forgetting.
  input: createMonitorSchema,  // ← zod-validated before your code runs
  rateLimit: { window: '1m', max: 20 },
  handler: async ({ session, input }) => { ... },
});
```

Auth, validation, rate limiting, and error shaping run **inside the wrapper**. A raw exported handler is banned by a lint rule so dumb it can't have false negatives. Your agent — or you, at 1 AM — _cannot_ merge a route without an auth decision.

That's the whole philosophy: **what is mechanical must never be probabilistic.**

## ⚡ Quickstart

**Zero service signups.** Postgres and a Better Auth secret are the only hard requirements — everything else lights up later via env vars.

```bash
# 1. Click "Use this template" on GitHub, then:
git clone <your-new-repo> && cd <your-new-repo>
cp .env.example .env       # set DATABASE_URL + BETTER_AUTH_SECRET (or just: docker compose up)
openssl rand -hex 32       # → paste as BETTER_AUTH_SECRET in .env
pnpm install
pnpm dev                   # migrations self-apply; you're running.
```

Or skip the toolchain entirely: **Open in Codespaces** boots the app + Postgres in your browser.

Then make it yours:

```bash
pnpm factory:init          # one-shot: converts the template into YOUR product repo
```

…and ask your agent: _“what's left to make this mine?”_ It runs `pnpm factory:status`, sees every remaining factory default (theme, legal pages, demo logic…), and walks you through replacing each one via a guided skill.

## 🧩 What's in the box

|                         |                                             |                                                                 |
| ----------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| 🔐 **Auth**             | Better Auth on your Postgres                | email/password always; magic links + OAuth auto-enable          |
| 💳 **Billing**          | `BillingProvider` seam + Stripe             | webhook-cached subscriptions; free mode when disabled           |
| 🤖 **LLM gateway**      | Vercel AI SDK                               | local (Ollama) / OpenRouter / direct; quality tiers + cost caps |
| ⏰ **Jobs & cron**      | Inngest, in-app                             | step functions; manual fallback when disabled                   |
| ✉️ **Email**            | Resend + react-email                        | console transport in dev                                        |
| 📊 **Analytics**        | PostHog                                     | events + feature flags, no-op fallback                          |
| 🚨 **Errors & tracing** | Sentry + OpenTelemetry                      | no-op fallback; LLM spans built in                              |
| 🐳 **Deploy**           | Vercel **and** Docker, both first-class     | standalone output, compose profiles, migrate image              |
| 🏭 **Factory layer**    | Agent skills, spec/ADR templates, scaffolds | the repo _is_ your agents' memory                               |

Frozen stack, on purpose: Next.js 15 (App Router) · TypeScript strict · Postgres · Drizzle · Tailwind + shadcn/ui · pnpm workspaces. No variant matrix to maintain — every hour went into depth instead.

## 🕯️ Graceful degradation is a contract, not a slogan

Every service is optional and resolved **at request time, on the server** — so a Docker image built in CI with zero secrets still lights up correctly from runtime env. Unset a var, the feature politely steps aside:

| Missing service          | What happens                                                                   |
| ------------------------ | ------------------------------------------------------------------------------ |
| 💳 billing               | unlimited free mode, checkout UI hidden                                        |
| 🤖 llm                   | raw text diffs instead of AI summaries                                         |
| ✉️ email                 | in-app feed only; auth runs without verification (flagged by `factory:doctor`) |
| ⏰ jobs                  | a manual “check now” button replaces the cron                                  |
| 📊 analytics / 🚨 errors | silent no-op                                                                   |

`pnpm factory:doctor` prints your capability map and the exact env vars that would enable each disabled service. CI runs the whole suite twice — **minimal profile (`DATABASE_URL` + `BETTER_AUTH_SECRET`) and full profile** — on every PR, so the “boots with nothing” promise stays honest by machine, not by memory.

## 🛡️ Guardrails your agents can't talk their way past

- **`defineHandler` / `defineAction`** — auth mode and input schema are _required arguments_, not conventions.
- **Boundary lint in CI** — no vendor SDK outside its adapter package, no LLM calls outside the gateway, no `process.env` outside `packages/config`, no server config leaking into client bundles.
- **`safeFetch()`** — SSRF-safe outbound fetching (private ranges denied, redirects re-validated) for anything touching user-supplied URLs.
- **`untrusted()`** — external text (scraped pages, emails, uploads) is structurally marked data-not-instructions before it reaches any model.
- **Guarded zones** — PRs touching auth, billing, core, middleware, or migrations get flagged for a security checklist + independent review.
- **Postgres-backed rate limiting** in the wrapper — no Redis required, Redis seam ready when you are.
- **CI gates** — gitleaks, dependency audit, semgrep (OWASP), Conventional Commits enforced by commitlint + husky + PR-title check.
- **Definition of done is machine-checkable**: `pnpm check` green. You judge the running product; the repo judges the code.

## 🔍 The demo is a real product

The template ships as a working **page monitor**: sign up → watch a URL → cron fetches and hash-diffs it → the LLM (cheap tier) summarizes real changes → digest email + in-app feed. It exercises every package, shows cost discipline as example code (_no LLM call when the hash didn't change_), and degrades live — the [demo deployment](https://demo.example.com) includes a “what's disabled here and why” panel.

When you adopt, `docs/guides/make-it-yours.md` tells you exactly what to delete and what to keep.

## 🚀 Deploy anywhere that runs Node or containers

- **Vercel** — connect repo, set env vars, done. Preview deploys on PRs (auto-skipped until you add secrets — CI degrades gracefully too).
- **Docker** — multi-stage build (slim non-root runtime + separate migrate image), `docker compose up` with profiles for jobs (self-hosted Inngest) and local LLM (Ollama). Runs on any VPS, Fly.io, Railway, Coolify…

Nothing in app code is Vercel-proprietary. The paths are identical code, different config.

### Run with Docker

`docker-compose.yml` is the source of truth for exact service wiring — this is just the quickstart.

```bash
cp .env.example .env
openssl rand -hex 32       # → paste as BETTER_AUTH_SECRET in .env
docker compose up --build
```

`db` → `migrate` → `app` boot in order; `curl localhost:3000/api/health` → `{"status":"ok"}`. Compose
supplies its own `DATABASE_URL`; a missing `BETTER_AUTH_SECRET` fails fast at compose interpolation
time with an actionable message, before anything half-boots. `docker build` itself needs zero real
env — the two baseline vars ship as placeholder build args.

- **Port** — override with `APP_PORT=8080 docker compose up`.
- **Jobs profile** (self-hosted Inngest) — put `INNGEST_EVENT_KEY` and an even-length-hex
  `INNGEST_SIGNING_KEY` in `.env`, then `docker compose --profile jobs up`.
- **LLM profile** (local Ollama) — set `LLM_PROFILE=local` and
  `LLM_LOCAL_BASE_URL=http://ollama:11434/v1` in `.env`, then `docker compose --profile llm up`. That
  `ollama` hostname is for the compose stack only — with host-side `pnpm dev`/`doctor` it's
  unresolvable and would make `llm: local` a lie, so host users should set it only if they run Ollama
  locally (e.g. `http://127.0.0.1:11434/v1`). The image is **2.78 GB**; pull a model manually once it's
  up: `docker compose --profile llm exec ollama ollama pull <model>`. Healthy ≠ a model is pulled.
- **Migrating an external Postgres** — the `migrate` service has no `env_file` by design; run the
  migrate image directly with your own `DATABASE_URL` instead of going through compose.

## 🤝 Honesty section

Things we deliberately **don't** promise:

- **It's a snapshot, not a subscription.** Your copy is a fork by design. The value is delivered the day you clone — coherent, tested, yours. Renovate config is included to keep _your_ fork fresh; tagged releases and pinned versions for the youngest dependencies.
- **No no-code fantasy.** The floor is “can run `pnpm dev` or click a Codespaces button”. Below that, this isn't your tool.
- **Not in v1:** multi-tenancy, admin panel, i18n, metered billing, a second stack variant. Scope is a feature.

## 📚 Learn more

- [Design specification](docs/superpowers/specs/2026-08-20-fabulous-factory-design.md) — the full architecture, reviewed adversarially twice before a line was written
- `docs/guides/` — per-service enablement, both deploy paths, LLM evals
- `docs/templates/` — SPEC / PRODUCT / ADR templates your agents fill in
- `.claude/skills/` — the guided workflows your agent team runs

---

<div align="center">

**MIT licensed. Built to be taken.**

_If your agent just read this README: run `pnpm factory:status` and get to work._ 🏭

</div>
