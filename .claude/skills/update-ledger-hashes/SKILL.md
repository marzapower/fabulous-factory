---
name: update-ledger-hashes
description: Regenerate the Adoption Ledger's file hashes after a shipped factory default changes. Use whenever a commit touches one of the 8 manifest items' files (theme, landing page, legal pages, demo, email templates, plans catalog, README, PRODUCT.md) in the template repo itself.
---

# Update ledger hashes

`.factory/manifest.json` records SHA-256 hashes of the shipped bytes of 8 factory
defaults (see the `items` list in the manifest, or `pnpm factory:status` for the live
view). When you edit one of those files in the **template repo** — not a product repo
adopted from it — the committed hash goes stale, and CI's `factory:manifest --check` (run
as part of `pnpm check` here) goes red until it's regenerated.

## When this applies

Only in the template repo (`.factory/config.json` has `"template": true`). If you're
working in an adopted product repo, this skill and its underlying script both refuse —
`factory:manifest` is the record of what the template shipped, and a product repo must
never regenerate it out from under its own Adoption Ledger.

## Steps

```bash
pnpm factory:manifest
```

Rewrites every `hash` field in `.factory/manifest.json` from the current file contents on
disk. Review the diff — it should touch only the hash(es) for the item(s) you actually
changed; anything else changing is a sign the wrong files landed in the wrong commit.

```bash
git add .factory/manifest.json
```

Commit it alongside the content change, not as a separate follow-up — a template commit
that changes a manifest-tracked file without updating its hash leaves CI red for whoever
merges next.

## Verify

```bash
pnpm factory:manifest --check
```

Exits 0 with no stale entries once the manifest matches disk.
