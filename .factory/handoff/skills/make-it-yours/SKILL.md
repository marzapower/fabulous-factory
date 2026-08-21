---
name: make-it-yours
description: The umbrella skill for owning every remaining factory default. Walks the Adoption Ledger item by item, including the demo-removal recipe, the template-showcase feature-pages removal, and the legal-pages and README items. Use whenever you or the human ask "what's left to make this mine?"
---

# Make it yours

## Phase 1 — Survey

```bash
pnpm factory:status
```

Reports every Adoption Ledger item still at `factory-default`, why it matters, and which
skill fixes it. `product-def` → `define-product`; `app-identity`/`design-system`/
`email-templates` → `brand-it`; `plans-catalog` → `enable-billing`. This skill owns
`demo-logic`, `legal-pages`, `readme`, and `template-showcase` directly — the rest,
delegate to their skill.

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

## Phase 3 — Template showcase (`template-showcase`)

The public feature-explainer pages (`apps/web/app/features/auth`,
`.../billing`, `.../llm`, `.../jobs`, `.../email`, `.../observability`, plus the
`/features` index) are the template's own guided tour — real for the template repo, not
for your product. Delete the six pages and their index:

```bash
rm -rf apps/web/app/features/
```

Then delete the two marketing components that exist solely to power those pages — the
page-specific shell and the live env-var table:

```bash
rm apps/web/components/marketing/feature-page-shell.tsx
rm apps/web/components/marketing/env-table.tsx
```

Leave the rest of `apps/web/components/marketing/` alone — `site-header`, `hero` (which
renders `control-panel`), `quickstart-strip`, `feature-card`, `features-meta`,
`demo-teaser`, `status-light`, `site-footer`, and the shared `code-block` +
`copy-button` pair (the quickstart strip imports them) are all part of the home page
composition (`apps/web/app/page.tsx`, owned by `brand-it`'s app-identity work), not just
the pages you're deleting.

**Dead links**: the feature cards on the home page link to the pages you just deleted.
In `apps/web/components/marketing/features-meta.ts`, remove the `href` from each entry
(it's optional — `FeatureCard` renders no "How it works" link when it's absent), or
repoint the cards at your product's own pages.

**Middleware** (`apps/web/middleware.ts`) allowlists the deleted routes — remove both
entries, and nothing else:

```diff
-  // Public template feature-explainer pages index.
-  "/features",
   ...
-const PREFIX_ALLOWLIST = ["/api/auth/", "/features/"];
+const PREFIX_ALLOWLIST = ["/api/auth/"];
```

Middleware is a **guarded zone** (`docs/agents/conventions.md`) — a PR touching it needs
a security checklist and an independent review, no exceptions for "just deleting two
lines." Make exactly this diff and nothing more; don't refactor the allowlist while
you're in there.

**`site-footer.tsx` is not part of this item** — it's the one marketing component
excluded from `template-showcase`'s tracked files on purpose, specifically so keeping its
"Built with Fabulous Factory" credit link never blocks preflight. Keep it as-is if you're
willing; it costs nothing and the project could use the mention. If you'd rather remove
it, `apps/web/components/marketing/site-footer.tsx` is yours to edit like anything else —
just make sure whatever replaces it still links `/terms` and `/privacy` (see Phase 4).

## Phase 4 — Legal pages (`legal-pages`)

**Replace, don't delete.** `apps/web/app/(legal)/terms/page.tsx` and `.../privacy/page.tsx`
are placeholder copy, not placeholder routes — the site footer (`site-footer.tsx`, shared
across the public pages and the dashboard) links them, and deleting the pages without also
removing those footer links leaves dead links. Write real terms and a real privacy policy
(or keep them intentionally minimal for a prototype, but remove the "placeholder, shipped
by the template" notice once you have).

## Phase 5 — README (`readme`)

Rewrite `README.md` for your product: replace the factory's own pitch with yours, drop
sections that describe the template mechanics your users don't need to see (they're
already living in `docs/` and `.claude/skills/` for your agents), keep whatever quickstart
still applies.

## Phase 6 — Re-check

`pnpm factory:status` again — confirm each item you touched now reports `touched` or
`removed`, not `factory-default`.
