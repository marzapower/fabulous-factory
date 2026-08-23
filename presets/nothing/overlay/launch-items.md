## [ ] Template showcase · blocks launch

**Why:** The public `apps/web/app/features/` component-docs pages and the demo API
routes under `apps/web/app/api/demo/` still document the template's own machinery — a
real product must not ship its starter kit's guided tour.
**Skill:** make-it-yours

**Done means:**

- The `apps/web/app/features/` directory's docs pages are removed or replaced with
  product content
- `packages/ui/src/middleware.ts`'s `/features/` allowlist entries are removed
- `apps/web/app/api/demo/*` and any route under it are removed

**Signed off:** _(date + who confirmed — filled only when ticked)_
