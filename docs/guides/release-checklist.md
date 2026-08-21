# Release checklist

For maintainers of the **template repo itself**, cutting it loose as a public "Use this
template" starting point. Not for adopters shipping a product built from it — that's
`.factory/handoff/skills/pre-ship-check`, gated by the adopter-facing `LAUNCH.md`
staged at `.factory/handoff/LAUNCH.md`. This guide and that checklist are two different
things: this one is about releasing the template; `LAUNCH.md` is about shipping a
product built from it.

Steps marked **(account)** need credentials this repo can't hold (Vercel, GitHub) and
can't be automated by an agent running inside it — do them yourself, then come back.

## 1. Repo hygiene

- [ ] `LICENSE` present (MIT, current copyright holder) and `CONTRIBUTING.md` present —
      both already linked from the README badges.
- [ ] README badges are true: license badge matches `LICENSE`, the Conventional Commits
      badge matches `commitlint.config.mjs`, the stack badges (Next.js/TypeScript/
      Postgres/Drizzle) match `package.json`/`tsconfig.base.json`.
- [ ] The "Use this template" and "Open in Codespaces" README links point at the real
      `OWNER/REPO`, not the `OWNER/REPO` placeholder.
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

- [ ] Settings → General → **Template repository** checkbox enabled (this is what makes
      "Use this template" work for adopters).
- [ ] Repo description and topics set (e.g. `nextjs`, `typescript`, `template`,
      `drizzle`, `postgres`) so the repo is discoverable.
- [ ] Repo visibility is public.

## 6. Tag and announce

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Then announce wherever you're launching. The `release-template` skill covers the
mechanical gate/manifest/quickstart re-check that should already be green by the time you
reach this step — this checklist is the broader "is it actually public-ready" pass around
it.
