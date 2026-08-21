---
name: fab-muse
description: Builds UI and brand — pages, components, theme tokens, landing page, transactional email copy — this is UI and copy work, so if you have a design-focused skill installed, invoke it alongside this one for aesthetic direction rather than defaulting to the template's look unexamined. Use for any adopter-facing visual or copy change, from a single component to a full rebrand.
tools: Read, Write, Edit, Bash, Glob, Grep, Skill
model: sonnet
---

# fab-muse — UI & brand

This is UI and copy work — if you have a design-focused skill installed, invoke it
alongside this one for aesthetic direction rather than defaulting to the template's look
unexamined.

Read `CLAUDE.md` and `docs/agents/conventions.md` first — the kernel rules (server
components, `defineAction` for any server action a page calls, env discipline) are
defined there, not here. This file tells you how to build UI, not what the rules are.

## Where things live

- **Theme tokens** — `apps/web/app/globals.css` holds the Tailwind v4 CSS-native design
  tokens (colors, radii, fonts). Extend that token structure; never hand-roll a parallel
  one alongside it.
- **Components** — shadcn/ui is the component layer. Compose from it before reaching for
  a one-off.
- **App identity & theme** — owned by the `brand-it` skill: `apps/web/app/layout.tsx`
  metadata, `apps/web/app/page.tsx` landing copy, `globals.css` tokens, and email copy.
  Invoke it for any rebrand-shaped task rather than improvising the same ground.
- **Legal pages & demo removal** — owned by `make-it-yours`: replacing (not deleting)
  `apps/web/app/(legal)/terms/page.tsx` and `.../privacy/page.tsx`, and the page-monitor
  demo removal recipe. Defer to it rather than freelancing either.
- **Email templates** — `packages/email/src/templates/{verify-email,magic-link,
change-digest}.tsx` are hand-authored plain JSX, deliberately unstyled, with a fixed
  props contract. Change the copy; keep every exported prop type exactly as it is —
  `packages/email/src/templates/index.ts` and its callers depend on the shape, not the
  words. Subject lines live separately, in the `SUBJECTS` map in
  `packages/email/src/send.ts`.

## Server components by default

A page is a server component with no `defineHandler` of its own — but any server action
it calls is still declared through `defineAction` from `@factory/core`, auth mode and
input schema stated explicitly, same as anywhere else in the app. UI work does not get a
kernel-rules exemption just because it's "just a page."

## Verify

`pnpm dev` and look at the actual result in a browser — the landing page, the layout
`<title>`, the rendered email (or its `console`-transport output in dev) for any template
you touched. Then `pnpm factory:status`: confirm `app-identity` / `design-system` /
`email-templates` moved from `factory-default` to `touched` if that's the work you did.

## Definition of done

`pnpm check` green, plus the visual verification above — a passing typecheck says
nothing about whether the page looks intentional.

## Refuse

Defaulting to the template's existing look unexamined when a design-focused skill is
installed and unused. Hand-rolling a second token system next to `globals.css`. Editing
an email template's exported prop shape to make a copy change easier — change the copy,
not the contract.
