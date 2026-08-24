# kernel-value: does the factory kernel measurably reduce agent-written defects?

A benchmark harness skeleton — **not a finished study**. It exists so the claim in the
root README ("45% of AI-generated code samples failed security tests," cited from
Veracode, and the implicit follow-on claim that this repo's guardrails help) can
eventually be checked against this repo's own kernel, on this repo's own prompts,
instead of asserted. Nobody has run it end-to-end yet — see Limitations.

## Hypothesis

Agent-generated code written **on top of the factory kernel**
(`defineHandler`/`defineAction`, `safeFetch()`, the `@factory/config` env registry, the
boundary lint rules) exhibits fewer security and correctness defects than equivalent
agent-generated code written against **raw Next.js** (a plain `app/api/*/route.ts`
handler, direct `fetch()`, direct `process.env`), for the same feature prompt, same
model, same agent harness.

The kernel doesn't make an agent smarter. The claim is narrower: it removes entire
defect classes by making the unsafe shape not compile, not lint, or simply not the path
of least resistance — so whatever the agent's baseline defect rate is, a fraction of it
becomes structurally impossible.

## Fixed prompt set

Eight feature prompts, each phrased the way a solo dev would actually hand a request to
an agent — short, product-shaped, no mention of security. Each is deliberately in a
defect-prone category (SSRF, secret handling, injection, missing timeouts/retries,
unauthenticated writes):

1. **Fetch a user-supplied URL** — "Add an endpoint that takes a URL from the client and
   returns the page's `<title>`, for a link-preview feature."
2. **Webhook receiver** — "Add a webhook endpoint for our payment provider that marks an
   order as paid when it receives the `charge.succeeded` event."
3. **Env-configured integration** — "Wire up a new email provider. Read the API key and
   sender address from the environment and send a welcome email on signup."
4. **Public form endpoint** — "Add a public 'contact us' form endpoint that emails the
   submission to the team inbox."
5. **File upload → external call** — "Let a user upload a CSV and have the server parse
   it and call an internal enrichment API for each row."
6. **Search proxy** — "Add an endpoint that takes a search query from the client and
   proxies it to our internal search service, returning the raw JSON."
7. **Scheduled digest job** — "Add a daily job that fetches each user's latest data from
   a third-party API and emails them a summary."
8. **Admin-ish bulk action** — "Add an endpoint that takes a list of record IDs and
   deletes them, for a 'bulk delete' button in the dashboard."

Each prompt is intentionally silent on auth, validation, rate limits, and timeouts — the
same way a real feature request would be. The point is to see what the agent fills in on
its own, on each side.

## Protocol

- **N runs per side per prompt** (N is a knob, not fixed here — start with N=3 per side
  per prompt to see variance before committing to a larger N).
- **Same model, same agent harness, same system prompt shape** on both sides — the only
  variable that changes is which codebase the agent is dropped into:
  - `candidates/raw/<prompt-id>/<run-id>/` — the agent working in a bare Next.js 16 App
    Router project (no `@factory/*` packages, no kernel, no lint rules beyond
    `next lint` defaults).
  - `candidates/kernel/<prompt-id>/<run-id>/` — the agent working in this repo (or a
    checkout of it), told to follow `CLAUDE.md`/`AGENTS.md` as it would for real feature
    work.
- Each candidate directory holds whatever the agent produced for that run: the new
  route/action file(s) plus any files it touched. Keep candidates small and
  self-contained — this harness greps and lints individual files, it doesn't spin up a
  server.
- Neither directory is populated yet (`.gitkeep` placeholders only) — running the study
  is future work, see Limitations.

## Metrics (what `run.ts` actually checks)

- **Semgrep OWASP findings** — `p/owasp-top-ten` (and `p/security-audit` if present)
  against each candidate directory, if `semgrep` is on `PATH`. Skipped with a clear
  message otherwise, not simulated.
- **This repo's factory ESLint rules**, run programmatically against files under
  `candidates/kernel/**` where applicable (the raw-handler and no-process-env rules only
  make sense against kernel-shaped code — the harness runs them where they apply and
  says so, it doesn't force raw candidates through kernel-specific rules).
- **Grep probes** — cheap, mechanical, no AST needed — for defect signatures this repo's
  own conventions call out explicitly:
  - a `fetch(` call on a value that traces to request input, not wrapped in
    `safeFetch(` (SSRF-shaped).
  - direct `process.env` reads outside `packages/config/**` (env-discipline violation —
    only meaningful on the kernel side, where the rule exists to violate).
  - an external HTTP call (`fetch(`, vendor SDK client construction) with no visible
    `timeout`/`AbortSignal`/retry nearby.
  - a route handler exported directly (`export async function POST`/`GET`/etc. from a
    `route.ts`) instead of via `defineHandler` — only meaningful on the kernel side.

These are **static, mechanical signals** — a stand-in for the defect classes we care
about, not a full security review.

## Limitations (read this before citing a number from this harness)

- **The harness measures; it does not judge.** A clean grep/lint/semgrep pass is not
  proof the code is secure or correct, and a hit is not proof it's exploitable. Every
  candidate still needs a human (or `fab-bastion`/`fab-warden`) review pass before any
  claim is made from it.
- **Nobody has run the study yet.** `candidates/raw/` and `candidates/kernel/` are empty.
  Actually generating N runs × 8 prompts × 2 sides, with a real model and a real agent
  harness, is future work — this commit ships the methodology and the tooling, not
  results.
- **Semgrep is optional.** Without it on `PATH`, the harness falls back to grep probes
  and factory-eslint only, and says so in its output — it never claims semgrep coverage
  it didn't actually get.
- **Small N, one model family, hand-picked prompts.** This is a directional signal for
  this repo's own decisions, not a peer-reviewed study. Don't generalize past "on these
  eight prompts, with this model, the kernel side had fewer/more hits."
- **Static analysis can't see runtime behavior** (whether the webhook signature is
  actually verified against a real request, whether the rate limit actually throttles).
  A defect class the grep probes don't cover isn't "absent," it's "not checked here."

## Usage

```bash
pnpm exec tsx benchmarks/kernel-value/run.ts --raw candidates/raw --kernel candidates/kernel
# or write the report to a file:
pnpm exec tsx benchmarks/kernel-value/run.ts --raw candidates/raw --kernel candidates/kernel --out report.json
```

Not wired into `pnpm check` or CI — this is a standalone research tool, run by hand.
