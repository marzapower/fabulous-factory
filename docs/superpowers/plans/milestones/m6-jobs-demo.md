# Part G — Milestone 6 contracts (jobs + demo loop)

> Written 2026-08-20. "Critique corrections" (G.10) are BINDING and supersede earlier
> text in this file. Product decision locked with the user: verification recovery =
> resend button on the login error (no `sendOnSignIn`).

### G.0 Scope statement

**In:** `packages/jobs` (Inngest v4 client, cron scheduler + per-monitor check worker,
demo check pipeline, serve mount consumed by apps/web); demo domain — `monitors` +
`monitor_events` tables (migration 0003), `defineAction`s (create/delete monitor,
check-now manual fallback), `change-digest` email template, first real call sites for
`track()`/`captureException()` (LLM spans already live); demo UI on the dashboard
(monitors card, add form, event feed, check-now) + login-page resend-verification button
and magic-link affordance; `capabilities.jobs` FINAL semantics (M1's provisional rule
retired); doctor jobs section; boundary/lint updates (inngest confinement, route-mount
allowlist). **Pre-work refactors (orchestrator, from the M5 review follow-ups):**
(a) dependency-cruiser DAG rules rewritten as closed-form allowlists (deny-by-default
for new packages); (b) LLM routing consolidation — the pure routing module moves into
`packages/config`, doctor's fork deleted; (c) doctor enablement hints derived from the
registry (`enables` flag), `SERVICE_VARS` shadow map deleted.

**Explicitly out:** billing gates on monitor count (M7 — a plain constant cap suffices);
Docker/compose jobs profile (M8; self-host note recorded in G.1); true aggregated daily
digest (the demo emails per detected change — "digest" à la spec is declared satisfied
by this, revisit in M10 polish if wanted); Inngest `checkpointing` tuning beyond
defaults (recorded as an M8 deploy-guide item); no new `NEXT_PUBLIC` anything; no
degradation-convention doc (follow-up, M9/M10 docs).

### G.1 Verified library facts (research subagent, 2026-08-20, npm + published dists)

- **`inngest@4.18.1`** (2026-08-13, provenance ✓). v4 — NOT v3: `createFunction` is
  2-arg with `triggers` in options (`{ id, triggers: [{ cron: "TZ=... */15 * * * *" }],
retries: N }`, handler second); `signingKey`/`eventKey`/`isDev` are client options
  (explicit keys — our code never reads process.env); **default mode is cloud** —
  local dev REQUIRES `INNGEST_DEV=1` (or `isDev: true`); `send()` with no key throws at
  call time in cloud mode, POSTs to the dev server (localhost:8288) in dev mode.
  `step.run` returns are `Jsonify`'d — JSON-safe data only. `NonRetriableError` /
  `RetryAfterError` control retries (default 3). Import is side-effect-free (~44 ms
  module eval, no env/network/timers — measured); a static import in packages/jobs is
  therefore acceptable and documented, no dynamic-import ceremony.
- **Serve mount:** `import { serve } from "inngest/next"` →
  `export const { GET, POST, PUT } = serve({ client, functions })` in
  `app/api/inngest/route.ts`. `serve()` never throws at module scope; missing signing
  key rejects requests at request time in cloud mode only; dev mode skips signature
  checks. Degradation-safe to mount unconditionally.
- **Fan-out idiom:** cron fn lists monitors → ONE `step.sendEvent(...)` with an event
  per monitor → event-triggered worker fn per monitor (own run, own retries — one bad
  URL can't fail the batch; spec §5.5's per-item-step requirement satisfied).
- **`@inngest/test@1.0.0`** (provenance ✓, peer inngest ^4, CJS — fine under vitest):
  `new InngestTestEngine({ function, events?, steps? })`, `t.execute()`,
  `t.executeStep(id)`; default ctx mocks all step tools as spies.
- **`diff@9.0.0`** (2026-04-13, zero deps, dual ESM/CJS): `diffLines(a, b)` →
  `{ value, added, removed }[]` — the LLM-disabled fallback. ⚠️ `diff` has NO npm
  provenance on any version ever (acceptable under no-downgrade — never had one);
  logged here as the decision record.
- **`inngest-cli` dev server**: pin `1.41.1` (newer releases fail the 1-day rule at
  plan time); `pnpm dlx`-style usage documented, not a dependency.
- **Better Auth 1.7.1** (verified in installed dist): manual resend =
  `authClient.sendVerificationEmail({ email, callbackURL })`; magic-link client plugin
  `magicLinkClient` from `better-auth/client/plugins`, sign-in via
  `authClient.signIn.magicLink({ email, callbackURL })`. `sendOnSignIn` exists but is
  NOT used (user decision).

### G.2 Declared design decisions (critic to challenge)

1. **DAG:** `jobs` imports config, db, core (safeFetch/untrusted), llm, email,
   analytics, observability. Nothing imports jobs except apps/web. Final order:
   config ← db ← {auth,email,observability,analytics} ← core ← llm ← jobs ← web.
2. **Demo pipeline lives in `packages/jobs/src/demo/`** (clearly-marked demo subtree,
   `make-it-yours` deletes it): both the cron worker and apps/web's check-now action
   call ONE `checkMonitor()`. Generic wiring (`client.ts`, `functions/index.ts`) stays
   demo-free.
3. **`capabilities.jobs` FINAL rule:** `'inngest'` iff (`INNGEST_EVENT_KEY` AND
   `INNGEST_SIGNING_KEY`) OR `INNGEST_DEV` is set; else `'disabled'` — in every mode.
   Retires M1's "dev implies inngest" (wrong under v4's cloud-default: without
   INNGEST_DEV the SDK would throw on send). `INNGEST_DEV` joins the registry (group
   jobs; description: set to `1` to target a local `inngest-cli dev` server). Client
   built with explicit `eventKey`/`signingKey`/`isDev` from `getEnv()`.
4. **Event emission is capability-gated at the call site**: monitor create/delete emits
   nothing; the cron schedule only runs when an Inngest server invokes it; `send()` is
   never called when jobs are disabled (the check-now action calls `checkMonitor`
   directly — no event round-trip, works in every profile).
5. **`checkMonitor(monitorId, deps?)` outcome per state:** fetch page text via
   `safeFetch` (2 MB cap, 15 s timeout) → sha256 → (first check → store hash, event
   kind `'baseline'`); (hash unchanged → update `last_checked_at` only, NO event, **NO
   LLM CALL** — the exit-criterion test); (changed → summary via
   `generate({ quality: 'cheap', maxCostCents: 5, promptId: 'monitor-summary',
context: [untrusted(oldExcerpt), untrusted(newExcerpt)] })` when llm enabled, else
   `diffLines` excerpt (source `'diff'`); event kind `'change'`; `change-digest` email
   to the owner when email enabled; `track("monitor_change_detected")`); (fetch/LLM
   error → event kind `'error'`, `captureException`, rethrow for Inngest retries —
   check-now catches and returns a typed failure envelope instead). `deps` allows
   injecting the fetcher for tests ONLY (safeFetch blocks loopback by design, so
   integration tests inject a plain fetch against a local server; documented seam).
6. **Schema (migration 0003):** `monitors` — id uuid pk defaultRandom, user_id text
   notNull → references user.id (cascade delete), name text notNull, url text notNull,
   last_hash text NULL, last_checked_at timestamptz NULL, created_at timestamptz
   notNull defaultNow. `monitor_events` — id uuid pk defaultRandom, monitor_id uuid
   notNull → monitors.id cascade, kind text notNull ('baseline'|'change'|'error'),
   summary text notNull, source text notNull ('llm'|'diff'|'none'), created_at
   timestamptz notNull defaultNow. Per-user monitor cap: constant `MAX_MONITORS = 20`
   in the create action (M7 replaces with plans).
7. **Cron cadence `*/15 * * * *`** (no TZ prefix — UTC fine for polling).
8. **Route mount** mirrors the Better Auth precedent: `app/api/inngest/route.ts` does
   exactly `export const { GET, POST, PUT } = serve({ client: inngest, functions })`
   with client/functions imported from `@factory/jobs`; ESLint raw-handler rule gains
   this file+callee allowlist; dependency-cruiser confines `inngest` to packages/jobs
   plus `inngest/next` in this one route file (physical-path rule, better-auth style).
9. **UI work runs under the frontend-design skill** (standing user directive): the UI
   agent MUST load it before designing the monitors card/feed/login affordances.
10. **Actions:** `createMonitor` (auth required, input z.object({ name, url: z.url() }),
    rateLimit { name: 'create-monitor', windowSeconds: 60, max: 10 }), `deleteMonitor`
    (auth required, id, ownership-checked), `checkNow` (auth required, id, ownership,
    rateLimit { name: 'check-now', windowSeconds: 60, max: 6 }). All in
    `apps/web/app/dashboard/actions.ts` (`"use server"`).

### G.3 Orchestrator pre-work (BEFORE implementation agents)

1. **Depcruise allowlist rewrite** (M5 follow-up): every `dag-*` rule becomes
   closed-form — `from: ^packages/X/`, `to: { path: "^packages/", pathNot:
"^packages/(allowed…)/" }`; new packages are denied everywhere by default. Jobs
   edges added here once. Each rewritten rule proven by one violation fixture.
2. **Routing consolidation** (M5 follow-up): `Quality`/`RoutingKey`/`TierTable`/
   `ModelsConfig`/`RoutingEnv`/`TIER_ENV_KEY`/`resolveDirectRoutingKey`/`resolveModel`
   move to `packages/config/src/llm-routing.ts` (pure; exported from the server entry
   AND importable by doctor internally). `packages/llm/src/routing.ts` becomes a thin
   re-export + keeps `DEFAULT_MODELS` (models.json stays llm's asset; `resolveModel`
   keeps its explicit `models` param). Doctor's `resolveRoutingKey`/
   `LLM_MODEL_ENV_VARS`/override logic DELETED in favor of the shared module (fs-read
   of the JSONs stays doctor-local). Routing tests move/extend accordingly.
3. **Registry-driven doctor hints** (M5 follow-up): `EnvVarSpec` gains
   `enables?: boolean`; enabling vars marked in the registry; doctor's `SERVICE_VARS`
   derived from the registry (shadow map deleted); registry invariant test extended.
4. Package skeletons + deps (single `pnpm install`): `packages/jobs/package.json`
   (inngest 4.18.1; devDeps @inngest/test 1.0.0, vitest, typescript, tsx, pg/@types/pg
   for integration); apps/web gains `diff@9.0.0` + `@types/diff` if needed; db schema
   files `monitors.ts`/`monitor-event.ts` + migration 0003 via drizzle-kit; boundary
   rules per G.2.8; transpilePackages += @factory/jobs.

### G.4 `packages/jobs` — file manifest (owner: Agent A)

```
packages/jobs/
├── package.json / tsconfig.json / vitest.config.ts   # M5 patterns; server-only stub alias
├── src/
│   ├── client.ts         # inngest = new Inngest({ id: "fabulous-factory", eventKey, signingKey, isDev })
│   │                     #   — all from getEnv()/getCapabilities(); no process.env
│   ├── events.ts         # demo event name + payload type: "demo/monitor.check.requested" { monitorId }
│   ├── functions/index.ts# functions: InngestFunction[] = [monitorCron, monitorCheckWorker]
│   ├── demo/check-monitor.ts  # checkMonitor(monitorId, deps?) per G.2.5; exports CheckOutcome
│   ├── demo/monitor-cron.ts   # cron fn: list monitor ids (db) in step.run → step.sendEvent fan-out
│   ├── demo/monitor-worker.ts # event fn: step.run("check", () => checkMonitor(id)); NonRetriableError on missing monitor
│   └── index.ts          # import "server-only"; exports inngest, functions, checkMonitor, CheckOutcome, MAX_MONITORS
└── test/
    ├── check-monitor.test.ts  # unit: injected fetcher; unchanged-hash → NO llm call (vi.mock @factory/llm,
    │                          #   assert generate NEVER invoked) — THE exit-criterion test; diff fallback
    │                          #   when llm disabled; error path → captureException + event row (mocked db)
    ├── functions.test.ts      # InngestTestEngine: cron emits one event per monitor; worker calls pipeline;
    │                          #   missing monitor → NonRetriableError
    └── integration/demo.test.ts  # advisory-lock idiom (key 4230011); real migrator; local http server +
                                   #   injected fetcher; baseline → change → unchanged sequence asserted in DB
```

### G.5 config + db + email (owner: Agent B — no apps/web, no packages/jobs)

- `capabilities.ts`: final `deriveJobs` per G.2.3 + test matrix rewrite.
- `registry.ts`: add `INNGEST_DEV` (group jobs, enables: true per G.3.3 semantics);
  regenerate `.env.example`.
- Doctor jobs section: enabled → note which mode (cloud keys vs dev server) and the
  `inngest-cli` hint; disabled → hint mentions INNGEST_DEV for local dev.
- `packages/email`: `templates/change-digest.tsx` (props: monitorName, url, summary,
  source 'llm'|'diff'), registry + SUBJECTS entries, render test.
- Owns NOTHING under apps/web or packages/jobs (A/C contracts pinned in prompts).

### G.6 apps/web UI + actions (owner: Agent C — MUST load frontend-design skill)

- `app/dashboard/actions.ts`: the three `defineAction`s (G.2.10) calling `@factory/db`
  queries + `checkMonitor` from `@factory/jobs`.
- Dashboard: monitors card (add form url+name, list with last-checked + check-now +
  delete), feed card (latest 20 `monitor_events` joined to monitor names, kind-badged,
  relative times). Jobs-disabled state: caption on the monitors card ("automatic checks
  off — enable Inngest or use Check now"), driven server-side via `isEnabled('jobs')`.
- Login page (product decision): on Better Auth's EMAIL_NOT_VERIFIED error, show
  "Resend verification email" (authClient.sendVerificationEmail + sent-state feedback);
  magic-link entry (authClient.signIn.magicLink) shown only when the server component
  says `deriveAuthOptions(...).email.magicLink` (prop-drilled, never a client
  capability read).
- `app/api/inngest/route.ts` mount per G.2.8.

### G.7 Boundary/lint updates (orchestrator, in pre-work)

ESLint raw-handler allowlist entry for the inngest route (exact callee `serve`,
destructured GET/POST/PUT); depcruise: `inngest` physical-path rule (packages/jobs +
the route file's `inngest/next` subpath), `diff` confined to apps/web (or the demo
package if the raw-diff falls in jobs — wherever G.2.5 lands it, the rule matches),
`@inngest/test` in jobs tests only; closed-form DAG rules already rewritten (G.3.1).

### G.8 Tests + definition of done

`pnpm check` green in both profiles (minimal: only DATABASE_URL — jobs/llm/email all
disabled paths; full: TEST_DATABASE_URL + dummy service env); the no-LLM-on-unchanged
test present and green (Part A exit criterion); InngestTestEngine suite green;
integration demo sequence green under the advisory lock; boundary fixtures prove every
new/rewritten rule; live verify (orchestrator): Docker Postgres + `PORT=3005 pnpm dev`
→ signup → create monitor (https://example.com) → check-now → baseline event in feed →
second check-now → no new event → delete; login resend + magic-link affordances
smoke-checked (console transport); jobs-disabled caption visible without Inngest env;
`pnpm factory:doctor` jobs section correct in all three states. One Conventional Commit
(`feat: … Milestone 6: …` body), approval-gated.

### G.10 Critique corrections (BINDING — supersede any conflicting Part G text)

Critic verdict 2026-08-20: APPROVED WITH CORRECTIONS. Verified clean by the critic:
G.4's Inngest v4 usage, serve-mount degradation, `monitors.user_id text` ↔ `user.id
text`, safeFetch `timeoutMs`/`maxBytes` options, rateLimit shapes, advisory-lock reuse,
Agent B owning the deriveJobs test rewrite, TEMPLATES/SUBJECTS fit, login prop-drilling
precedent, jobs' static inngest import.

1. **`monitors` gains `last_content text NULL`** — the pipeline's diff fallback and
   old/new LLM context are impossible from a hash alone. Stores the NORMALIZED text
   (corr. 6), capped (corr. 7); `last_hash` = sha256 of that same normalized text.
2. **Per-monitor serialization**: `checkMonitor`'s compare-and-write runs in a
   transaction holding `pg_advisory_xact_lock(hashtext('monitor:' || monitorId))`;
   fetch/normalize happens BEFORE the lock; the compare re-reads `last_hash` inside it
   — a concurrent second-comer sees the updated hash and exits as unchanged (no dup
   events/emails/LLM spend).
3. **apps/web dependency corrections**: apps/web declares `inngest` (route mount
   imports inngest/next — better-auth precedent), `@factory/jobs`, `@factory/db`;
   `transpilePackages` += `@factory/jobs` AND `@factory/llm` (never added in M5, jobs
   pulls llm as TS source). **`diff` is a `packages/jobs` dependency** (the fallback
   lives in checkMonitor) — G.3.4's apps/web placement is superseded.
4. **`packages/auth/src/client.ts` is assigned to Agent B**: add `magicLinkClient()`
   from `better-auth/client/plugins` to `createAuthClient` — without it
   `authClient.signIn.magicLink` is undefined at runtime.
5. **Error events don't multiply by retries**: on the worker path `checkMonitor`
   rethrows WITHOUT writing the `'error'` event; the worker's `onFailure` (runs once,
   post-retries) records the single `'error'` event + `captureException`. check-now
   records its own single failure envelope (no retries).
6. **`normalizeContent()` pinned**: strip `<script>`/`<style>` blocks and all tags,
   collapse whitespace; hash and store THAT (raw HTML with nonces would cry wolf every
   tick). Dynamic-page limitation documented in the module comment.
7. **Caps pinned**: stored `last_content` ≤ 200 KB post-normalization; LLM context =
   changed-line excerpts from `diffLines`, ≤ 2 000 chars per side; feed `summary`
   ≤ 500 chars.
8. **`CheckOutcome` pinned (cross-agent contract, Jsonify-safe)**:
   `{ status: 'baseline' | 'unchanged' | 'changed' | 'error'; summary?: string;
source?: 'llm' | 'diff' }`.
9. **Email throttle decided**: skip the digest email when the monitor's previous
   `'change'` event is younger than 1 hour (`EMAIL_THROTTLE_SECONDS = 3600` beside
   `MAX_MONITORS`); the feed always records.
10. **`enables` is declared EXPLICITLY on every registry entry** (literal-shape rule,
    registry.ts:30-36), like `required`/`secret`.
11. **ESLint allowlist generalized**: a `FRAMEWORK_MOUNTS: Array<{ fileSuffix, callee }>`
    table drives the check and the messages (replacing the hardcoded
    `isAllowlistedAuthRoute`); entries: better-auth route (`toNextJsHandler`), inngest
    route (`serve`).
12. **INNGEST_DEV truthiness pinned**: dev mode iff value is exactly `"1"`;
    `INNGEST_DEV=0` stays cloud; `isDev` passed explicitly to the client.
13. **EMAIL_NOT_VERIFIED detection pinned**: status 403 + error-code check (implementer
    verifies the 1.7.1 client error shape), not message-string matching.
14. **`createMonitor` schema constrains protocol**: http/https at the zod layer
    (bare `z.url()` admits ftp:), so a bad scheme is a validation error, not an
    `'error'` event.
15. **Index on `monitor_events (monitor_id, created_at desc)`** in migration 0003.
16. **Recorded**: jobs' module-scope `new Inngest` + `getEnv()` keeps the C.4
    build-time constraint (valid DATABASE_URL syntax at `next build`) — no new
    constraint; noted in client.ts's comment.

### G.11 Accepted deviations (discovered during implementation)

- **`no-bare-drizzle-outside-db-core` → `...-db-core-jobs`** (orchestrator, pre-spawn):
  the demo pipeline's queries and the per-monitor `pg_advisory_xact_lock` need drizzle's
  query builders against `getDb()` — same rationale as core's rate limiter; the critic's
  split missed this collision. `drizzle-orm` is a runtime dep of packages/jobs.
- **G.10.2 refined to compare-and-CLAIM**: the advisory-locked transaction does
  lock → re-read → compare → hash/content swap ONLY; summary generation, the 'change'
  event, email, and track run AFTER commit (an LLM network call must never hold the
  lock). Single-writer property preserved: a concurrent checker sees the claimed hash
  and exits `unchanged`.
- **`CheckOutcome` narrowed**: `checkMonitor` returns only baseline|unchanged|changed
  and THROWS on failure without writing events; G.10.8's `'error'` member is assembled
  by the check-now action layer (and the worker's `onFailure`) — G.10.5 implied this.
- **LLM summary failure does not fail the check**: falls back to the diff summary +
  `captureException` (G.2.5's rethrow applies to fetch errors only).
- **`captureException`/`captureMessage` are now never-throw** (observability): the M5
  review fix had them calling `getCapabilities()` bare, which re-throws
  EnvValidationError on a broken env — error reporting inside a caller's catch block
  must never be a second error source. Caught by the jobs baseline run.
- **Email throttle reads the previous 'change' event BEFORE inserting the new one**
  (Agent A) — the only unambiguous reading of G.10.9.
- **`zod` added to apps/web dependencies** (Agent C, authorized scope exception):
  actions.ts imports it directly; it was never a declared dep of the app. Lockfile
  impact verified minimal (4.4.3 already resolved in the workspace).
- **Agent B cleanups**: dead `mode` params dropped from `deriveJobs`/`printServiceLine`
  (the final rule is mode-independent); a generic render helper in the email template
  test (TemplateName-wide indexing stopped typechecking once template prop shapes
  diverged).
- **`deps.fetcher` adapter cast** in check-monitor.ts: safeFetch returns undici's
  `Response` (structurally ≠ ambient `Response`); one documented cast at the adapter,
  not at call sites.
- **pnpm scaffolding incident**: the failed first install wrote a placeholder
  `protobufjs: set this to true or false` line into pnpm-workspace.yaml (invalid YAML);
  replaced with an explicit `protobufjs: false` (postinstall is version-stamping only;
  the OTel deps needing it are lazily imported by inngest).

### G.12 Independent review outcome (M6 cycle, post-gates)

`/code-review high` returned 10 findings (3 CONFIRMED by adversarial verifiers, 7
PLAUSIBLE — their verifiers stalled, but each was independently surfaced by 2–3 finder
angles). ALL TEN FIXED in the same cycle:

1. Change-event atomicity: the feed 'change' row is inserted INSIDE the claim
   transaction (diff summary), the LLM result is a post-commit UPDATE of that row — a
   transient post-claim failure can no longer convert a detected change into silence via
   retry ("the feed never lies").
2. INNGEST_DEV hardening: ignored in production at the capability layer AND `isDev`
   gated on the capability in the jobs client — a stray dev flag can never flip the
   mounted /api/inngest route into signature-skipping dev mode; doctor warns.
3. HTTP error pages are never hashed as content (`response.ok` check → error path).
4. Stale-fetch guard: a check whose fetch predates the last committed check bails as
   'unchanged' — old content can never claim over newer.
5. Hydration-safe relative time (label computed server-side, prop-drilled).
6. Login resend-state reset on re-submit.
7. MAX_MONITORS enforced atomically inside createMonitorRow (advisory-locked tx).
8. `monitors_user_id_idx` (migration 0004) — FK-index convention restored.
9. Column projections: `last_content` (200KB) read only on the changed branch;
   list/ownership queries project narrow shapes (`MonitorListItem`, ownership view).
10. Doctor warns when an `LLM_MODEL_*` override's format mismatches the active profile.

**Declared, NOT fixed (nits/follow-ups on record):** cron fan-out sends all monitor
events in one `step.sendEvent` (chunking needed only near ~100k global monitors — but
it's the showcase idiom, chunk it in M10 polish); `setPending(false)` before
`router.refresh()` briefly re-enables buttons against stale data in two components; the
cleanup cluster (client-side mirror of `CheckNowResult`, ad-hoc MONITOR_NOT_FOUND error
shape, doctor's registry-order-coupled hint phrasing + hand-kept QUALITIES list). The
review's removed-behavior audit verified all three pre-work refactors preserve prior
behavior.

Final gates after fixes: full profile 359/359; minimal profile 346 passed + 13 skipped
(4 visible skip notices); migration 0004 index confirmed in Postgres; both new doctor
guards verified live.
