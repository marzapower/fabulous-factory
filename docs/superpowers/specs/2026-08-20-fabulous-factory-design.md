# Fabulous Factory — Design Specification

**Date:** 2026-08-20
**Status:** Approved design, pre-implementation. Passed two adversarial review rounds (2026-08-20): (1) fork critique — 17 findings folded in; (2) independent cold-read + market review — 1 blocker, 9 majors, and a scope/audience retarget, all folded in. This revision supersedes the pre-retarget text.
**Language policy:** All repository content (code, comments, docs, commits) is English-only.

## 1. Purpose

Fabulous Factory is a **public GitHub template repository** for shipping micro-SaaS products in days instead of months. Its user is a **product-focused solo developer working with an AI agent team**: the human spends their time designing the product; the agents build it; the repository enforces the rules and removes the infrastructure hassles. A builder clicks "Use this template", gets a working product skeleton that boots with **nothing but Next.js and Postgres**, and progressively lights up services (billing, email, AI, analytics, background jobs) by adding environment variables.

It is a generally-available open-source project (MIT license), not tailored to any single founder's situation. It synthesizes the two research reports in `docs/`:

- a shared "factory" beats per-product rewrites: auth, billing, jobs, email, analytics, LLM gateway, and CI are built once and reused;
- the LLM is primarily a **development multiplier** and a routed, cost-capped runtime dependency — never a hard requirement;
- the repository itself is a distribution channel (template + docs + example).

### Differentiators vs existing boilerplates

1. **Agent guardrails, structurally enforced.** Not prose in an AGENTS.md — mandatory `defineHandler()`/`defineAction()` wrappers that make auth and input validation required arguments, boundary lint that makes vendor-SDK leakage impossible, guarded zones, and convention-encoding SAST. An agent (or a tired human) _cannot_ merge a route without an auth decision. This is the headline feature and ships first in the build order.
2. **Zero-config boot, proven by CI.** No service signup wall before first `pnpm dev`. Next.js + Postgres are the only hard requirements, and CI boots the minimal profile on every PR to keep the promise honest.
3. **Graceful degradation as a contract.** Every external service is optional, resolved from the environment **at request time on the server** (never baked in at build time — see §5.1), and replaced by a well-defined fallback when absent.
4. **Provider-agnostic seams** exactly where lock-in hurts: billing (`BillingProvider` interface; Stripe adapter in v1, seam proven by the `disabled` adapter) and LLM (any provider via Vercel AI SDK profiles, including local models).

### Non-goals of the design (honesty clauses)

- The template is a **snapshot, not a subscription**: an adopted copy is a fork by design; the template's value must be delivered on day one, not through an update stream (§11, §13).
- The template does not court the no-code audience. Its floor is "can run `pnpm dev` or click _Open in Codespaces_" — a developer, assisted heavily by agents (§8).

## 2. Core principle: graceful degradation

> **Next.js + Postgres are the ONLY hard requirements. Everything else is opt-in, never a blocker.**

Rules every package must obey:

- Each integration package exports the **same interface** whether the real adapter or the fallback is active.
- **No vendor SDK code executes when its service is disabled** (guarded dynamic imports; misconfiguration of service A can never crash feature B).
- **Capabilities are a runtime, server-side fact** (§5.1). The UI adapts at request time: features backed by a disabled service are hidden or shown with an "enable this" note; billing disabled means the app runs in free mode with all features unlocked.
- `pnpm doctor` prints the capability map: which services are enabled, which adapter is active, and exactly which env vars would enable each disabled service.
- CI proves the contract by running the test suite in two profiles: **minimal** (only `DATABASE_URL`) and **full** (all services mocked). Locally, `pnpm check` is green on a zero-config machine: integration tests **skip cleanly with a visible notice** when no test database is configured; no step silently passes or hard-fails for a missing optional service.

## 3. Frozen stack

| Concern           | Choice                                                                  | Notes                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Framework         | Next.js 15 (App Router)                                                 | RSC-first; no separate worker deploy (jobs run in-app)                                                                           |
| Language          | TypeScript (strict)                                                     |                                                                                                                                  |
| Database          | Postgres                                                                | Neon/Supabase/local Docker all fine                                                                                              |
| ORM               | Drizzle                                                                 | schema + migrations in `packages/db`                                                                                             |
| UI                | Tailwind CSS + shadcn/ui                                                |                                                                                                                                  |
| Package manager   | pnpm workspaces                                                         | internal packages consumed as TS source, no per-package build step, no Turborepo in v1                                           |
| Auth              | Better Auth                                                             | self-hosted in Postgres, no per-MAU cost; its schema lives in our migrations — version pinned, bumps are a migration event (§13) |
| Billing           | `BillingProvider` interface; adapters: **Stripe** + `disabled` fallback | seam is proven by the `disabled` adapter + contract suite; Polar/other MoR adapters are v2 / community (§11)                     |
| Jobs/queue/cron   | Inngest                                                                 | runs inside the Next.js app; local dev via `inngest dev`; self-hosted OSS server supported with documented caveats (§12)         |
| LLM               | Gateway on **Vercel AI SDK**                                            | profiles: `local` (Ollama/MLX/OpenAI-compatible), `openrouter` (prod default), `direct` (Anthropic/OpenAI)                       |
| Email             | Resend + react-email                                                    | `console` transport in dev; `disabled` in prod when unconfigured                                                                 |
| Analytics + flags | PostHog                                                                 | no-op fallback                                                                                                                   |
| Errors            | Sentry                                                                  | no-op fallback                                                                                                                   |
| LLM observability | OpenTelemetry spans from the gateway                                    | consumer-agnostic seam; Langfuse (or any OTel backend) via a docs guide, not a wired dependency (§11)                            |
| Deploy            | Vercel **and** Docker (both first-class)                                | `output: 'standalone'`; nothing Vercel-proprietary in app code                                                                   |
| CI                | GitHub Actions                                                          |                                                                                                                                  |

The stack is **frozen**: the template does not offer framework/DB variants. Adapter seams exist only for billing and LLM.

## 4. Repository layout

```
fabulous-factory/
├── .devcontainer/              # devcontainer + Codespaces config: app + Postgres, zero local toolchain (§8.1)
├── apps/
│   └── web/                    # Next.js 15 app — the golden-path demo product
│       ├── styles/theme.css    # factory design tokens (Adoption Ledger item: design-system)
│       └── app/(legal)/        # placeholder terms + privacy pages (ledger item: legal-pages)
├── packages/
│   ├── config/                 # env validation (zod) + capability map (server-only)  ← keystone
│   ├── core/                   # defineHandler/defineAction wrappers, safeFetch, rate limiter, untrusted()  ← enforcement kernel
│   ├── db/                     # Drizzle schema, client, migrations, seed
│   ├── auth/                   # Better Auth configuration + requireSession helpers
│   ├── billing/                # BillingProvider interface + adapters/{stripe,disabled}
│   ├── llm/                    # gateway, routing, profiles, cost accounting
│   ├── jobs/                   # Inngest client + function definitions
│   ├── email/                  # send() + react-email templates + transports/{resend,console}
│   ├── analytics/              # PostHog wrapper + no-op
│   └── observability/          # Sentry wiring + OTel setup + no-op
├── docs/
│   ├── agents/                 # conventions.md — canonical shared agent rules (single source)
│   ├── templates/              # SPEC.md, PRODUCT.md, ADR templates
│   ├── adr/                    # this template's own ADRs (dogfooding)
│   └── guides/                 # per-service enablement guides, deploy guides, llm-evals guide
├── .github/workflows/          # ci.yml, deploy hooks
├── .factory/
│   ├── config.json             # stage: prototype|production (ledger enforcement level)
│   ├── manifest.json           # Adoption Ledger: factory defaults, hashes, severities, recipes
│   └── handoff/                # dormant adopter set: CLAUDE.md, AGENTS.md, skills/ (promoted by factory:init;
│                               #   its presence == "this is the template / an un-initialized clone")
├── .claude/
│   └── skills/                 # agent skills for the CURRENT mode (factory-dev here) + shared ones
├── .env.example                # every supported env var, commented, grouped by service
├── Dockerfile                  # multi-stage: runtime image + migrate image (§12), non-root, healthcheck
├── docker-compose.yml          # profiles: base (app+postgres+migrate), jobs (inngest), llm (ollama)
├── CLAUDE.md                   # agent instructions (lean, <60 lines)
├── AGENTS.md                   # thin pointer mirror for non-Claude agents (§8.2)
└── README.md
```

## 5. Component design

### 5.1 `packages/config` — capability map (keystone)

**The blocker this section fixes:** `NEXT_PUBLIC_*` values are inlined at _build_ time, but the Docker path builds one image in CI (with no service env) and receives real env at _container runtime_. Any capability signal that travels through `NEXT_PUBLIC_*` — or through statically prerendered HTML — is frozen at build time and breaks the degradation contract. Therefore:

- **The capability map is server-only.** `packages/config` reads `process.env` once server-side, validates with zod, and derives a typed capability map, e.g. `services.billing: 'stripe' | 'disabled'`, `services.llm: 'local' | 'openrouter' | 'direct' | 'disabled'`, `services.email: 'resend' | 'console' | 'disabled'`. The module imports the platform `server-only` poison **and** is covered by a boundary lint rule (§8.4) — belt and suspenders against client bundling.
- **No capability signal ever travels via `NEXT_PUBLIC_*`.** Client components that need capability facts or public config (e.g. the PostHog public key) receive them from a server component through a `ClientConfigProvider` — resolved at request time, so a CI-built Docker image lights up correctly from runtime env.
- **Capability-conditional routes render dynamically.** Any route whose UI depends on the capability map (pricing/checkout, "enable this" notes, the demo dashboard) must not be statically prerendered — the scaffold marks them `force-dynamic` and a repo convention documents the rule. Static rendering stays available for capability-independent pages (marketing, legal).
- Detection is by presence of the relevant env vars; an explicit `X_PROVIDER` var wins when multiple credential sets are present. The `console` email transport is a **dev-only** state: in production, unconfigured email resolves to `disabled` (features off/annotated per §2), never to a transport that silently pretends delivery succeeded.
- Exposes `isEnabled(service)` and per-service typed config objects. Powers `pnpm doctor` (human-readable capability report with enablement hints).

### 5.2 `packages/auth`

- Better Auth on Postgres. Always available (only needs the DB).
- Email/password always on. **Email verification is capability-dependent, and the posture is explicit:** when the email service is enabled, verification is required (secure default); when email is `disabled`, signup completes **without** verification — auth must never deadlock on an optional service. `pnpm doctor` and the production-stage preflight (§8.6) surface "auth is running unverified" as a warning so the trade-off is a visible decision, not an accident.
- **Magic links auto-enable** when email is configured; **Google/GitHub OAuth auto-enable** when their keys are present.
- Session helpers for RSC, route handlers, and server actions; `requireSession()` is consumed by the `defineHandler`/`defineAction` wrappers (§8.4).

### 5.3 `packages/billing`

Deliberately minimal lifecycle interface — "user pays → subscription active → user cancels":

```ts
interface BillingProvider {
  createCheckout(opts: {
    userId: string;
    plan: PlanId;
    successUrl: string;
  }): Promise<{ url: string }>;
  getPortalUrl(userId: string): Promise<{ url: string } | null>;
  handleWebhook(req: Request): Promise<WebhookResult>; // verifies signature, returns normalized events
}
```

- **Plan catalog as single source of truth**: `packages/config/plans.ts` defines each plan (id, name, limits) with a per-adapter provider-reference map (`providerRefs: { stripe: priceId, ... }`). `PlanId` is derived from this catalog; adapters resolve their own provider ref from it. The generic `providerRefs` shape is the slot a second adapter fills without touching the interface.
- Subscription state is cached in a Postgres table, updated only by webhooks; app code reads the cache, never the provider API, on the hot path.
- Adapters in v1: `stripe`, `disabled` (everything free, checkout hidden). The `disabled` adapter passes the same contract suite as `stripe` — that suite, not a second paid adapter, is what proves the seam. A merchant-of-record adapter (Polar/Lemon Squeezy) is explicitly v2 (§11): MoR providers bundle tax, which leaks into an interface that excludes it — that design decision deserves its own cycle.
- Explicitly out of scope for the interface: usage metering, invoicing, tax logic.

### 5.4 `packages/llm`

```ts
generate({ task, quality, schema?, maxCostCents?, promptId? })
// quality: 'cheap' | 'balanced' | 'high'
```

- Built on the Vercel AI SDK (providers, structured output, streaming, retries come from the SDK).
- **Profiles** resolved from env: `local` (any OpenAI-compatible endpoint — Ollama, MLX, LM Studio, vLLM), `openrouter` (production default: one key, all models), `direct` (Anthropic/OpenAI SDK providers).
- **Routing**: `(quality tier, profile) → model id` is pure configuration (env/JSON), never code.
- **Cost**: pricing lives in a plain JSON config file (`packages/llm/pricing.json`) the adopter can update — not code, because prices rot fastest of anything in the stack (§13). Each call computes and persists tokens + cost + latency (+ optional `promptId` tag) to a Postgres table. `maxCostCents` estimates before the call and refuses over-budget requests; **an unknown model degrades gracefully**: no estimate, call allowed, cost row flagged `estimated: false`, doctor warns. Bounded retries only.
- **Telemetry**: emits OpenTelemetry spans; any OTel backend (Langfuse included) can consume them — wiring documented in `docs/guides/llm-observability.md`, not shipped as a dependency.
- Disabled → callers receive a typed `LlmDisabledError`; UI shows "configure a model provider" states.
- Prompt quality assurance is a **guide, not a harness**, in v1: `docs/guides/llm-evals.md` shows how to golden-test a prompt with vitest against the `local` profile. A registry/evals subsystem was cut from v1 as over-engineering for a template whose typical adopter ships one or two prompts (§11).

### 5.5 `packages/jobs`

- Inngest client + functions colocated in the repo, served by a route handler in `apps/web`.
- Conventions: idempotent handlers, explicit retry policies, every function emits success/failure telemetry. Long fan-out work (e.g. the demo's digest) is written as **step functions with per-item steps**, so no single invocation approaches serverless duration limits on the Vercel path.
- Disabled → scheduled features are off and labeled in the UI; the demo exposes a manual "check now" fallback so the core loop remains usable.

### 5.6 `packages/email`

- `send(template, to, props)` with react-email templates.
- Transports: `resend` when configured; `console` (logs the rendered email) **in development only**; in production, unconfigured email means `disabled` — email-dependent features are off and annotated in the UI (§2), and `send()` returns a typed not-delivered result rather than faking success. The auth interaction (verification off when email is disabled) is defined in §5.2.

### 5.7 `packages/analytics` and `packages/observability`

- Thin wrappers: typed `track(event, props)`, feature-flag helper (PostHog); error capture + tracing (Sentry); OTel setup consumed by the LLM gateway.
- All no-op when unconfigured. Client-side analytics bootstraps through the `ClientConfigProvider` (§5.1), never through build-time env.
- Logging convention: never log secrets or raw PII; LLM logs store metadata (tokens, cost, latency), not raw payloads.

## 6. Golden-path demo (mini page monitor)

`apps/web` ships as a small but real product, chosen to exercise every package (the reports' "Change Radar" archetype):

**Flow:** sign up → (subscribe via test-mode checkout) → add a URL to watch → Inngest cron fetches (via `safeFetch()`, §8.5) and hash-diffs it → on real change, LLM (`cheap` tier) writes a semantic summary → digest email + in-app feed.

Cost discipline baked in as example code: **no LLM call when the hash didn't change.**

**Degradation matrix (this is the living documentation of the core principle):**

| Missing service  | Behavior                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| billing          | unlimited free monitors, no checkout UI                                  |
| llm              | raw text diffs, no semantic summaries                                    |
| email            | in-app feed only; auth runs without verification + no magic links (§5.2) |
| jobs             | manual "check now" button instead of cron                                |
| analytics/errors | silent no-op                                                             |

Adopters delete the monitor domain logic and keep the wiring; a `docs/guides/make-it-yours.md` guide lists exactly what to remove/rename. **A live deployment of this demo is part of the distribution plan (§13)** — the degradation story must be seeable, not just readable.

## 7. Factory layer (AI-native development)

- **CLAUDE.md / AGENTS.md** (lean, <60 lines): frozen-stack summary; hard rules — all routes/actions through `defineHandler`/`defineAction`; all LLM calls through `packages/llm`; no vendor SDK imports in business logic; every external call has timeout + bounded retry; never log secrets/PII; graceful-degradation contract; definition of done (`pnpm check` green).
- **docs/templates/**: `SPEC.md` (one JTBD, primary flow, error states, acceptance tests, kill criteria), `PRODUCT.md` (pricing, persona, distribution), ADR template.
- **Commit convention: [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), enforced deterministically** (prose alone is not enforcement):
  1. commitlint + `@commitlint/config-conventional` via a husky `commit-msg` hook — rejects non-conforming messages locally, for humans and agents alike;
  2. CI validates the PR title (covers squash merges and `--no-verify` bypasses);
  3. a rule in CLAUDE.md/AGENTS.md so agents write conforming messages on the first try.
     Future direction: structured messages enable automated changelog + semantic versioning (changesets) later.

## 8. Agent-first operation model

**Premise:** the operator of a cloned template is a **product-focused solo developer plus an AI agent team**. The human's scarce resource is time, and all of it should go into designing the product — not building or maintaining infrastructure. The division of labor: _the human states intent, the agents do the work, the repository enforces the rules_. Both human and agent are fallible; deterministic tooling is the only incorruptible party. The human is technical enough to run `pnpm dev` — the design does not pretend otherwise — but must never _need_ to hand-write infrastructure, security plumbing, or boilerplate.

### 8.1 Zero-hassle bootstrap

The first hour is designed, not assumed:

- **`.devcontainer/` with Codespaces support**: "Open in Codespaces" gives a running app + Postgres with zero local toolchain. Locally, the same devcontainer or `docker compose up` works.
- **`.env.example`** enumerates every supported env var, commented and grouped by service; `pnpm doctor` reads the same registry, so the two can never disagree (both are generated from `packages/config`).
- **`pnpm dev` self-heals**: a predev check runs pending Drizzle migrations against `DATABASE_URL` (opt-out via env for teams that manage migrations explicitly) and offers `pnpm db:seed` for demo data.
- The quickstart is four commands and is tested in CI as the minimal profile: clone → `cp .env.example .env` (set `DATABASE_URL`) → `pnpm i` → `pnpm dev`.

### 8.2 The repo is the agents' memory

Agents retain nothing between sessions. Every decision persists as an artifact: ADRs record _why_, SPEC.md records _what_, and **PRODUCT.md is the human's document** — plain-language product definition ("people pay €9/month to watch 5 pages each") that agents translate into specs. All are pre-structured templates, so no session starts from zero context. **Single-source rule for mirrors:** skill playbooks and `docs/agents/conventions.md` are canonical; `AGENTS.md` is a thin pointer, never a copy — a CI staleness check fails if a mirror diverges.

### 8.3 Repo-shipped agent skills + deterministic scaffolds

`.claude/skills/` ships guided workflows in two mode-specific sets plus a shared set (§8.7): adopter skills (`define-product`, `add-a-feature`, `enable-billing`, `swap-llm-provider`, `brand-it`, `make-it-yours`, `pre-ship-check`) staged in `.factory/handoff/`; factory-dev skills (`add-integration-package`, `update-ledger-hashes`, `write-adr`, `release-template`) at root in the template repo; shared skills (`fabulous-feature`, `add-a-job`) survive the handoff. **`fabulous-feature`** is the binding process for any non-trivial change: contract-based plan → adversarial critique with verdict → parallel implementers on disjoint files → independent review → full gates → approval-gated Conventional Commit. Skills guide; they cannot enforce — enforcement is §8.4. `pnpm gen job|page|handler <name>` stamps boilerplate from templates; agents fill in only domain logic. What is mechanical must never be probabilistic.

### 8.4 Consistency: structural enforcement (the headline feature)

The previous design enforced conventions by _detecting_ violations with custom lint/semgrep rules ("every handler must call `requireSession()`"). Detection across wrappers, higher-order handlers, and re-exports is fragile — false negatives are silent security holes, false positives teach agents to fight the linter. **v1 enforces structurally instead: the safe way is the only way that compiles and lints.**

- **`defineHandler()` / `defineAction()` (in `packages/core`) are the only legal way to declare a route handler or server action.** Their signatures _require_ an auth mode (`'required' | 'public'` — no default) and a zod input schema (or explicit `input: 'none'`); they accept an optional `rateLimit` policy (§8.5). Auth, validation, rate limiting, and error shaping run inside the wrapper — an agent cannot forget them, because there is nowhere to write a raw handler.
- **One dumb, robust lint rule** replaces the fragile clever ones: raw `export async function GET/POST/...` in route files and raw exported functions in `"use server"` files are forbidden. Dumb rules don't have false negatives.
- **Boundary rules in CI** (dependency-cruiser / eslint-boundaries): no vendor SDK import outside its adapter package; no LLM provider calls outside `packages/llm`; no `process.env` reads outside `packages/config`; no `packages/config` (server) imports from client components — backstopped by the `server-only` poison (§5.1). Webhook routes use `defineHandler({ auth: 'public', input: 'none', webhook: adapter })` — signature verification replaces the zod body, covered by contract tests.
- **Contract tests** define "same": every billing adapter, email transport, and no-op fallback passes one shared interface suite.
- **Machine-checkable definition of done**: work is finished when `pnpm check` (lint + boundaries + typecheck + tests) is green. On a machine with no test database, integration tests skip with a visible notice (§2) — green stays honest. The human judges green checks and the running product, never code.

### 8.5 Security model

AI-generated code carries an OWASP-class vulnerability in roughly 45% of cases (see research reports); the human reviewer may not catch what a senior engineer would. Defenses, most deterministic first:

- **Secure-by-default topology (opt-out, not opt-in), enforced at two layers:** middleware provides the first, _optimistic_ layer (route allowlist — public routes are explicit) but is **not the security boundary** (cf. CVE-2025-29927, the middleware-bypass class): the real boundary is `defineHandler`/`defineAction`'s mandatory auth mode (§8.4). Security headers and CSRF protection preconfigured. Drizzle parameterization kills SQL injection by construction.
- **Rate limiting lives in the wrapper, not in middleware** (edge middleware cannot open a TCP connection to Postgres): `defineHandler`'s `rateLimit` option uses a Postgres-backed fixed-window primitive (dedicated table, periodic pruning; no extra infra). Public handlers — exactly the ones that need limiting — declare a policy or an explicit `rateLimit: 'none'`. Documented caveats: under a volumetric attack the limiter itself loads the DB (it protects abuse of expensive endpoints, not L7 DDoS — that's the CDN/proxy's job), and a Redis-backed swap seam exists for scale.
- **Outbound fetch safety (SSRF):** any feature that fetches user-supplied URLs (the demo does, on a cron) must use the shipped `safeFetch()` helper (`packages/core`): scheme allowlist, public-DNS resolution with private/link-local/metadata ranges denied, size/time limits, and re-validation on redirects.
- **Guarded zones:** `packages/auth`, `packages/billing`, `packages/core`, `middleware.ts`, and DB migrations are declared sensitive. CI flags any PR touching them and requires a security checklist; agent instructions mandate a human-confirmation pause plus an independent fresh-context security review before merging changes there.
- **CI security gates:** secret scanning (gitleaks), dependency audit, SAST (semgrep with OWASP rules). Custom convention-rules are deliberately minimal (§8.4 moved enforcement into structure).
- **Prompt-injection hardening in the gateway:** an `untrusted()` content wrapper structurally marks external text (scraped pages, emails, uploads) as data-not-instructions before it reaches any model.

### 8.6 The Adoption Ledger (slim)

The template must be **molded** — the adopter needs to _see_ what still carries the factory's fingerprints (shipped theme, placeholder legal pages, demo logic). v1 keeps this deliberately small: **a manifest, a status command, and a preflight gate.** No ack ceremony, no overlay UI, no normalized hashing — those were cut as over-build (§11).

- `.factory/manifest.json` lists ~9 factory defaults a real product must eventually own: file path(s), **plain content hash of the shipped bytes**, severity, and the skill that addresses it (`design-system` → `apps/web/styles/theme.css` → `brand-it`; plus `product-def`, `app-identity`, `demo-logic`, `legal-pages`, `email-templates`, `template-showcase`, ...).
- **Detection:** current hash == shipped hash → still factory default; differs → touched; missing → removed (also fine). Known, accepted limitation (documented in the manifest itself): a formatter pass or trivial edit flips an item to "touched" — the ledger is a guide for the agent conversation, and the preflight's per-item recipes (not the hash alone) are what gate shipping. Honest and simple beats clever and fragile.
- **Two surfaces:** `pnpm factory:status` (also inside `pnpm doctor`) — agent-readable report: what's default, why it matters, which skill fixes it; `pnpm preflight` — the ship-readiness gate, run by CI and the `pre-ship-check` skill.
- **Two stages** in `.factory/config.json`: `prototype` (everything advisory — mold freely, ship ugly) and `production` (severity items block preflight: identity, legal, demo removal, no test keys, unverified-auth warning acknowledged §5.2).

The loop closes conversationally: the human asks their agent _"what's left to make this mine?"_ → agent runs `factory:status` → follows the linked skill → item turns green. The ledger is the shared to-do list between human, agents, and CI.

### 8.7 Handoff: template repo vs product repo

Two audiences with opposite goals — contributors building the template, adopters customizing away from it — need different agent instructions. v1 keeps the mechanism minimal; the previous mode-field/remote-heuristic machinery was cut (§11):

- **Mode is inferred from one physical fact: the presence of `.factory/handoff/`.** Present → this is the template repo or an un-initialized clone (root CLAUDE.md/skills are the factory-dev set). Absent → a product repo.
- **`pnpm factory:init` — one-shot, one-way, no interactivity:** promote `.factory/handoff/` over the root CLAUDE.md/AGENTS.md/skills, delete factory-dev-only skills and the handoff directory, set `stage: prototype`, print "ask your agent: _what's left to make this mine?_". Product definition and branding are NOT bundled — the ledger sequences them and the agent handles the process from there.
- **Guard (advisory-only, never blocking):** while `.factory/handoff/` exists, `pnpm doctor` and CI print: _"This repo hasn't been initialized as a product. Run `pnpm factory:init` (contributors to the template itself: set `FACTORY_DEV=1` to silence this)."_ Because the guard keys on the handoff directory — not on git remotes — it fires correctly for template-repo clones, forks, and tarball downloads alike, and needs no git at all.
- Shared rules live once in `docs/agents/conventions.md`, referenced by both instruction sets; the deterministic layer (§8.4–8.5, commitlint, degradation contract) sits below both modes and is untouched by the handoff.

**Rejected alternatives:** a single CLAUDE.md with mode-conditional prose (context bloat + probabilistic enforcement, banned everywhere else); a separate private repo for factory tooling (splits the agent memory from the code, hostile to open-source contribution); a declared `mode` field + git-remote heuristic (previous design — more state to keep consistent, worse edge-case behavior than the handoff-presence check).

## 9. CI/CD

`.github/workflows/ci.yml`:

1. commit-message lint (PR title — Conventional Commits)
2. lint + format check + **architecture boundary rules** (§8.4)
3. typecheck
4. unit tests + contract tests
5. integration tests — **runs twice: minimal profile (only `DATABASE_URL`) and full profile (all services mocked)**; the minimal-profile boot test is the enforcement of the core principle. Full-profile mocks are deliberately shallow: webhook payload fixtures come from the adapters' contract suites; Inngest functions are invoked directly (unit-style) rather than through a mocked event round-trip — the expensive full-fidelity mock layer was descoped (§11)
6. security gates: secret scanning + dependency audit + SAST; guarded-zone PRs flagged for the security checklist (§8.5)
7. adoption preflight (stage-aware, §8.6)
8. `docker build` check (the image must always build; note the image bakes **no** service env — capabilities resolve at container runtime, §5.1)
9. preview deploy (Vercel) on PRs — **conditional**: runs only when Vercel secrets are configured; Docker-path adopters keep a green pipeline (graceful degradation applies to CI too)

## 10. Testing strategy

- **Unit**: per package (vitest) — config detection logic, billing webhook normalization, LLM routing/cost math, email rendering, `defineHandler` auth/validation/rate-limit behavior.
- **Integration**: app boot + golden-path smoke against a real Postgres (Docker service in CI), in both profiles. Locally: skip-clean with a visible notice when no test DB is configured (§2).
- **Contract tests**: each billing adapter passes the same interface test suite; `disabled` adapters/no-ops pass it too.
- **Prompt tests**: the demo's summary prompt has a small vitest golden suite following `docs/guides/llm-evals.md` — reference implementation of the guide, not a harness.

## 11. Explicitly out of scope for v1

Multi-tenancy/organizations, admin panel, usage-metered billing, marketing-site builder, Terraform/IaC, a standalone project-creation CLI (`create-fabulous`-style bootstrapper — distinct from the in-repo `pnpm gen` scaffolds of §8.3, which ARE in scope), second stack variant, and **downstream template updates** (propagating core fixes to already-born products — a template copy is a fork by design; revisit later via published packages if demand proves it). ~~i18n~~ — struck: shipped via `@factory/i18n`, locale-prefix routing (`docs/adr/0007-i18n-locale-prefix-routing.md`).

**Cut from v1 by the second review round** (each gets a "future direction" note in docs, and the seam it would fill is named):

- **Polar / MoR billing adapter** — the `disabled` adapter + contract suite prove the seam; `plans.ts` keeps the generic `providerRefs` slot. First community PR candidate.
- **Prompt registry + evals harness (+ LLM-judge grader)** — replaced by `docs/guides/llm-evals.md` + a reference vitest golden suite. A registry with four grader types is AI-product-company infrastructure, not micro-SaaS-template infrastructure.
- **Langfuse as a wired dependency** — the gateway emits OTel spans; a guide shows the wiring.
- **Ledger ack subsystem, dev-overlay badge, normalized hashing, `beta` stage** — the slim ledger (§8.6) delivers the same guidance at a fraction of the surface.
- **Dual-mode config field + git-remote clone heuristic** — replaced by the handoff-presence check (§8.7).
- **Full-fidelity service mocks in CI** (Inngest event round-trip, live-signed webhooks) — replaced by contract-suite fixtures + direct invocation (§9.5).

## 12. Deployment targets

Two first-class, equally supported paths — the adopter picks one, the code is identical:

- **Vercel (managed).** Connect the repo, set env vars, done. Preview deploys on PRs. Inngest runs against Inngest Cloud (free tier). Drizzle migrations run as a build step (documented in the deploy guide). Env changes take effect on redeploy (Vercel builds per-deploy, so request-time capability resolution and build-time env agree by construction).
- **Docker (self-hosted).** `output: 'standalone'` Next.js build in a multi-stage `Dockerfile` (pnpm build → slim non-root runtime, `HEALTHCHECK` on `/api/health`). Known sharp edges are handled in the Dockerfile, not left to the adopter: `outputFileTracingRoot` set for the pnpm workspace; the runtime stage carries only the standalone output.
  **Migrations are a separate one-shot concern, never the app entrypoint** (an entrypoint migration races itself under multi-replica rolling deploys, and `drizzle-kit` doesn't belong in the slim runtime image): the multi-stage build produces a second, dev-dependency-bearing **migrate image**; `docker-compose.yml` runs it as a `migrate` service the app `depends_on` (condition: completed successfully), and `docs/guides/deploy-docker.md` prescribes the same image as a release-phase job (Fly release command, Railway pre-deploy, plain `docker run`) for multi-replica platforms.
  `docker-compose.yml` profiles:
  - base: app + Postgres + migrate — `docker compose up` **is** the minimal-boot quickstart;
  - `jobs`: adds the self-hosted OSS Inngest server, with the signing/event-key wiring between app and server spelled out in the guide. Honest caveat in the guide: the OSS server is younger than the rest of the stack and lags Inngest Cloud on some features; the Cloud free tier is the low-friction default even for Docker-path apps;
  - `llm`: adds Ollama for the `local` LLM profile.
    Runs on any VPS, Fly.io, Railway, Coolify, etc.

**Health endpoint disclosure rule:** the public `/api/health` returns liveness/readiness status only. The full capability map (which providers are configured — recon data for an attacker) is available exclusively via `pnpm doctor` and, if exposed over HTTP at all, behind authentication.

Constraint reinforced: no code path may depend on Vercel-specific APIs; anything platform-specific lives in configuration.

## 13. Distribution & maintenance

The engineering is unobservable without distribution; this section is the template's own PRODUCT.md.

- **Positioning:** "The Next.js starter built for agent-driven development — your agents can't wreck auth, billing, or your database, because the repo won't let them." Lead with structural enforcement (§8.4–8.5) and zero-config boot; the ledger and skills are supporting cast. Primary audience: solo devs building products with Claude Code/Cursor-class agents.
- **README** leads with the motto — _the human states intent, the agents do the work, the repository enforces the rules_ — the degradation matrix, and a 5-minute quickstart (Codespaces button first).
- **Live demo:** the page-monitor demo runs at a public URL (Vercel free tier), linked from the README — including a visible "what's disabled here and why" panel, making graceful degradation demonstrable.
- **Launch plan (v1 release checklist):** Show HN + r/nextjs + X/Bluesky thread anchored on the enforcement story ("I made a starter where the agent _can't_ forget auth"); a short screencast of an agent building a feature end-to-end through `fabulous-feature`; submission to the shadcn/Next.js template galleries.
- **Maintenance stance, stated honestly in the README:** the template is a **snapshot, not a subscription**. Tagged releases; Renovate config shipped (serves adopters _and_ keeps the template itself current); pinned versions for the youngest dependencies (Better Auth — bumps are migration events and get a release note; Inngest OSS server). No promise of eternal freshness — the promise is that what you clone today is coherent, tested, and yours.
- **Future funnel (v2 candidate):** extract the enforcement kernel (`packages/core` wrappers + boundary presets + semgrep rules) as a standalone installable package — independently valuable, and an acquisition channel for the template.
- The repo dogfoods its own factory layer (ADRs, specs, skills) — the repo itself is the demo of the method.

## 14. Build order (input to the implementation plan)

Ordered so the differentiator ships first and the decorative layers ship last:

1. Workspace scaffolding + `packages/config` (server-only capability map + `ClientConfigProvider`, §5.1) + `.env.example` + `pnpm doctor` + commitlint/husky + CI skeleton with the **minimal-profile boot check from day one**
2. `packages/db` + `packages/auth` + minimal app shell — **first milestone: boots with only Postgres** — + `.devcontainer`/Codespaces + predev migrations/seed (§8.1)
3. **Enforcement kernel** (`packages/core`): `defineHandler`/`defineAction` + raw-handler lint ban + boundary rules + security defaults (headers, CSRF, Postgres rate limiter, `safeFetch`, `untrusted()`) + guarded zones + gitleaks/audit/semgrep CI gates — the headline feature, complete before any product surface exists
4. `packages/email`, `packages/analytics`, `packages/observability` (thin, with fallbacks; auth×email verification posture §5.2)
5. `packages/llm` (gateway + profiles + pricing.json cost accounting)
6. `packages/jobs` + demo monitor loop (step functions, `safeFetch` usage)
7. `packages/billing` (interface + `disabled` + Stripe + contract suite + `plans.ts`)
8. Dockerfile (runtime + migrate images) + compose profiles + health endpoint + CI docker-build check (§12)
9. Adoption Ledger (slim: manifest + `factory:status` + `preflight`) + handoff set + `factory:init` + adopter/factory-dev skills + `pnpm gen` scaffolds (§8.6–8.7)
10. Golden-path polish, degradation matrix tests, docs (both deploy guides, llm-evals guide, make-it-yours), README, **live demo deploy**, template publish + launch checklist (§13)
