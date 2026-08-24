# Contributing

Fabulous Factory is a **factory repo**, not a product (see `CLAUDE.md` — "factory-dev
mode"): a runnable multi-preset workspace plus the npx installer CLI, not something
adopted directly. A contribution here is factory work — it changes what every future
`npx fabulous-factory@latest install` scaffolds, not a feature for one product. Adopters
get their own instruction set already installed: the npx installer composes it from
`payload/` (common adopter surface) and `presets/` (the chosen product shape) at publish
time. That compose model, and the factory's own conventions, are what this file protects.

## Set up

Node >= 24 is required and now enforced via `engine-strict` — `pnpm install` fails
outright on an older Node. The repo ships a `.nvmrc`, so `nvm install && nvm use` (no
version argument) picks the right one; shell auto-switch hooks and fnm honor it too.

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

Lint → boundaries (`dependency-cruiser`) → format check → typecheck → tests, in that
order. All green is the machine-checkable bar; nothing merges that doesn't clear it.
Full conventions: `docs/agents/conventions.md`.

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

PRs touching `packages/auth`, `packages/core`, `packages/billing`, `apps/*/proxy.ts`,
`packages/ui/src/middleware.ts`, or `packages/db/migrations` need the security checklist from
`.github/PULL_REQUEST_TEMPLATE.md` completed in the PR description, plus an independent,
fresh-context security review before merge. CI's `guarded-zones` job blocks merge on
those paths until the checklist's final line reads exactly `- [x] security-checklist`.

## Touching a shipped default

If your change edits one of the files seeded as a `LAUNCH.md` item (theme, landing page,
legal pages, the preset's own example domain, email templates, plans catalog, README,
`PRODUCT.md`, template showcase — the composed count differs per preset: 9 for
`untangle`, 8 for `nothing`, 9 for `brainstorm`), check whether the item's "Done means"
bullets in `payload/LAUNCH.md` or the relevant `presets/<id>/overlay/launch-items.md`
still describe it accurately — update them if the shape of the change has moved. There is
no mechanical check for this; it's reviewer judgment.

## Delegating to agents

`.claude/agents/` holds the `fab-*` subagent roster. In this repo you have `fab-forge`
(template packages, kernel, adapters, registry) and `fab-steward` (the adoption surface —
payload mirrors, presets, skill and agent tiering, ADRs), plus the three agents shared
with adopters: `fab-warden` (conventions and quality review), `fab-bastion` (security
review), and `fab-medic` (systematic debugging). Reviewers have no write tools and never run
the gates — you do.

The adopter-facing agents (`fab-scribe`, `fab-smith`, `fab-muse`, `fab-preflight`) are staged
in `payload/agents/` and are NOT loaded here; the npx installer composes them into the
product repo at publish time, and the factory-dev-only pair never ships. When you add an
agent, put it in the tier it belongs to and add a test expectation in
`packages/config/test/factory-agents.test.ts` — the per-directory counts there are
deliberate, so a new agent in the wrong tier fails the suite.

## Adding an integration

A new optional service (a second email provider, another billing adapter, …) follows the
`add-integration-package` skill: registry entry, capability wiring, adapter package,
contract tests, doctor hint, boundary allowlist — in that order.
