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

## Phase 2 — Scaffold-and-check

The real check is `packages/create`'s scaffold-and-check job: run the installer CLI with
`--yes` into a temp dir, `pnpm install`, then run the _output's own_ `pnpm check` plus the
minimal boot (`migrate` + `/api/health`) — this validates what adopters actually receive.
That CLI lands in M3; until then, verify the two things it will assemble:

- `pnpm check` is green in the default (minimal, `DATABASE_URL` + `BETTER_AUTH_SECRET`
  only) profile, re-run on a clean clone (not your working tree — an actual `git clone`,
  or an rsync minus `node_modules`/`.next`/`.git`). It must boot with zero other service
  signups (`cp .env.example .env`, set the two required vars, `pnpm install`, `pnpm dev`).
- The payload golden surface is intact: `payload/CLAUDE.md`/`AGENTS.md` carry the literal
  pointer `docs/agents/conventions.md` and stay within their line caps
  (`packages/config/test/factory-docs.test.ts`), `payload/agents/` has its 4 files and
  `payload/skills/` its 7 dirs, `payload/LAUNCH.md`'s `<!-- preset:items -->` marker
  composes with `presets/demo/overlay/launch-items.md` to the pinned 9-item order
  (`packages/config/test/launch-checklist-drift.test.ts`), and no factory-dev skill/agent
  (`add-integration-package`, `write-adr`, `release-template`, `fab-forge`, `fab-steward`)
  appears anywhere under `payload/`.

## Phase 3 — Docker quickstart

```bash
cp .env.example .env
openssl rand -hex 32   # → BETTER_AUTH_SECRET
docker compose up --build
```

`db` → `migrate` → `app` boot in order; `curl localhost:3000/api/health` returns
`{"status":"ok"}`.

## Phase 4 — Tag and publish

Tag the release (`git tag vX.Y.Z`) and push it. npm publishing itself (both
`fabulous-factory` and `create-fabulous-factory`, lockstep versioning, lockfile capture
from the scaffold-and-check job) lands in M4 — until then this phase is the git tag only.
The GitHub template-repository checkbox is turned off at first publish (the installer is
the only supported door); do not re-enable it.

For the first public release specifically, work through `docs/guides/release-checklist.md`
too — it covers what this phase assumes is already done (LICENSE/CONTRIBUTING, live demo,
repo settings).
