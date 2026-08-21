---
name: brand-it
description: Replace the template's shipped identity, theme, and email copy with your product's own — app name, landing page, colors, transactional email text. Use once you know what the product is (after define-product).
---

# Brand it

This is UI and copy work — if you have a design-focused skill installed, invoke it
alongside this one for aesthetic direction rather than defaulting to the template's
look unexamined.

## Phase 1 — App identity

- `apps/web/app/layout.tsx` — `metadata.title` (and `description`, if set) is still the
  template's name. Replace it with your product's.
- `apps/web/app/page.tsx` — the landing page copy (hero, feature list, footer) is the
  template's own pitch. Replace it with yours; keep the `/terms` and `/privacy` footer
  links pointed at the (still-present) legal pages — see `make-it-yours` if you're
  touching those.

## Phase 2 — Theme

`apps/web/app/globals.css` holds the Tailwind v4 CSS-native design tokens (colors,
radii, fonts). Adjust them to your product's palette — follow the repo's existing
token structure (don't hand-roll a parallel system).

## Phase 3 — Email copy

`packages/email/src/templates/{verify-email,magic-link,change-digest}.tsx` are
hand-authored plain-JSX email templates (deliberately no `react-email`/
`@react-email/components` dependency, though `@react-email/render` does the actual
rendering) with the template's own placeholder copy — deliberately unstyled, plain
html/body/p/a, no styling to update. Update the body text and any product name
references, and the subject lines in `packages/email/src/send.ts`'s `SUBJECTS` map. Keep
the same props contract (each template's exported prop types) —
`packages/email/src/templates/index.ts` and the callers depend on the shape, not the
copy.

## Phase 4 — Verify

`pnpm dev`, look at the landing page and layout `<title>` in a real browser tab, and send
yourself a test email (or check the `console` transport output in dev) for each template
you touched. Then `pnpm factory:status` — `app-identity` and `email-templates` should
report `touched`; `design-system` too if you edited `globals.css`.
