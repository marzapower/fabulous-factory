# Contributing

Fabulous Factory is a **template repo**, not a product (see `CLAUDE.md` — "factory-dev
mode"). Everything here gets cloned by every adopter, so a contribution here is factory
work: it changes what ships to every future clone, not a feature for one product.
Adopters promote their own instruction set out of `.factory/handoff/` via
`pnpm factory:init`; that flow, and the template's own conventions, are what this file
protects.

## Set up

**Devcontainer** (fastest — Postgres included):

```bash
# Open in Codespaces, or "Reopen in Container" in VS Code / Cursor.
```

Boots the app container plus a Postgres service (`DATABASE_URL` and
`TEST_DATABASE_URL` are pre-wired) and runs `pnpm install` for you.

**Local + Docker Postgres:**

```bash
docker compose up -d db      # Postgres only, no app build
cp .env.example .env         # set DATABASE_URL + BETTER_AUTH_SECRET
openssl rand -hex 32         # → paste as BETTER_AUTH_SECRET in .env
pnpm install
pnpm dev                     # migrations self-apply against the compose db
```

Everything past `DATABASE_URL` + `BETTER_AUTH_SECRET` is optional — see
`docs/guides/graceful-degradation.md`.

## Definition of done

```bash
pnpm check
```

Lint → boundaries (`dependency-cruiser`) → format check → typecheck → tests → adoption
manifest freshness, in that order. All green is the machine-checkable bar; nothing merges
that doesn't clear it. Full conventions: `docs/agents/conventions.md`.

## Commits and PRs

[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), enforced by
commitlint: a lowercase subject line, and body lines no longer than 100 characters. The
`commit-msg` husky hook checks every local commit; CI's `pr-title` job lints the PR title
the same way — **your PR title must itself be a valid Conventional Commit**, since that's
what CI checks.

## Non-trivial changes

Any new feature, structural refactor, or multi-file touch goes through the
`fabulous-feature` skill — it's the binding build process for this repo, not optional
guidance. Adding a background job specifically: use `add-a-job`.

## Guarded zones

PRs touching `packages/auth`, `packages/core`, `packages/billing`,
`apps/web/middleware.ts`, or `packages/db/migrations` need the security checklist from
`.github/PULL_REQUEST_TEMPLATE.md` completed in the PR description, plus an independent,
fresh-context security review before merge. CI's `guarded-zones` job blocks merge on
those paths until the checklist's final line reads exactly `- [x] security-checklist`.

## Touching a shipped default

If your change edits one of the 8 files the Adoption Ledger tracks (theme, landing page,
legal pages, demo, email templates, plans catalog, README, `PRODUCT.md`), run the
`update-ledger-hashes` skill (or `pnpm factory:manifest`) before you commit — otherwise
`pnpm factory:manifest --check` goes red in CI.

## Adding an integration

A new optional service (a second email provider, another billing adapter, …) follows the
`add-integration-package` skill: registry entry, capability wiring, adapter package,
contract tests, doctor hint, boundary allowlist — in that order.
