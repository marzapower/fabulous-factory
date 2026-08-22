# Release checklist

For maintainers of the **factory repo itself**, cutting a new published release of the
`fabulous-factory` / `create-fabulous-factory` npm packages. Not for adopters shipping a
product built from one — that's `pre-ship-check`, one of the adopter skills staged in
`payload/skills/` and gated by the adopter-facing `LAUNCH.md` staged at
`payload/LAUNCH.md`. This guide and that checklist are two different things: this one is
about releasing the installer and its embedded presets; `LAUNCH.md` is about shipping a
product built from one of them.

Steps marked **(account)** need credentials this repo can't hold (Vercel, GitHub) and
can't be automated by an agent running inside it — do them yourself, then come back.

## 1. Repo hygiene

- [ ] `LICENSE` present (MIT, current copyright holder) and `CONTRIBUTING.md` present —
      both already linked from the README badges.
- [ ] README badges are true: license badge matches `LICENSE`, the Conventional Commits
      badge matches `commitlint.config.mjs`, the stack badges (Next.js/TypeScript/
      Postgres/Drizzle) match `package.json`/`tsconfig.base.json`.
- [ ] The "Open in Codespaces" README link points at the real `OWNER/REPO`, not the
      `OWNER/REPO` placeholder.
- [ ] `docs/guides/` bullet in the README lists real, existing files.

## 2. Gates, both profiles

```bash
pnpm check
```

Green locally. Then confirm on the branch you're about to make public: CI's `quality`,
`minimal-boot`, `docker`, and `full-profile` jobs are all green (`.github/workflows/ci.yml`).

## 3. Docker quickstart, re-verified

```bash
cp .env.example .env
openssl rand -hex 32   # → BETTER_AUTH_SECRET
docker compose up --build
```

`db` → `migrate` → `app` boot in order; `curl localhost:3000/api/health` returns
`{"status":"ok"}`. See `docs/guides/deploy-docker.md` for the full walkthrough.

## 4. Live demo deployed **(account)**

Deploy the repo to Vercel following `docs/guides/deploy-vercel.md`: `DATABASE_URL` +
`BETTER_AUTH_SECRET` set, migrations run once against that database, `/api/health`
returns `{"status":"ok"}`. Confirm the capability panel on the running deploy reflects
whatever services you did or didn't configure — this is the "boots with nothing, degrades
honestly" promise made visible, not just asserted in CI. Update the README's "Live demo"
link once it's up.

## 5. GitHub repo settings **(account)**

- [ ] Settings → General → **Template repository** checkbox is **off**. The npm
      installer is the only supported distribution door — see ADR-0005 — so "Use this
      template" is not an adoption path and must not look like one.
- [ ] Repo description and topics set (e.g. `nextjs`, `typescript`, `drizzle`,
      `postgres`) so the repo is discoverable.
- [ ] Repo visibility is public.

## 6. Tag, capture the lockfile, then publish via the Release workflow

Both packages publish together, in lockstep — this is the distribution door the rest of
this checklist builds toward (see
`docs/superpowers/specs/2026-08-22-npx-installer-design.md` §6–§8). Publishing happens
**only** via the Release workflow (`.github/workflows/release.yml`) — there is no local
`npm publish` step in this checklist.

- [ ] `packages/create/package.json` (published as `fabulous-factory`) and the
      `create-fabulous-factory` alias package carry the **same version number**. Bump
      both together — never publish one without the other.
- [ ] `git tag vX.Y.Z && git push origin vX.Y.Z`, where `X.Y.Z` matches the version just
      bumped above. The tag push triggers the `scaffold-and-check` CI job: it runs the
      installer CLI with `--yes` into a temp dir, `pnpm install`s the output, then runs
      the _output's own_ `pnpm check` and the minimal boot (migrate + `/api/health`) —
      this is what validates what adopters actually receive. Confirm it's green before
      continuing.
- [ ] **Manually** download that run's `captured-lockfile-demo` artifact and commit it as
      `presets/demo/pnpm-lock.captured.yaml`. Nothing automates this step — the Release
      workflow's `verify` job only warns (doesn't fail) when this file is missing, so it's
      easy to skip by accident. Skipping it means the published templates ship with no
      lockfile.
- [ ] `prepack` runs the compose step and regenerates `templates/<preset>/` fresh into
      each package's tarball (`templates/` is gitignored and never hand-edited) — this
      runs automatically as part of the Release workflow's publish job, not as a separate
      manual step.
- [ ] Dispatch the **Release** workflow with `dry_run` left at its default (`true`)
      first. Use the dry run to verify that pnpm has rewritten
      `create-fabulous-factory`'s `workspace:*` dependency on `fabulous-factory` to the
      concrete version being published — that's the one thing a dry run can catch that a
      later real publish can't undo. Once it looks right, dispatch again with
      `dry_run: false` for the real publish.

**(account)** Requires npm publish access to both package names (the workflow publishes
using a repo-level `NPM_TOKEN` secret).

## 7. Announce

Announce wherever you're launching — the tag and both npm packages are already published
by this point (§6). The `release-template` skill covers the mechanical gate/scaffold-and-
check/tag/lockfile-capture/publish sequence that should already be green by the time you
reach this step — this checklist is the broader "is it actually public-ready" pass
around it.
