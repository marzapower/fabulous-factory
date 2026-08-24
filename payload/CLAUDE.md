# CLAUDE.md — your product repo

This is **your product**, built with fabulous-factory. `PRODUCT.md` is your
human partner's document — plain language, no code; agents derive specs from it, never
the other way around. `LAUNCH.md` (repo root) is the shared launch checklist — no agent
ships past an unchecked `blocks launch` item; run `pnpm factory:status` to render it. Run
`pnpm factory:sync` to pull kernel and lint-rule fixes forward from a newer factory
release into this repo.

**Stack (frozen):** Next.js 16 (App Router), TypeScript strict, Postgres + Drizzle,
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

`pnpm check` green — lint, boundaries, format, typecheck, tests. Conventional Commits
for every commit message.

Canonical conventions: docs/agents/conventions.md

## Skills

`define-product`, `add-a-feature`, `enable-billing`, `swap-llm-provider`, `brand-it`,
`make-it-yours`, `pre-ship-check` — the adopter set, one per `LAUNCH.md` item.
`fabulous-feature` and `add-a-job` are shared with the factory and always available.
Ask "what's left to make this mine?" and run `pnpm factory:status` to render `LAUNCH.md`
and find the next one.

## Agents

`.claude/agents/` — delegate rather than doing everything in one context. `fab-scribe`
(SPECs and product docs), `fab-smith` (server and domain features), `fab-muse` (UI, theme,
email copy), `fab-preflight` (LAUNCH.md, doctor, preflight, gates — reports, never
fixes), plus `fab-warden` (conventions and quality review), `fab-bastion` (security
review), and `fab-medic` (systematic debugging). They are yours now — edit them as your
product's needs diverge from the factory's defaults.
