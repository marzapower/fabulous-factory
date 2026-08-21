# Part K — M10 Polish + distribution

**Milestone:** M10 (spec §13, master plan Part A row M10 + accumulated debts).
**Process note:** lighter cycle by explicit user decision (2026-08-21, "much less
reviews, it's not a complex task"): no adversarial critique round, orchestrator diff
review instead of an independent Opus reviewer. Gates and live verify unchanged.

## K.1 Scope

1. **LICENSE** (MIT, copyright 2026 Daniele Di Bernardo) + **CONTRIBUTING.md** — both
   are already linked from README badges (M9 J.11 debt).
2. **docs/guides/**: `deploy-vercel.md`, `deploy-docker.md`, `llm-evals.md`,
   `graceful-degradation.md` (the degradation-convention doc owed since M4). All
   grounded in real repo state (Dockerfile/compose/CI/registry/llm package) — no
   invented commands.
3. **Launch checklist**: `docs/guides/release-checklist.md` (renamed from
   `launch-checklist.md` post-M10; live demo deploy, GitHub
   template flag, badges truthful, quickstart re-verified); `release-template` skill
   gets a pointer line to it.
4. **README final pass**: guides bullet becomes true, quickstart + claims re-verified.
5. **Cron fan-out chunking** (M6 debt): `monitor-cron.ts` sends `MONITOR_CHECK_EVENT`s
   in chunks of 500 per `step.sendEvent` (ids `fan-out-checks-0`, `-1`, …); pure
   `chunk()` helper exported and unit-tested.
6. **Dunning UX surfacing** (M7 debt): `Entitlement` gains `pastDue: boolean` (winner
   row `status === "past_due"`; `false` for disabled/free). Billing card renders a
   warning strip ("payment past due — update your payment method") + the existing
   `ManageSubscriptionButton` when `pastDue`. Contract tests updated.
7. **Degradation-matrix test**: `packages/config/test/degradation-matrix.test.ts` —
   declarative matrix: baseline env only → every service `disabled`; each service's
   enabling var(s) present alone → exactly that service lights up, all others stay
   disabled; full env → all adapters on. Uses the same env-object style as
   capabilities.test.ts.

Explicitly excluded / recorded decisions:

- `billing_events.created_at` index: SKIPPED — dedupe lookups are by PK; the index
  only matters at event-history scale a template never reaches; adopters can add a
  migration when it does. Zero migrations in M10.
- Live demo deploy + GitHub "template repository" flag + repo topics: USER ACTIONS
  (require Vercel/GitHub accounts) — sequenced in the launch checklist, not automated.
- No new dependencies, no schema changes, no guarded zones (billing package `src/` is
  NOT guarded; `entitlement.ts` change is additive).

## K.2 Worker split

- **Worker CODE**: `packages/jobs/src/demo/monitor-cron.ts` (+ its test file),
  `packages/billing/src/entitlement.ts`, `apps/web/components/billing/billing-card.tsx`,
  `packages/billing/test/*` (entitlement tests), `apps/web/app/dashboard/page.tsx` ONLY
  if the card needs a new prop threaded (it should not — `entitlement` is already
  passed), `packages/config/test/degradation-matrix.test.ts`.
- **Worker DOCS**: `LICENSE`, `CONTRIBUTING.md`, `docs/guides/*` (5 files), `README.md`,
  `.claude/skills/release-template/SKILL.md` (pointer line only).
- Orchestrator: this file, master-plan index row, post-merge `pnpm factory:manifest`
  (README is a hashed ledger item), diff review, gates both profiles, live verify.

## K.3 Live verify

1. Gates green both profiles (minimal + TEST_DATABASE_URL full).
2. Clean-tree quickstart: rsync copy (minus `.env*`/`.git`/`node_modules`), real
   `pnpm install`, `.env` with only `DATABASE_URL` + `BETTER_AUTH_SECRET`, predev
   migrations against Docker Postgres, boot on :3005, `/` + `/api/health` 200,
   capability panel reports all optional services disabled.
3. `pnpm factory:manifest --check` green after the README edit is re-hashed.

## K.4 Cycle record

- Lighter process per user decision: no critique round; orchestrator diff review in
  place of an independent reviewer (all guide claims spot-verified against source —
  the docs worker itself caught and fixed a false README claim about Vercel preview
  deploys; the code worker caught an Inngest test-harness pitfall where unmocked
  `step.sendEvent` silently call-through-fails after the first chunk).
- Gates: minimal 529 passed + 17 skipped, full 546/546 (+16 tests over M9).
- Live verify: clean-tree quickstart (rsync minus `.env*`/`.git`, real install,
  `.env` = baseline only) → predev migrations ran, `/api/health` ok, `/` and
  `/signup` 200, capability panel showing every optional service disabled;
  `factory:manifest --check` green after the README re-hash.
- User actions remaining (launch checklist): Vercel live demo deploy, GitHub
  template-repository flag + topics, v1 tag.
