# ADR 0007: Locale-prefix i18n via `@factory/i18n`, `as-needed` routing

**Status:** accepted

## Context

The design spec (§11) shipped v1 with i18n explicitly out of scope. That was the right
call for a first cut, but it left every preset app hardcoding English strings directly
in `packages/ui` and each app's own pages — the more the template grew, the more that
copy calcified into a shape that would be expensive to retrofit later (every component,
every route, every piece of copy). A builder who wants to ship in a second language today
has no seam to hook into; they'd be fighting the template, not building on it.

The factory's stack is frozen (Next.js 16 App Router, TypeScript strict) and its DAG is
deny-by-default (`docs/agents/conventions.md`) — any i18n mechanism has to fit inside
both without becoming a second, parallel convention system. `next-intl` is the
established App Router i18n library; the open questions were how much of it to expose
directly to app/package code (all of it, vs. wrapping it behind a factory seam the way
every other vendor SDK is wrapped) and what URL shape to commit to.

## Decision

We will add `packages/i18n` (`@factory/i18n`) as a new **base package**, shipped to
every preset, and a DAG **leaf** — it imports no other `packages/*` and is the only place
`next-intl` may be imported, with a single unavoidable seam: each app's own
`next.config.ts` (`next-intl/plugin` is a build-time-only wiring concern). The concrete
decisions, carried from the implementation plan (`docs/superpowers/plans/2026-08-27-i18n.md`
§0) into this ADR as the durable record:

- **D1** `@factory/i18n` wraps `next-intl`; every other package/app reaches next-intl only
  through this package's isomorphic root, `/server`, `/client`, `/navigation`,
  `/routing`, and `/middleware` subpaths — never a raw `next-intl` import.
- **D2** Every page of every preset moves under `app/[locale]/`; `app/api/**` stays at
  root, unprefixed. Routing uses next-intl's `localePrefix: "as-needed"`: `/` serves the
  default locale, `/en/x` redirects to `/x` (see Consequences for the observed status),
  `/it/x` serves Italian, and an unrecognized prefix 404s.
- **D3** No `Accept-Language` detection. The `NEXT_LOCALE` cookie is written only by the
  locale switcher; when present, valid, and not the default locale, the proxy redirects
  an unprefixed page URL to its prefixed form.
- **D4** Locales are declared in code, per app (`apps/<app>/i18n/config.ts`) — no env
  var. A single-locale app is the degraded state; there is no off switch, and
  `createAuthProxy`'s `i18n` option is required for every preset.
- **D5** JSON catalogs live per package (`<pkg>/messages/<locale>.json`), namespaced by
  package name (`ui`, `app`), keyed `ns.component.key`, merged by the app (the leaf
  package cannot import `packages/ui`) with per-key fallback to the default locale, and
  typed via TypeScript interface merging on `MessageRegistry`.
- **D6** `packages/ui` ships `en` + `it`; `apps/nothing` ships `en` + `it`;
  `apps/untangle` and `apps/brainstorm` declare `["en"]` only and keep their
  product-specific copy hardcoded — the mechanism is present and proven, not exercised
  end-to-end in every preset.
- **D7** `createAuthProxy({ i18n })` composes locale routing before the existing
  allowlist, inside `packages/ui/src/middleware.ts` — a guarded zone.
- **D8** `app/[locale]/layout.tsx` becomes the root layout: `alternateLinks: true` sends
  hreflang via a `Link` header, `<html lang>` reflects the resolved locale, and
  `<LocaleSwitcher />` (in `packages/ui`) renders nothing when only one locale is
  declared.
- **D9** Emails (`@factory/email`), `defineHandler`/`defineAction` error messages, and
  LLM output are explicitly **out of scope** and stay English-only — see Consequences.

## Consequences

**Gets easier.** Any preset (or an adopter's fork) can add a locale in one skill run
(`add-a-locale`, shared, shipped to every scaffolded repo): drop a `<xx>.json` next to
every `en.json`, add the locale to the app's `i18n/config.ts`, run `pnpm i18n:check`.
Every string in `packages/ui` and each app's own shared routes already flows through
`t()`, so there's no retrofit debt accumulating as the template grows.

**Gets harder / stays a gap, by design.** Emails, kernel error messages
(`defineHandler`/`defineAction`), and LLM output are not localized (D9) — a
fully-translated product still has three English-only surfaces an adopter must handle
themselves if they need them localized. This was a deliberate scope cut, not an
oversight: emails and kernel errors are comparatively low-traffic surfaces next to the
page/component surface this ADR does cover, and LLM output localization is a prompting
concern orthogonal to this mechanism, not a routing one.

**Deprecation path acknowledged, not acted on.** `setRequestLocale`, used in every page
and layout under `app/[locale]/` to enable static rendering, has been deprecated by
next-intl since 4.13.5 in favor of `next/root-params`. We deliberately keep
`setRequestLocale`: `next/root-params` is compiler-replaced and cannot run under Vitest,
which every package and app in this repo relies on for its own test suite. When
`next/root-params` (or an equivalent that survives a test runner) becomes viable here,
migrating off `setRequestLocale` is a mechanical, page-by-page change — not an
architectural one — and does not require revisiting this ADR.

**Trust assumption on the hreflang header.** D8's `alternateLinks: true` has next-intl
build the hreflang `Link` header from `x-forwarded-host`/`x-forwarded-proto`, so this
mechanism assumes the app sits behind a trusted reverse proxy that sets (and strips any
inbound client copy of) those headers — the deployment norm on Vercel, Fly, and nginx —
and performs no validation of its own on the resulting header value.

**Observed redirect status.** `/en/x → /x` is next-intl's own behavior under
`localePrefix: "as-needed"`, not something this package chooses. Observed on
2026-08-27 against a scaffolded `nothing` product built with `next-intl@4.13.7`: **307**
(`/en` → `/`, `/en/terms` → `/terms`). Tests in this repo assert the status falls in
`[307, 308]` rather than pinning one exact code, so a future next-intl change to 308
would not break the suite. Also observed: an unknown prefix such as `/fr` is treated like
any unknown path — a signed-out visitor is redirected to `/login` by the optimistic proxy
before the `[...rest]` catch-all can render the localized 404; a signed-in visitor gets
the 404.

**Rejected alternatives.**

- **`Accept-Language` detection.** Rejected per D3 — a request header the adopter cannot
  see or reason about deciding the initial locale is a worse default than an explicit,
  cookie-driven switcher; it also complicates caching (locale would become part of the
  cache key implicitly, from an uncontrolled input).
- **A single always-prefixed URL shape (`localePrefix: "always"`).** Rejected because it
  would put every default-locale URL under `/en/...`, breaking every hardcoded
  `/dashboard`-style href already in the codebase and every existing test's assumed URL
  shape, for no benefit to a single-locale-by-default adopter (D6: two of three presets
  ship one locale).
- **Reading `next-intl` directly from `packages/ui` and each app,** rather than wrapping
  it in `@factory/i18n`. Rejected for the same reason every other vendor SDK is confined
  to its own adapter package (`docs/agents/conventions.md`'s vendor-confinement rule): it
  would put `next-intl` import statements — and therefore an upgrade's blast radius —
  directly in every app and in `packages/ui`, instead of in one DAG-leaf package.
- **No i18n mechanism at all, keep it out of scope indefinitely.** Rejected because the
  cost of retrofitting grows every release; every additional English string shipped in
  `packages/ui` or an app's shared routes is one more string a future migration has to
  find and wrap.
