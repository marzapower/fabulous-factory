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

**Why:** The page-monitor demo feature (jobs, dashboard, schema, components) is still
the shipped example, not the product's real feature.
**Skill:** make-it-yours

**Done means:**

- The page-monitor demo (jobs, dashboard, schema, components) is either fully removed
  or rebuilt into the product's real feature
- No orphaned demo tables, routes, or components remain if removed
- `packages/jobs/src/functions/index.ts` and related barrels no longer reference
  deleted demo modules

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

**Why:** Verify-email, magic-link, and change-digest emails still use the template's
default copy and styling.
**Skill:** brand-it

**Done means:**

- Verify-email, magic-link, and change-digest templates carry the product's branding
  and copy
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

**Why:** The public /features/* explainer pages still document the template itself — a
real product must not ship its starter kit's guided tour.
**Skill:** make-it-yours

**Done means:**

- `/features/*` explainer pages and their marketing-only components
  (`feature-page-shell.tsx`, `env-table.tsx`) are removed or replaced with product
  content
- Dead links from the home page's feature cards are removed or repointed
- `apps/web/middleware.ts`'s `/features/` allowlist entry is removed if the pages are
  deleted

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
