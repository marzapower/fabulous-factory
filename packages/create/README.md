# fabulous-factory

Scaffold a new product repo from the [Fabulous Factory](https://github.com/marzapower/fabulous-factory) template — a Next.js starter built for agent-driven development, where the repository enforces the rules your agents can't be trusted to remember.

## Usage

```bash
npx fabulous-factory@latest install
# or
pnpm create fabulous-factory
```

The installer walks you through picking a **preset** — a product shape — and scaffolds a repo that's already yours: common infrastructure, your chosen app, and your agent's instruction set, all installed.

Three presets ship:

- **Fabulous Untangle** — a full working micro-SaaS: paste messy text, get it captured, normalized, and turned into a daily plan.
- **Fabulous Nothing** — a blank slate: homepage, capability pages, auth, and an empty dashboard, with no example domain to rip out.
- **Fabulous Brainstorm Chat** — a per-user project brainstormer: an LLM chat that streams prose and proposal cards onto an Ideas/Features/Notes board.

Once scaffolded:

```bash
cd my-saas
cp .env.example .env
openssl rand -hex 32       # → paste as BETTER_AUTH_SECRET in .env
# set DATABASE_URL too, then:
pnpm dev                   # migrations self-apply; you're running.
```

Stack: Next.js 15 (App Router) · TypeScript strict · Postgres · Drizzle · Tailwind + shadcn/ui · pnpm workspaces. Billing, LLM, email, jobs, and analytics are all optional and light up later via env vars.

## Learn more

See the [main repository](https://github.com/marzapower/fabulous-factory) for full documentation, guardrails, and the design specs behind the installer.

## License

MIT
