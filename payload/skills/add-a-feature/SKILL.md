---
name: add-a-feature
description: Build a new feature in your product, SPEC-first, using the factory's scaffolds and enforcement. Use for any new capability, however small — a SPEC keeps scope honest even for a one-page feature.
---

# Add a feature

## Phase 1 — SPEC first

Before writing code, write (or confirm) a SPEC at `docs/specs/<slug>.md` using
`docs/templates/SPEC.md`: job to be done, primary flow, error states, acceptance tests,
kill criteria. If `PRODUCT.md` is still the factory's placeholder, run `define-product`
first — a feature without a product behind it has no way to judge scope.

## Phase 2 — Scaffold

Stamp boilerplate instead of hand-writing it — deterministic beats probabilistic for
anything mechanical:

```bash
pnpm gen handler <name>   # apps/web/app/api/<name>/route.ts — defineHandler skeleton
pnpm gen page <name>      # apps/web/app/<name>/page.tsx — server component skeleton
pnpm gen job <name>       # packages/jobs/src/functions/<name>.ts — Inngest function skeleton
```

Each scaffold ships with TODO markers for the decisions you must make deliberately (auth
mode, input schema, rate-limit policy) — `gen handler` defaults to `auth: "required"` as
the safe starting point; change it only when the SPEC says the route is genuinely public.
A generated job prints the two edits it still needs in
`packages/jobs/src/functions/index.ts` — follow `add-a-job` for the details, including
when your job needs `@factory/db`/`@factory/llm`/etc. and belongs in your own domain
package instead (`packages/jobs` itself imports only `@factory/config`).

## Phase 3 — Build

Non-trivial work (new domain logic, multi-file changes, anything touching more than a
scaffold's TODOs): invoke `fabulous-feature` — it is the binding build process, contracts
through gates. A genuinely small, single-file change can skip the ceremony, but still
follows `docs/agents/conventions.md` (defineHandler/defineAction, no vendor SDK leaks,
registry-only env reads, graceful degradation).

## Phase 4 — Done

`pnpm check` green (lint, boundaries, format, typecheck, test) is the
definition of done — not "it works when I click it." Update the SPEC's acceptance tests
to reflect what actually shipped if scope moved during the build.
