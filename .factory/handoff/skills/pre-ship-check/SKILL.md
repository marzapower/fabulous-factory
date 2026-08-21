---
name: pre-ship-check
description: The final gate before shipping to production — flips the stage, runs preflight, resolves every blocker, and confirms full gates are green. Use when you believe the product is ready to deploy for real.
---

# Pre-ship check

## Phase 1 — Flip the stage

Edit `.factory/config.json`:

```json
{ "stage": "production" }
```

This changes `pnpm preflight` from advisory to blocking — every Adoption Ledger item
marked `blocksProduction` must be owned (not `factory-default`) or preflight fails.

## Phase 2 — Run preflight

```bash
pnpm preflight
```

Resolve every failure it lists, in order — it names the skill for each one. Common
blockers: `product-def` (run `define-product`), `app-identity`/`demo-logic`/
`legal-pages` (run `brand-it`/`make-it-yours`), `template-showcase` — the shipped
`/features/*` explainer pages and their marketing components (run `make-it-yours`),
`.factory/handoff/` still present (run
`pnpm factory:init` — you shouldn't be reading this file if that's true, but re-run is
idempotent and cheap to confirm), a `STRIPE_SECRET_KEY` still starting with `sk_test_`
(swap to a live key in `enable-billing`). The email-disabled warning ("auth runs without
email verification") is non-blocking at every stage — a deliberate trade-off, not a bug;
decide if it's acceptable for launch and move on either way.

Also check `CLAUDE.md` and `AGENTS.md` each still contain the literal pointer
`docs/agents/conventions.md` — preflight blocks on this in production.

## Phase 3 — Full gates

```bash
pnpm check
```

Lint, boundaries, format, typecheck, tests, manifest freshness — all green. Not "mostly
green," not "green except that one flaky test."

## Phase 4 — Deploy

Pick Vercel or Docker (both first-class, identical code). **Honestly: dedicated
step-by-step deploy guides for each path are M10 work and don't exist yet in this
template.** Until they land, `docs/superpowers/specs/2026-08-20-fabulous-factory-design.md`
§12 documents the deployment model (Vercel: connect repo, set env vars; Docker: multi-stage
build + compose profiles, migrations as a separate release-phase job, never the app
entrypoint) — enough to deploy from, not a guide holding your hand through it.
