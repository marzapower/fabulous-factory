# CLAUDE.md — your product repo

This is **your product**, built from the fabulous-factory template. `PRODUCT.md` is your
human partner's document — plain language, no code; agents derive specs from it, never
the other way around. The Adoption Ledger is the shared to-do list: run
`pnpm factory:status` to see what still carries the factory's fingerprints and which
skill addresses each item.

**Stack (frozen):** Next.js 15 (App Router), TypeScript strict, Postgres + Drizzle,
Tailwind + shadcn/ui, pnpm workspaces. Billing (Stripe/disabled) and LLM
(local/openrouter/direct) are the only adapter seams.

## Hard rules

- Every route and server action is declared through `defineHandler`/`defineAction`
  (`@factory/core`) — there is no other legal way to write one; a raw handler fails lint.
- Every LLM call goes through `@factory/llm`. No vendor SDK import (Stripe, Resend,
  Better Auth, Anthropic, OpenAI, …) outside the adapter package that owns it.
- Env vars are read only via the `@factory/config` registry, never `process.env`
  directly, outside `packages/config` itself.
- Graceful degradation is the core contract: the required baseline is `DATABASE_URL` +
  `BETTER_AUTH_SECRET`; every other service is optional and must fail soft, never break
  an unrelated feature.
- Every external call carries an explicit timeout and a bounded retry; use `safeFetch()`
  (`@factory/core`) for anything that fetches a user-supplied URL.
- Never log secrets or PII.

## Definition of done

`pnpm check` green — lint, boundaries, format, typecheck, tests, manifest freshness.
Conventional Commits for every commit message.

Canonical conventions: docs/agents/conventions.md

## Skills

`define-product`, `add-a-feature`, `enable-billing`, `swap-llm-provider`, `brand-it`,
`make-it-yours`, `pre-ship-check` — the adopter set, one per Adoption Ledger item.
`fabulous-feature` and `add-a-job` are shared with the template and always available.
Ask "what's left to make this mine?" and run `pnpm factory:status` to find the next one.

## Agents

`.claude/agents/` — delegate rather than doing everything in one context. `fab-scribe`
(SPECs and product docs), `fab-smith` (server and domain features), `fab-muse` (UI, theme,
email copy), `fab-preflight` (ledger, doctor, preflight, gates — reports, never fixes),
plus `fab-warden` (conventions and quality review), `fab-bastion` (security review), and
`fab-medic` (systematic debugging). They are yours now — edit them as your product's needs
diverge from the factory's defaults.
