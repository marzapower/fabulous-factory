# Launch checklist

No agent may declare this product production-ready, flip the stage to production, or
proceed past `pre-ship-check`'s first phase while an unchecked `blocks launch` item
exists below. 🔒 items are ticked only after explicit human confirmation, recorded on
the Signed off line — an agent never ticks one on its own judgment. Non-🔒 items are
ticked by the agent only after verifying every "Done means" criterion against actual
repo state, not against intent. Adopters may add product-specific items — this file is
theirs to extend. A new item's heading follows the canonical form
`## [ ] Title · 🔒 human sign-off · blocks launch` — each segment separated by a space,
a middle dot (`·`), and another space — and the lowercase marker text (`🔒`,
`blocks launch`) is matched literally by the `pnpm factory:status` parser, so keep both
markers optional but spelled exactly as shown.

**Gate scope:** the hard gate is `blocks launch` items only. Open 🔒 items that do NOT
block launch (e.g. Plans catalog) must be _surfaced_ to the human during
`pre-ship-check` with a recommendation, but do not gate.

## [ ] Product definition · 🔒 human sign-off · blocks launch

**Why:** PRODUCT.md is still the template's shipped placeholder — no one has said what
this product is.
**Skill:** define-product

**Done means:**

- PRODUCT.md names the real audience and the problem it solves for them
- PRODUCT.md states the core loop (what a user actually does, in what order)
- Pricing intent reflects real numbers and a real limit, not a placeholder tier
- No "Replace this" / placeholder markers remain in PRODUCT.md

**Signed off:** _(date + who confirmed — filled only when ticked)_

## [ ] App identity · blocks launch

**Why:** The landing page, layout metadata, and demo teaser still show the template's
own name and copy, not the product's.
**Skill:** brand-it

**Done means:**

- Landing page copy (hero, header, feature cards) speaks the product's name and value
  prop, not the template's
- `apps/web/app/layout.tsx` metadata title (and description, if set) name the real
  product
- The demo teaser and any remaining home-page copy reference the product, not
  "Fabulous Factory"

**Signed off:** _(date + who confirmed — filled only when ticked)_

## [ ] Design system

**Why:** globals.css still ships the template's default theme tokens — no
product-specific brand applied yet.
**Skill:** brand-it

**Done means:**

- Color tokens in `apps/web/app/globals.css` express a deliberate product palette, not
  the shipped defaults
- Typography tokens (`--font-sans`/`--font-mono`) reflect an actual decision, not
  leftover defaults

**Signed off:** _(date + who confirmed — filled only when ticked)_

## [ ] Demo logic · blocks launch

**Why:** The Untangle workspace (the run engine plus the tasks domain riding on it) is
still the shipped example domain, not the product's own.
**Skill:** make-it-yours

**Done means:**

- The Untangle domain (`packages/jobs/src/tasks/`, `packages/db/src/schema/task.ts`,
  the workspace components) is renamed to the product's own noun, or deliberately kept
  as-is with that choice recorded — either is a valid outcome, silence is not
- The run engine (`packages/jobs/src/runs/`, `packages/db/src/schema/run.ts`, the SSE
  route, the run-history page) is kept — it is domain-agnostic infrastructure, not demo
  code to delete
- No orphaned tables, routes, or components remain from whichever parts were removed
- `packages/jobs/src/functions/index.ts` and related barrels no longer reference
  deleted or unrenamed modules

**Signed off:** _(date + who confirmed — filled only when ticked)_

## [ ] Legal pages · 🔒 human sign-off · blocks launch

**Why:** Terms and Privacy still carry the template's placeholder copy.
**Skill:** make-it-yours

**Done means:**

- Terms name the real legal entity, jurisdiction, and contact address
- Privacy lists the actual data processors and retention policy
- No REPLACE_ME / placeholder markers remain in either page

**Signed off:** _(date + who confirmed — filled only when ticked)_

## [ ] Email templates

**Why:** Verify-email, magic-link, and daily-plan emails still use the template's
default copy and styling.
**Skill:** brand-it

**Done means:**

- Verify-email, magic-link, and daily-plan templates carry the product's branding and
  copy
- Sender identity and subject lines (the `SUBJECTS` map in
  `packages/email/src/send.ts`) reference the real product name

**Signed off:** _(date + who confirmed — filled only when ticked)_

## [ ] Plans catalog · 🔒 human sign-off

**Why:** packages/config/src/plans.ts still ships the template's example pricing plans.
**Skill:** enable-billing

**Done means:**

- `plans.ts` encodes the product's real tiers, limits, and prices
- No `REPLACE_ME` markers remain in any `providerRefs`
- Stripe price IDs are real, not placeholder, if billing is enabled

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

## [ ] README

**Why:** README.md still describes the template itself, not the product built from it.
**Skill:** make-it-yours

**Done means:**

- README describes the product, its setup, and its deploy story — not the template
- Template-specific sections (factory mechanics, the guided tour) are trimmed or
  removed
- Quickstart instructions match the product's actual setup steps

**Signed off:** _(date + who confirmed — filled only when ticked)_
