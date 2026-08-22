## [ ] Brainstormer domain · blocks launch

**Why:** The shipped per-user projects/chat/board domain (`packages/brainstorm`, the
Ideas/Features/Notes board riding on it) is still the template's own example domain, not
the product's.
**Skill:** make-it-yours

**Done means:**

- The brainstorm domain (`packages/brainstorm`, `packages/db/src/schema/brainstorm.ts`)
  is renamed to the product's own noun, or deliberately kept as-is with that choice
  recorded — either is a valid outcome, silence is not
- No orphaned tables, routes, or components remain from whichever parts were renamed
- Barrels and re-exports no longer reference deleted or unrenamed modules

**Signed off:** _(date + who confirmed — filled only when ticked)_

## [ ] Template showcase · blocks launch

**Why:** The public `apps/web/app/features/` component-docs pages and the demo API
routes under `apps/web/app/api/demo/` still document the template's own machinery — a
real product must not ship its starter kit's guided tour.
**Skill:** make-it-yours

**Done means:**

- The `apps/web/app/features/` directory's docs pages are removed or replaced with
  product content
- `apps/web/middleware.ts`'s `/features/` allowlist entries are removed
- `apps/web/app/api/demo/*` and any route under it are removed

**Signed off:** _(date + who confirmed — filled only when ticked)_
