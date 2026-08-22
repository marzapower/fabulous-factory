# fabulous-factory-app

A product scaffolded with [fabulous-factory](https://github.com/marzapower/fabulous-factory)
— a Next.js + Postgres micro-SaaS skeleton with structural guardrails for
agent-driven development.

## Quickstart

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

## Deploy

- [`docs/guides/deploy-vercel.md`](docs/guides/deploy-vercel.md)
- [`docs/guides/deploy-docker.md`](docs/guides/deploy-docker.md)
