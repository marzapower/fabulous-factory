# CLAUDE.md — Fabulous Factory (factory-dev mode)

This is the **fabulous-factory factory repo**, not a product — a runnable multi-preset
workspace, not something adopted directly. Work here is factory work, not feature work.
`apps/*` are preset apps: `apps/untangle` (the full showcase — capture → normalize →
daily plan), `apps/nothing` (blank slate: homepage, capability pages, auth, empty
dashboard), `apps/brainstorm` (chat-based project brainstormer). The adopter instruction
set lives in `payload/` + `presets/`, composed into a product repo by the npx installer
at publish time, not promoted here (see
`docs/superpowers/specs/2026-08-22-npx-installer-design.md`).

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

`pnpm check` green — lint, boundaries, format, typecheck, tests.
Conventional Commits for every commit message.

Canonical conventions: docs/agents/conventions.md

## Skills

Any non-trivial change (new feature, structural refactor, multi-file touch): invoke
`fabulous-feature` — it is the binding build process, not optional guidance.

Factory-dev skills (this repo only — not shipped to adopters): `add-integration-package`,
`write-adr`, `release-template`. `add-a-job` and `add-a-locale` are shared and available
here too.

## Agents

`.claude/agents/` — delegate rather than doing everything in one context. Factory-dev:
`fab-forge` (template packages, kernel, adapters, registry), `fab-steward` (adoption
surface — payload mirrors, presets, tiering, ADRs). Shared with adopters:
`fab-warden` (conventions and quality review), `fab-bastion` (security review),
`fab-medic` (systematic debugging). The adopter agents are staged in `payload/agents/`
and composed into the product repo by the installer — they are not loaded here.
`AGENTS.md` deliberately says nothing about them: `.claude/agents/` is Claude-specific,
and that file is the pointer for every other agent runtime.
