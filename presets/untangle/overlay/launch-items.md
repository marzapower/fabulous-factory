## [ ] Untangle domain · blocks launch

**Why:** The Untangle workspace (the run engine plus the tasks domain riding on it) is
still the shipped example domain, not the product's own.
**Skill:** make-it-yours

**Done means:**

- The Untangle domain (`packages/untangle/src/tasks/`,
  `packages/untangle/src/schema/task.ts`, the workspace components) is renamed to the
  product's own noun, or deliberately kept as-is with that choice recorded — either is a
  valid outcome, silence is not
- The run engine (`packages/untangle/src/runs/`, `packages/untangle/src/schema/run.ts`,
  the SSE route, the run-history page) is kept — it is domain-agnostic infrastructure,
  not demo code to delete
- No orphaned tables, routes, or components remain from whichever parts were removed
- `packages/untangle/src/index.ts`'s `functions` export and related barrels no longer
  reference deleted or unrenamed modules — `packages/jobs/src/functions/index.ts` stays
  as-is, since it owns no domain code to update

**Signed off:** _(date + who confirmed — filled only when ticked)_

## [ ] Template showcase · blocks launch

**Why:** The public `apps/web/app/features/` component-docs pages and the landing
page's recorded-run demo still document the template's own machinery — a real product
must not ship its starter kit's guided tour.
**Skill:** make-it-yours

**Done means:**

- The `apps/web/app/features/` directory's per-primitive docs pages and the
  marketing-only components that exist solely to power them are removed or replaced
  with product content
- The landing page's recorded-run replay and "degradation, side by side" demo section
  are removed or repointed at the product's own feature, not the template's example
  domain
- Dead links from the home page's feature grid are removed or repointed
- `apps/web/middleware.ts`'s `/features/` allowlist entries (and any public demo route
  under `apps/web/app/api/demo/`) are removed if the pages/routes are deleted

**Signed off:** _(date + who confirmed — filled only when ticked)_
