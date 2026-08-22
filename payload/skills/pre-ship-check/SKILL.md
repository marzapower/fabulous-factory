---
name: pre-ship-check
description: The final gate before shipping to production — checks LAUNCH.md, flips the stage, runs preflight, resolves every blocker, and confirms full gates are green. Use when you believe the product is ready to deploy for real.
---

# Pre-ship check

## Phase 0 — LAUNCH.md gate

Open `LAUNCH.md` at the repo root. Every item marked `blocks launch` must be ticked
(`[x]`) before you proceed past this phase:

- For each unchecked `blocks launch` item that is **not** 🔒: verify every bullet under
  its "Done means" against actual repo state, then tick it yourself.
- For each unchecked `blocks launch` item that **is** 🔒: request explicit human
  confirmation, record who confirmed and when on the item's Signed off line, then tick
  it. Never tick a 🔒 item on your own judgment.
- Also surface any open 🔒 item that does **not** block launch (e.g. Plans catalog) to
  the human with a recommendation — it doesn't gate this phase, but it shouldn't ship
  silently either.

Do not proceed to Phase 1 while any `blocks launch` item remains unchecked.

## Phase 1 — Flip the stage

Edit `.factory/config.json`:

```json
{ "stage": "production" }
```

This changes `pnpm preflight` from advisory to blocking.

## Phase 2 — Run preflight

```bash
pnpm preflight
```

In production stage, preflight blocks only on mechanical env/pointer checks — not on
`LAUNCH.md` items, which you already gated in Phase 0. Resolve every failure it lists,
in order: a `STRIPE_SECRET_KEY` still starting with `sk_test_` (swap to a live key in
`enable-billing`), or `CLAUDE.md`/`AGENTS.md` no longer containing the literal pointer
`docs/agents/conventions.md`. The email-disabled warning ("auth runs without email
verification") is non-blocking at every stage — a deliberate trade-off, not a bug;
decide if it's acceptable for launch and move on either way.

## Phase 3 — Full gates

```bash
pnpm check
```

Lint, boundaries, format, typecheck, tests — all green. Not "mostly green," not "green
except that one flaky test."

## Phase 4 — Deploy

Pick Vercel or Docker (both first-class, identical code). Follow the dedicated
step-by-step guide for your path: `docs/guides/deploy-vercel.md` (connect repo, set
`DATABASE_URL` + `BETTER_AUTH_SECRET`, run migrations yourself before each deploy — no
release-phase job) or `docs/guides/deploy-docker.md` (multi-stage build, compose
profiles for jobs and local LLM, migrations as a separate release-phase job, never the
app entrypoint).
