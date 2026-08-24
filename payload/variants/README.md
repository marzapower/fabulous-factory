# fabulous-factory-app

A product scaffolded with [fabulous-factory](https://github.com/marzapower/fabulous-factory)
— a Next.js + Postgres micro-SaaS skeleton with structural guardrails for
agent-driven development.

## Quickstart

Requires Node >= 24 — enforced by `engine-strict=true` in `.npmrc`, so `pnpm install`
refuses on anything older.

```bash
cp .env.example .env
# set DATABASE_URL and BETTER_AUTH_SECRET in .env — everything else is optional
pnpm install     # skip if the installer already ran this for you
pnpm dev         # migrations self-apply; you're running
```

## Graceful degradation

The required baseline is `DATABASE_URL` + `BETTER_AUTH_SECRET`. Every other service
(billing, LLM, email, jobs, analytics, error tracking) is optional and resolved at
request time — an unset var makes its feature step aside politely, it never breaks an
unrelated one.

## Definition of done

`pnpm check` green — lint, boundaries, format, typecheck, tests.

## What's next

- `PRODUCT.md` — say what this product actually is; agents derive specs from it.
- `LAUNCH.md` — what's left before this is production-ready. Run
  `pnpm factory:status` to render it, or just ask your agent: _"what's left to make
  this mine?"_
- `pnpm factory:sync` — pulls kernel and lint-rule fixes forward from a newer
  fabulous-factory release into this repo via a three-way merge. It shells out to `npm`
  and `tar` to fetch the packed release, so both need to be on your `PATH`.

## Deploy

- [`docs/guides/deploy-vercel.md`](docs/guides/deploy-vercel.md)
- [`docs/guides/deploy-docker.md`](docs/guides/deploy-docker.md)

There's no one-click Deploy button in this README — a clone-URL button has to point at
_your_ repo, not the factory's, so we can't template one. `deploy-vercel.md` documents the
`root-directory`/`env` query params it relies on; once your repo is on GitHub, build your
own button from that doc and drop it in here.
