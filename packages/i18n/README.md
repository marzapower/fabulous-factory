# @factory/i18n

Thin wrapper around `next-intl` — the only place `next-intl` may be imported outside
`apps/*/next.config.ts` (`pnpm boundaries`'s `no-next-intl-outside-i18n` rule enforces
this). A DAG leaf: imports no other `@factory/*` package. See
`docs/agents/conventions.md` ("Localization") and
`docs/superpowers/plans/2026-08-27-i18n.md` for the full contract this package
implements.

## Subpaths

- `.` — isomorphic (no `"use client"`, no `server-only`): `defineI18n`, `getI18nConfig`,
  the `Catalog`/`Messages`/`I18nConfig` types, `MessageRegistry`, and the next-intl root
  re-exports (`useTranslations`, `useLocale`, `useFormatter`, `useMessages`, `useNow`,
  `useTimeZone`, `NextIntlClientProvider`, `hasLocale`). This is the _only_ sanctioned
  import path for those hooks — re-exporting them from a `"use client"` module would turn
  them into a client reference that throws in server components.
- `./server` — `server-only`: request config (`createRequestConfig`), `getTranslations`
  & co. re-exported from `next-intl/server`, a locale-aware `redirect`, `localizedHref`,
  `generateLocaleParams`.
- `./client` — `"use client"`: `I18nProvider`, `useI18nRouting`, `useLocalizedHref`,
  `setLocaleCookie`.
- `./navigation` — `"use client"`: `Link`, `useRouter`, `usePathname` — wrapping
  `next/link` + `next/navigation` directly (not next-intl's `createNavigation`, since
  routing config is app-owned and reaches the client through `I18nProvider` context).
- `./routing` — pure, no `next-intl` import: `stripLocale`, `localizeHref`, `isLocale`,
  the `LocaleRouting` type. Consumed by `packages/ui/src/middleware.ts` (the proxy).
- `./middleware` — `createLocaleRouting` (imports `next-intl/middleware`); consumed only
  by `packages/ui/src/middleware.ts`.
- `./check` — pure catalog diffing (`diffCatalog`, `flattenKeys`), used by
  `scripts/i18n-check.ts` (`pnpm i18n:check`).

## `pnpm i18n:check`

Diffs every `{packages,apps}/*/messages/<locale>.json` against that directory's
`en.json` (the base catalog, by convention). Missing/extra keys in an app's own catalog
fail the check; a package's missing keys only warn (a package may ship a locale an app
hasn't adopted yet).
