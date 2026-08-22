---
name: add-a-job
description: Add a new Inngest background job — scaffold, register it, name its event correctly. Shared skill, shipped to every scaffolded project. Use whenever a feature needs cron, fan-out, or async work.
---

# Add a job

`packages/jobs` is generic infrastructure only — the Inngest client
(`packages/jobs/src/client.ts`) and this registry, empty by default
(`export const functions = [];`). It ships with every preset. If your job needs nothing
but `@factory/config` (rare), scaffold it here directly. Most real jobs touch the
database, an LLM call, or another adapter — those belong in your own domain package (the
same shape as `packages/untangle` or `packages/brainstorm`), which depends on
`@factory/jobs` for the client and registers its own functions the same way (Phase 2
below); see `make-it-yours` if you're extending a preset's existing domain package rather
than starting a new one.

## Phase 1 — Scaffold

```bash
pnpm gen job <name>
```

Writes `packages/jobs/src/functions/<name>.ts`: an event-triggered
`inngest.createFunction({ id: "<name>", triggers: [{ event: "app/<name>.requested" }] },
...)` with a `step.run` skeleton. `<name>` must be a single kebab-case segment
(`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`) — no slashes, path traversal impossible by
construction. If the job belongs in a domain package instead (Phase 5), write it there
by hand in the same shape — the scaffold only targets `packages/jobs`.

## Phase 2 — Register (both edits)

The scaffold does NOT wire itself in — it prints the two exact lines to add to
`packages/jobs/src/functions/index.ts` (or your domain package's own `functions` export,
registered the same way and merged in at the mount route — see Untangle's shipped
`packages/untangle/src/cron/` functions and `apps/*/app/api/inngest/route.ts` for the
merge):

1. The import: `import { <camelCaseName> } from "./<name>";`
2. The entry in the exported array: add `<camelCaseName>` to `functions = [...]`.

A generated-but-unregistered job must still compile (`pnpm typecheck` green) — that's
expected mid-edit, not a bug — but it won't run until both edits land.

## Phase 3 — Event naming

`namespace/entity.action.state`, e.g. `untangle/daily-plan.requested`. `untangle/` is
the shipped workspace's namespace — **use `app/` for anything you build**
(`app/<name>.requested` is what the scaffold generates by default). Keep the const
defined in the generated file itself; don't scatter event-name string literals across
callers.

## Phase 4 — Step granularity

Long fan-out work is written as step functions with **per-item steps**
(`step.run`/`step.sendEvent` per unit of work, not one giant step) so no single
invocation approaches serverless duration limits. See
`packages/untangle/src/cron/daily-plan-cron.ts` for the reference shape (it lives in the
Untangle domain package, not `packages/jobs`, because it needs `@factory/db`): one
`step.run` to list work, one `step.sendEvent` (chunked) to fan out.

## Phase 5 — Import boundary

`packages/jobs` may import only `@factory/config` (boundary-enforced by `pnpm
boundaries`) — it's the Inngest client and the generic registry, nothing else. A job that
needs `@factory/db`, `@factory/core`, `@factory/llm`, `@factory/email`,
`@factory/analytics`, or `@factory/observability` — most real jobs will — belongs in a
domain package instead, where all of those plus `@factory/jobs` itself are fair game.
**Never `@factory/auth`, from either location** — jobs run outside a request context and
have no session to check.

## Phase 6 — Test

Follow the pattern in `packages/jobs/test/` for the registry itself (`registry.test.ts`)
and your domain package's own `test/` dir for a function's pipeline logic (e.g.
`packages/untangle/test/tasks-pipeline.test.ts`). `INNGEST_EVENT_KEY`,
`INNGEST_SIGNING_KEY`, `INNGEST_DEV`, and `INNGEST_BASE_URL` (all in
`packages/config/src/registry.ts`) govern how jobs run locally vs. in Inngest Cloud —
`pnpm factory:doctor` reports which mode is active.

## No `/api/inngest` mount yet?

Some presets (Nothing, Brainstorm Chat) ship with no Inngest functions registered, so
there's no `apps/*/app/api/inngest/route.ts` yet either — the mount only needs to exist
once something is actually registered. Add it as the allowlisted framework mount (mirrors
the better-auth precedent at `apps/*/app/api/auth/[...all]/route.ts`; the raw-handler
lint rule forbids every other form of exporting `GET`/`POST` from a route file, but this
exact destructure, on this exact file, calling `serve`, is a registered `FRAMEWORK_MOUNTS`
entry in `eslint.config.mjs`):

```ts
import { serve } from "inngest/next";
import { inngest, functions } from "@factory/jobs";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
```

(If your job lives in a domain package, merge its `functions` export in too — see
Untangle's shipped route for the two-array spread.) Then add the route to
`apps/*/middleware.ts`'s `EXACT_ALLOWLIST` — a single flat route, not a prefix, since
Inngest calls it server-to-server with no cookie and no sub-paths of its own:

```diff
 const EXACT_ALLOWLIST = new Set([
   "/",
   "/login",
   ...
+  "/api/inngest",
 ]);
```

Middleware is a **guarded zone** (`docs/agents/conventions.md`) — this one-line addition
still needs a security checklist and independent review, no exceptions for "just adding
one entry."
