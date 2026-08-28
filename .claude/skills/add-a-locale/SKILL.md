---
name: add-a-locale
description: Add a new locale to a scaffolded product — drop the catalog files, declare the locale, verify the switcher and the prefixed route. Shared skill, shipped to every scaffolded project.
---

# Add a locale

`@factory/i18n` merges catalogs per-key with fallback to the default locale
(`docs/adr/0007-i18n-locale-prefix-routing.md`), so a new locale can ship incrementally —
partial coverage still renders, just with English filling any gap until you catch up.

## Phase 1 — Add the catalog files

Every catalog directory that ships `en.json` needs a matching `<xx>.json` beside it —
`en.json` is the **base catalog by convention** (the file named after the locale, not
derived from any app's `defaultLocale`; `packages/i18n` is a DAG leaf and reads no app
config). For a new locale `xx`:

```bash
cp packages/ui/messages/en.json packages/ui/messages/xx.json
cp apps/web/messages/en.json apps/web/messages/xx.json
```

Translate every value in both new files — keep the key structure identical to `en.json`;
`pnpm i18n:check` (Phase 3) is what catches a mismatch, not a manual diff.

## Phase 2 — Declare the locale

Add `xx` to the `locales` array in `apps/web/i18n/config.ts` (the `defineI18n({...})`
call) — this is the single place an app opts a locale in; there is no env var for it
(D4: locale set is a code decision, not a runtime one).

```diff
 export const i18n = defineI18n({
-  locales: ["en"],
+  locales: ["en", "xx"],
   defaultLocale: "en",
   catalogs: [uiCatalog, appCatalog],
 });
```

## Phase 3 — Verify

```bash
pnpm i18n:check
```

An app's catalog must match `en.json`'s keys exactly (missing OR extra keys fail); a
package's catalog (e.g. `packages/ui`) only warns on a missing key, but still fails on
an extra one. Then `pnpm dev` and confirm `/xx` renders the translated pages and the
locale switcher (in the site footer) now offers the new locale — it renders nothing
until an app declares more than one.
