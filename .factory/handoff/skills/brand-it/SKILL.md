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
- `apps/web/app/page.tsx` — a thin composition, not where the copy lives. The landing
  page's actual copy and layout is in `apps/web/components/marketing/` (`site-header`,
  `hero`, `control-panel`, `feature-card`, `features-meta`, `site-footer`, and more) —
  edit those components directly rather than `page.tsx`, unless you're changing the
  composition's structure itself. Keep the `/terms` and `/privacy` links in
  `site-footer.tsx` pointed at the (still-present) legal pages — see `make-it-yours` if
  you're touching those.
- **Watermarks are opt-out, not a bug to fix.** `site-footer.tsx` carries a "Built with
  Fabulous Factory" credit link, some `marketing/` files carry a 2-line source comment
  crediting the project, and a few inert `fab-*` marker classes (`fab-shell`, `fab-card`,
  `fab-station`, …) sit in classNames — zero CSS, no visual effect, purely a fingerprint.
  None of it blocks preflight and none of it costs you a line of styling. You're free to
  remove any of it — see `make-it-yours`'s `template-showcase` phase for the removal
  recipe — we'd just appreciate it if you kept the footer link; no dark patterns, just a
  polite ask.

## Phase 2 — Theme

`apps/web/app/globals.css` holds the Tailwind v4 CSS-native design tokens (colors,
radii, fonts). Adjust them to your product's palette — follow the repo's existing
token structure (don't hand-roll a parallel system). `--font-sans` and `--font-mono`
map to vendored IBM Plex Sans / IBM Plex Mono by default (human voice / machine voice) —
swap the font files and update those two token values to rebrand typography in one
place; nothing else in the app references a font family directly.

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
you touched. Then check `LAUNCH.md`: verify the "Done means" bullets for whichever of
`App identity`, `Design system`, and `Email templates` you touched, and tick each one
that's satisfied — none of the three is 🔒, so this skill ticks them itself. Run `pnpm
factory:status` afterward to confirm the render agrees.
