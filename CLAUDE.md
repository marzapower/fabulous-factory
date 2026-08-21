# CLAUDE.md — Fabulous Factory (factory-dev mode)

This is the **fabulous-factory template repo**, not a product. Everything here gets
cloned by every adopter, so work here is factory work, not feature work. Adopters run
`pnpm factory:init` to turn their clone into a product repo — that promotes the
instruction set staged in `.factory/handoff/` over this file.

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

Any non-trivial change (new feature, structural refactor, multi-file touch): invoke
`fabulous-feature` — it is the binding build process, not optional guidance.

Factory-dev skills (this repo only — not shipped to adopters): `add-integration-package`,
`update-ledger-hashes`, `write-adr`, `release-template`. `add-a-job` is shared and
available here too.

## Agents

`.claude/agents/` — delegate rather than doing everything in one context. Factory-dev:
`fab-forge` (template packages, kernel, adapters, registry), `fab-steward` (adoption
surface — ledger hashes, handoff mirrors, tiering, ADRs). Shared with adopters:
`fab-warden` (conventions and quality review), `fab-bastion` (security review),
`fab-medic` (systematic debugging). The adopter agents are staged in
`.factory/handoff/agents/` and install on `pnpm factory:init` — they are not loaded here.
`AGENTS.md` deliberately says nothing about them: `.claude/agents/` is Claude-specific,
and that file is the pointer for every other agent runtime.
