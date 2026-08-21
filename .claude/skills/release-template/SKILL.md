---
name: release-template
description: Maintainer checklist for cutting a new tagged release of the template itself. Use before publishing a new version for adopters to clone.
---

# Release the template

Factory-dev only — this is about shipping a new version of fabulous-factory itself, not
a product built from it.

## Phase 1 — Gates, both profiles

```bash
pnpm check
```

Green in the default (minimal, `DATABASE_URL` + `BETTER_AUTH_SECRET` only) profile. Then
confirm the full-profile CI job (all services mocked) is green on the branch you're
releasing — don't tag on a red or skipped full-profile run.

## Phase 2 — Manifest freshness

```bash
pnpm factory:manifest --check
```

Must exit 0. If it's stale, run `update-ledger-hashes` first and re-run gates.

## Phase 3 — Quickstart, re-verified on a clean clone

Clone the repo fresh (not your working tree — an actual `git clone`, or an rsync minus
`node_modules`/`.next`/`.git`), and run the README's quickstart exactly as written:
`cp .env.example .env`, set `DATABASE_URL` + `BETTER_AUTH_SECRET`, `pnpm install`,
`pnpm dev`. It must boot with zero other service signups. Then `pnpm factory:init` on
that same clone and confirm it promotes the adopter instruction set correctly (root
`CLAUDE.md` becomes the adopter version, `.factory/handoff/` is gone, factory-dev-only
skills are gone, `fabulous-feature`/`add-a-job` remain).

## Phase 4 — Docker quickstart

```bash
cp .env.example .env
openssl rand -hex 32   # → BETTER_AUTH_SECRET
docker compose up --build
```

`db` → `migrate` → `app` boot in order; `curl localhost:3000/api/health` returns
`{"status":"ok"}`.

## Phase 5 — Tag and publish

Tag the release (`git tag vX.Y.Z`), push it, and confirm the GitHub template repository
setting is still enabled on the repo (Settings → Template repository) so "Use this
template" keeps working for new adopters.

For the first public release specifically, work through `docs/guides/launch-checklist.md`
too — it covers what this phase assumes is already done (LICENSE/CONTRIBUTING, live demo,
repo settings).
