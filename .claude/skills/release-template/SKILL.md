---
name: release-template
description: Maintainer checklist for cutting a new tagged release of the factory — scaffold-and-check plus the lockstep npm publish of fabulous-factory and create-fabulous-factory. Use before publishing a new version.
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

## Phase 2 — Scaffold-and-check

The real check is `packages/create`'s scaffold-and-check job — it validates what adopters
actually receive, not the factory's own working tree:

```bash
pnpm compose --preset demo
tsx packages/create/src/cli.ts install --yes --no-install --no-git --dir <tmp>
cd <tmp>
pnpm install
pnpm check
# minimal boot: migrate + /api/health
```

1. `pnpm compose --preset demo` assembles `templates/demo/` (base + payload + the demo
   preset, per the compose model) into the ephemeral, gitignored `templates/` dir.
2. The CLI installs that composed template into a fresh temp dir with `--yes` (no
   prompts), `--no-install` and `--no-git` (this script drives both explicitly next).
3. Inside the output: `pnpm install`, then the _output's own_ `pnpm check` (lint,
   boundaries, format, typecheck, test) in the default minimal profile
   (`DATABASE_URL` + `BETTER_AUTH_SECRET` only), then the minimal boot (`pnpm db:migrate`,
   build, poll `/api/health`).

Also verify the payload golden surface the compose step draws from is intact:
`payload/CLAUDE.md`/`AGENTS.md` carry the literal pointer `docs/agents/conventions.md`
and stay within their line caps (`packages/config/test/factory-docs.test.ts`),
`payload/agents/` has its 4 files and `payload/skills/` its 7 dirs, `payload/LAUNCH.md`'s
`<!-- preset:items -->` marker composes with `presets/demo/overlay/launch-items.md` to
the pinned 9-item order (`packages/config/test/launch-checklist-drift.test.ts`), and no
factory-dev skill/agent (`add-integration-package`, `write-adr`, `release-template`,
`fab-forge`, `fab-steward`) appears anywhere under `payload/`.

## Phase 3 — Docker quickstart

```bash
cp .env.example .env
openssl rand -hex 32   # → BETTER_AUTH_SECRET
docker compose up --build
```

`db` → `migrate` → `app` boot in order; `curl localhost:3000/api/health` returns
`{"status":"ok"}`.

## Phase 4 — Tag, capture the lockfile, then publish

Both npm packages publish together, in lockstep, and only after the CI-captured lockfile
is committed — publishing before that step ships templates with no lockfile:

- `fabulous-factory` (the installer CLI, `packages/create`) and
  `create-fabulous-factory` (the thin `npm create`/`pnpm create` alias) carry the **same
  version number** — bump both `package.json`s together, never one alone.
- `git tag vX.Y.Z` and `git push origin vX.Y.Z`, where `X.Y.Z` is the version about to be
  published — the tag push is what triggers `scaffold-and-check` in `ci.yml`.
- Once that run is green, **manually** download its `captured-lockfile-demo` artifact and
  commit it as `presets/demo/pnpm-lock.captured.yaml`. Nothing automates this step. The
  Release workflow's `verify` job only warns (`::warning`, not a failure) when this file
  is absent, so skipping it is easy to miss — but it means the published templates ship
  with no lockfile.
- Only then dispatch the **Release** workflow (`.github/workflows/release.yml`) with
  `dry_run` left at its default (`true`) first. The dry run is also where you verify that
  pnpm has rewritten `create-fabulous-factory`'s `workspace:*` dependency on
  `fabulous-factory` to the concrete version being published. Once the dry run looks
  right, dispatch again with `dry_run: false` for the real publish — this workflow is the
  only supported way to publish; there is no local `npm publish` path.
- `prepack` runs the compose step and regenerates `templates/<preset>/` fresh into each
  package's tarball — never publish from a stale or hand-edited `templates/` dir.
- The GitHub template-repository checkbox stays **off** (turned off at first publish,
  per ADR-0005) — the npx installer is the only supported adoption door; do not
  re-enable it.

For the first public release specifically, work through `docs/guides/release-checklist.md`
too — it covers what this phase assumes is already done (LICENSE/CONTRIBUTING, live demo,
repo settings).
