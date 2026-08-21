---
name: make-it-yours
description: The umbrella skill for owning every remaining factory default. Walks the Adoption Ledger item by item, including the demo-removal recipe and the legal-pages and README items. Use whenever you or the human ask "what's left to make this mine?"
---

# Make it yours

## Phase 1 — Survey

```bash
pnpm factory:status
```

Reports every Adoption Ledger item still at `factory-default`, why it matters, and which
skill fixes it. `product-def` → `define-product`; `app-identity`/`design-system`/
`email-templates` → `brand-it`; `plans-catalog` → `enable-billing`. This skill owns
`demo-logic`, `legal-pages`, and `readme` directly — the rest, delegate to their skill.

## Phase 2 — Demo removal (`demo-logic`)

Only once you've decided the page-monitor demo isn't your product (most adopters do this
eventually). Delete, exactly:

```bash
rm -rf packages/jobs/src/demo/
rm -rf apps/web/components/demo/
```

Then remove the demo parts of `apps/web/app/dashboard/page.tsx` and
`apps/web/app/dashboard/actions.ts` (or delete both files if the dashboard route itself
isn't yours to keep), and delete `packages/db/src/schema/monitor.ts`. Update
`packages/jobs/src/functions/index.ts`: drop the `monitorCron`/`monitorWorker` imports
and their entries in the `functions` array — an empty array is fine if you have no jobs
yet. Four more demo touchpoints, easy to miss because nothing above names them:

- `packages/db/src/schema/index.ts` — remove the `export * from "./monitor";` barrel
  line; it dangles the moment `monitor.ts` is deleted.
- `packages/jobs/src/index.ts` — drop the six re-exported symbol groups sourced from
  `./demo/check-monitor`, `./demo/record-error`, `./demo/constants`, and `./demo/queries`.
- `packages/jobs/src/events.ts` — `MONITOR_CHECK_EVENT` is demo-only; delete it (or the
  whole file, if you have no jobs yet).
- Delete the demo test files: `packages/jobs/test/check-monitor.test.ts`,
  `packages/jobs/test/queries.test.ts`, `packages/jobs/test/integration/demo.test.ts` —
  they import the modules you just removed.

Generate the drop migration:

```bash
pnpm db:generate
```

Review the generated migration before it runs — confirm it only drops the monitor table,
nothing else. `pnpm check` after, to catch anything still importing the deleted files.

## Phase 3 — Legal pages (`legal-pages`)

**Replace, don't delete.** `apps/web/app/(legal)/terms/page.tsx` and `.../privacy/page.tsx`
are placeholder copy, not placeholder routes — the landing footer links them, and
deleting the pages without also removing those footer links leaves dead links. Write real
terms and a real privacy policy (or keep them intentionally minimal for a prototype, but
remove the "placeholder, shipped by the template" notice once you have).

## Phase 4 — README (`readme`)

Rewrite `README.md` for your product: replace the factory's own pitch with yours, drop
sections that describe the template mechanics your users don't need to see (they're
already living in `docs/` and `.claude/skills/` for your agents), keep whatever quickstart
still applies.

## Phase 5 — Re-check

`pnpm factory:status` again — confirm each item you touched now reports `touched` or
`removed`, not `factory-default`.
