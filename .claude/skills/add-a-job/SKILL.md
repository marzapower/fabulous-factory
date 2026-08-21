---
name: add-a-job
description: Add a new Inngest background job — scaffold, register it, name its event correctly. Shared skill, survives pnpm factory:init. Use whenever a feature needs cron, fan-out, or async work.
---

# Add a job

## Phase 1 — Scaffold

```bash
pnpm gen job <name>
```

Writes `packages/jobs/src/functions/<name>.ts`: an event-triggered
`inngest.createFunction({ id: "<name>", triggers: [{ event: "app/<name>.requested" }] },
...)` with a `step.run` skeleton. `<name>` must be a single kebab-case segment
(`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`) — no slashes, path traversal impossible by
construction.

## Phase 2 — Register (both edits)

The scaffold does NOT wire itself in — it prints the two exact lines to add to
`packages/jobs/src/functions/index.ts`:

1. The import: `import { <camelCaseName> } from "./<name>";`
2. The entry in the exported array: add `<camelCaseName>` to `functions = [...]`.

A generated-but-unregistered job must still compile (`pnpm typecheck` green) — that's
expected mid-edit, not a bug — but it won't run until both edits land.

## Phase 3 — Event naming

`namespace/entity.action.state`, e.g. `demo/monitor.check.requested`. `demo/` is the
shipped demo's namespace — **use `app/` for anything you build** (`app/<name>.requested`
is what the scaffold generates by default). Keep the const defined in the generated file
itself; don't scatter event-name string literals across callers.

## Phase 4 — Step granularity

Long fan-out work is written as step functions with **per-item steps**
(`step.run`/`step.sendEvent` per unit of work, not one giant step) so no single
invocation approaches serverless duration limits. See
`packages/jobs/src/demo/monitor-cron.ts` for the reference shape: one `step.run` to list
work, one `step.sendEvent` to fan out.

## Phase 5 — Import boundary

Jobs may import only `@factory/{config,db,core,llm,email,analytics,observability}` —
**never `@factory/auth`** (boundary-enforced by `pnpm boundaries`; jobs run outside a
request context and have no session to check).

## Phase 6 — Test

Follow the pattern in `packages/jobs/test/` (e.g. `check-monitor.test.ts` for a worker
function, `functions.test.ts` for the registration array itself). `INNGEST_EVENT_KEY`,
`INNGEST_SIGNING_KEY`, `INNGEST_DEV`, and `INNGEST_BASE_URL` (all in
`packages/config/src/registry.ts`) govern how jobs run locally vs. in Inngest Cloud —
`pnpm factory:doctor` reports which mode is active.
