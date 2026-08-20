# Part F — Milestone 5 contracts (LLM gateway)

> Extracted 2026-08-20 from `2026-08-20-master-plan.md` (single-file plan split per-milestone).
> Part A (milestone map + cross-milestone invariants) stays in the master plan.
> "Critique corrections" subsections are BINDING and supersede earlier text in this file.

### F.0 Scope statement

**In:** `packages/llm` — `generate()` gateway on the Vercel AI SDK; profile resolution
(`local`/`openrouter`/`direct`) from the existing `capabilities.llm`; quality-tier routing
(`cheap | balanced | high`, spec §5.4) as pure JSON config + env overrides; `pricing.json`
cost estimation; `maxCostCents` pre-call refusal; unknown-model graceful degradation;
typed `LlmDisabledError`; per-call usage accounting persisted to a new `llm_calls` table
(migration 0002); OTel span per call via `@factory/observability`'s tracer; `Untrusted`
brand consumption (prompt fencing); doctor llm-section extensions; new registry vars
(`LLM_MODEL_CHEAP/BALANCED/HIGH`); boundary rules confining the AI SDK to `packages/llm`.

**Explicitly out (excluded impacts):** no UI (the "configure a model provider" states are
M6 demo surface — and per standing directive any UI work runs through the frontend-design
skill); **no streaming API** in the v1 gateway (declared: `generate()` is
request/response; the demo's job-side summary needs no stream — a `stream()` sibling is a
recorded follow-up, not scaffolded); no prompt registry/evals (guide, M10); no Langfuse or
OTel exporter wiring (guide, M10); no rate limiting inside the gateway (`defineHandler`
owns limits at the call site); no changes to `deriveCapabilities` (M1 rules stand); no
global spend caps (per-call `maxCostCents` only — a ledger over `llm_calls` is adopter
territory); jobs/demo call sites are M6.

### F.1 Verified library facts (research subagent, 2026-08-20, npm + installed .d.ts)

- **`ai@7.0.68`** is the pin (v7 is current stable; 7.0.69+ are <1 day old and rejected by
  `minimumReleaseAge`). ESM-only, Node ≥22, zod peer `^3.25.76 || ^4.1.8` (repo zod 4.4.3
  ✓), SLSA provenance ✓. v5→v7 tripwires: `system`→`instructions` (old name deprecated);
  `generateObject` deprecated → `generateText({ output: Output.object({ schema }) })`,
  result in `res.output`; usage fields are ALL `number | undefined`
  (`usage.{inputTokens,outputTokens,totalTokens}`, details nested); errors detected via
  static `.isInstance(err)` (`APICallError`, `RetryError`, `NoOutputGeneratedError`, …);
  `maxRetries` (default 2), `abortSignal`, `timeout: number | granular object` supported.
- **Providers** (all zod-4-compatible, provenance ✓): `@ai-sdk/anthropic@4.0.39`
  (`createAnthropic({ apiKey })`), `@ai-sdk/openai@4.0.43` (`createOpenAI({ apiKey })`),
  `@ai-sdk/openai-compatible@3.0.31` (`createOpenAICompatible({ name, baseURL,
includeUsage: true })` — the local/Ollama idiom; local servers may omit usage fields),
  `@openrouter/ai-sdk-provider@3.0.0` (first-party, peer `ai ^7.0.0`;
  `createOpenRouter({ apiKey }).chat(id)`; surfaces **actual cost** in
  `providerMetadata.openrouter.usage.cost` (USD) — usage accounting is always-on per
  current OpenRouter docs).
- **Telemetry**: v7 moved OTel out of core into `@ai-sdk/otel`, which **exact-pins `ai`**
  per release train. Decision F.2.5: we do NOT take that dependency.
- **Model IDs / prices verified 2026-08-20** (per 1M tokens in/out): anthropic direct
  `claude-haiku-4-5` $1/$5, `claude-sonnet-4-6` $3/$15, `claude-opus-5` $5/$25 (all
  first-party confirmed); openai `gpt-5.6-luna` $0.20/$1.20, `gpt-5.6-terra` $2/$12,
  `gpt-5.6-sol` $5/$30 (aggregator-sourced, medium confidence — sol price conflicted on
  one source; prices rot by design, pricing.json is the adopter-editable fix, spec §5.4);
  OpenRouter ids use dots (`anthropic/claude-haiku-4.5`, `anthropic/claude-sonnet-4.6`,
  `anthropic/claude-opus-5`).

### F.2 Declared design decisions (critic to challenge)

1. **DAG position**: `llm` imports `@factory/config`, `@factory/db` (accounting rows),
   `@factory/observability` (tracer), and `@factory/core/untrusted` (new subpath export —
   see 2). Nothing imports `llm` yet (apps/web + jobs do in M6). `core` must NOT import
   `llm` (new boundary rule). Resulting order: config ← db ← {auth,email,observability}
   ← core ← llm ← web.
2. **`@factory/core` gains an exports subpath** `"./untrusted": "./src/untrusted.ts"`
   (orchestrator pre-work). Rationale: `llm` needs `Untrusted`/`isUntrusted` at runtime,
   and importing core's `"."` entry would drag `define-handler` → `next` + `@factory/auth`
   into `llm`'s runtime graph for one pure 27-line module. Core's `"."` re-exports are
   unchanged. `untrusted.ts` has no `server-only` poison — acceptable: it is pure data
   wrapping, harmless anywhere.
3. **Vendor loading**: provider packages (`@ai-sdk/*`, `@openrouter/*`) are loaded via
   guarded dynamic `import()` ONLY on their active profile branch (M4 email pattern);
   the disabled path throws `LlmDisabledError` before any provider loads (test-asserted
   via module-registry check). The vendor-neutral `ai` core is a static import (like
   drizzle's query builders in core — no I/O without a provider).
4. **Provider/model memoization**: resolved provider instances memoized per process
   keyed by profile; routing table resolved per call (cheap — reads memoized env).
5. **Telemetry = one hand-authored span per call**, emitted with
   `tracer.startActiveSpan("llm.generate", …)` from `@factory/observability`, carrying
   gen_ai semconv-style attributes (`gen_ai.operation.name`, `gen_ai.request.model`,
   profile, quality, `promptId`, input/output tokens, cost cents, error code on failure).
   `@ai-sdk/otel` is deliberately NOT used in v1: its exact-pin coupling to `ai` fights
   the template's supply-chain policy and maintenance stance (§13), and spec §5.4 only
   promises "emits OpenTelemetry spans". Recorded follow-up in the M10 observability
   guide. `packages/llm` therefore imports `@opentelemetry/api` directly for
   `SpanStatusCode`/attribute types — the existing boundary rule's `from` gains
   `^packages/llm/` exactly as its M5 comment anticipated.
6. **Cost model**: integer-ish cents as `numeric` — column `cost_cents numeric(14,6)`
   (fractions of a cent are the norm). Sources: `openrouter` profile prefers the
   provider-reported USD cost (`cost_source='reported'`); otherwise `pricing.json`
   estimate (`'estimated'`); model absent from pricing.json → cost NULL,
   `'unknown'` (spec: call allowed, doctor warns); `local` profile → cost 0,
   `'estimated'` (free local inference; pricing.json is never consulted).
7. **`maxCostCents` pre-check heuristic** (declared): estimated input tokens =
   `ceil(totalPromptChars / 4)`, estimated output tokens = `maxOutputTokens` option
   (default 1024). Over budget with a KNOWN model → `LlmBudgetExceededError` before any
   provider call; unknown model → no estimate possible → allowed (spec §5.4). The
   post-call recorded cost uses REAL usage numbers.
8. **Accounting write is awaited but fail-open** (serverless-safe: fire-and-forget loses
   rows on function freeze): insert into `llm_calls` wrapped in try/catch +
   `console.error` — accounting must never break the caller. Failed generations are
   recorded too (`ok=false`, `error_code`), with NULL usage/cost.
9. **Routing config lives in `packages/llm/models.json`** (profile × tier → model id;
   `direct` split into `direct-anthropic`/`direct-openai` — key presence picks the
   sub-table, ANTHROPIC first, matching `hasCredentialsFor`). Env overrides
   `LLM_MODEL_CHEAP/BALANCED/HIGH` (new registry vars) replace the routed id for the
   ACTIVE profile only. This is spec §5.4's "pure configuration (env/JSON), never code".
10. **Doctor reads `packages/llm/{models,pricing}.json` via `fs` + JSON.parse** (path
    resolved from the script's own location), NOT via import — `packages/config` is the
    DAG root and must not gain an import edge to `llm`. Missing/unparseable files degrade
    to a warning line, never a crash.
11. **Defaults**: `maxRetries: 2` (SDK default, bounded per spec), `timeoutMs` default
    60000 (local models are slow), both per-call overridable. `local` tier defaults all
    map to `llama3.2` (adopters override by editing models.json or env).

### F.3 `packages/db` additions (orchestrator pre-work, D.3 pattern)

- `src/schema/llm-call.ts`: table `llm_calls` — `id` uuid pk `defaultRandom()`,
  `created_at` timestamptz notNull `defaultNow()`, `prompt_id` text NULL, `profile` text
  notNull, `model` text notNull, `quality` text notNull, `input_tokens` integer NULL,
  `output_tokens` integer NULL, `cost_cents` numeric(14,6) NULL, `cost_source` text
  notNull (`'reported' | 'estimated' | 'unknown'`), `latency_ms` integer notNull, `ok`
  boolean notNull, `error_code` text NULL. Exported from `schema/index.ts`.
- Migration `0002_*` via drizzle-kit, checked in. No `getDb()` API changes.

### F.4 `packages/llm` — file manifest and contracts

```
packages/llm/
├── package.json          # "@factory/llm"; exports ".": src/index.ts
│                         # deps: @factory/{config,db,core,observability} workspace:*,
│                         #   ai 7.0.68 (EXACT pin, F.1), @ai-sdk/anthropic 4.0.39,
│                         #   @ai-sdk/openai 4.0.43, @ai-sdk/openai-compatible 3.0.31,
│                         #   @openrouter/ai-sdk-provider 3.0.0, @opentelemetry/api ^1.9.1,
│                         #   drizzle-orm ^0.45.2 (insert builder against getDb()),
│                         #   server-only, zod ^4.4.3
├── tsconfig.json / vitest.config.ts   # M4 patterns; server-only alias stub
├── models.json           # { local: {cheap,balanced,high}, openrouter: {...},
│                         #   "direct-anthropic": {...}, "direct-openai": {...} }
├── pricing.json          # { "<model-id>": { "inputUsdPerMTok": n, "outputUsdPerMTok": n } }
│                         #   entries for every non-local routed default (F.1 prices);
│                         #   openrouter ids included (pre-call estimates need them)
├── src/
│   ├── errors.ts         # LlmError (base, code) ← LlmDisabledError('llm_disabled'),
│   │                     #   LlmBudgetExceededError('llm_budget_exceeded', {estimatedCostCents, maxCostCents})
│   ├── routing.ts        # PURE: resolveModel(profile, quality, env, models): { model: string;
│   │                     #   routingKey: 'local'|'openrouter'|'direct-anthropic'|'direct-openai' }
│   ├── pricing.ts        # PURE: estimateCostCents(pricing, model, inTok, outTok): number | null
│   │                     #   (null on unknown model OR undefined token counts)
│   ├── prompt.ts         # PURE: assemblePrompt(task, context?): { instructions: string; prompt: string }
│   │                     #   trusted strings verbatim; Untrusted<string> values fenced in
│   │                     #   <untrusted-content> blocks with the closing tag neutralized
│   │                     #   inside the payload + a fixed data-not-instructions preamble
│   │                     #   appended to instructions when any untrusted content is present
│   ├── profile.ts        # resolveProvider(): guarded dynamic provider import per active
│   │                     #   capability (F.2.3/F.2.4); returns { model: LanguageModel,
│   │                     #   modelId, profile, routingKey }; throws LlmDisabledError when
│   │                     #   capabilities.llm === 'disabled'
│   ├── record.ts         # recordLlmCall(row): awaited fail-open insert (F.2.8)
│   ├── generate.ts       # the gateway (contract below)
│   └── index.ts          # import "server-only"; exports generate, errors, public types
└── test/                 # F.6
```

**`generate()` contract (the headline API):**

```ts
export type Quality = "cheap" | "balanced" | "high";

export interface GenerateOptions {
  /** Trusted task instructions, written by the developer. */
  task: string;
  /** Additional content; wrap external/model-adjacent data with untrusted() (core). */
  context?: Array<string | Untrusted<string>>;
  quality?: Quality; // default 'balanced'
  maxCostCents?: number; // pre-call refusal, F.2.7
  promptId?: string; // accounting tag (spec §5.4)
  maxOutputTokens?: number; // default 1024 (also feeds the cost pre-check)
  timeoutMs?: number; // default 60_000
  abortSignal?: AbortSignal;
}

export interface GenerateResult<T = string> {
  output: T; // text, or schema-parsed object
  model: string; // resolved model id
  profile: "local" | "openrouter" | "direct";
  usage: { inputTokens: number | null; outputTokens: number | null };
  costCents: number | null;
  costSource: "reported" | "estimated" | "unknown";
  latencyMs: number;
}

// Two overloads (schema-less → string; schema → z.infer<S>):
export function generate(opts: GenerateOptions): Promise<GenerateResult<string>>;
export function generate<S extends z.ZodType>(
  opts: GenerateOptions & { schema: S },
): Promise<GenerateResult<z.infer<S>>>;
```

Runtime order inside `generate()`: (1) `resolveProvider()` — throws `LlmDisabledError`
first; (2) `resolveModel` routing + env overrides; (3) `assemblePrompt`; (4) budget
pre-check (F.2.7) — may throw `LlmBudgetExceededError` (this outcome is NOT recorded in
`llm_calls`: no provider was called); (5) span open (F.2.5); (6) `generateText({ model,
instructions, prompt, maxRetries: 2, timeout, abortSignal, output: schema ?
Output.object({schema}) : undefined })`; (7) usage→cost (F.2.6); (8) `recordLlmCall`
(also on step-6 failure, with `error_code` = the AI SDK error name via `.isInstance`
checks, then rethrow the original error); (9) span close with attributes, return.

### F.5 `packages/config` + doctor additions (owner: config agent)

- `registry.ts`: `LLM_MODEL_CHEAP`, `LLM_MODEL_BALANCED`, `LLM_MODEL_HIGH` (group `llm`,
  optional, not secret): "Override the routed model id for the '<tier>' quality tier of
  the active LLM profile." `.env.example` regenerated via the generator. No
  capability-detection changes.
- Doctor llm section additions (fs-read per F.2.10): when llm is enabled, print the
  active profile's resolved tier→model routing (env overrides applied, marked as such);
  warn for any routed non-local model missing from pricing.json ("cost accounting will
  record unknown cost"); note on openrouter that actual cost is provider-reported.
  Existing hints (Ollama URL, profile-without-credentials warning) unchanged.

### F.6 Tests planned

- **routing.test.ts** (pure): table-driven profile × tier; env overrides win for active
  profile; direct sub-table selection (anthropic-first); unknown routing key impossible by
  construction (exhaustive types).
- **pricing.test.ts** (pure): cost math against known entries (e.g. haiku 300 in/150 out
  → exact cents); unknown model → null; undefined token counts → null; **invariant: every
  non-local model id in models.json has a pricing.json entry** (rot gate).
- **prompt.test.ts** (pure): trusted-only passthrough; untrusted fencing; closing-tag
  neutralization inside untrusted payloads; preamble appears only when untrusted content
  present.
- **generate.test.ts**: mock the model via `ai`'s test doubles (v7 mock class name
  verified by implementer in installed `ai/test`) + `vi.mock` of profile.ts: success path
  (usage→cost, result envelope); schema path returns parsed object; provider error →
  recorded `ok=false` + rethrown; budget refusal (known model over budget → error, no
  model call, no record); unknown-model + maxCostCents → allowed; reported-cost
  preference on openrouter (mocked providerMetadata).
- **disabled path**: `LlmDisabledError` + module-registry assertion that NO provider
  package was loaded (M4 email test pattern).
- **integration/record.test.ts** (TEST_DATABASE_URL skip-clean, 30s timeout): insert of a
  success row and a failure row via `recordLlmCall`, read back and assert columns.
- Existing suites keep passing; `.env.example` staleness gate covers F.5.

### F.7 Boundary + CI additions (orchestrator)

- dependency-cruiser: new rule `ai-sdk-only-in-llm` (`ai`, `@ai-sdk/*`, `@openrouter/*`
  physical paths confined to `packages/llm`); `otel-api-only-in-observability` `from`
  gains `^packages/llm/`; new `dag-llm-imports` rule (llm may import config/db/core/
  observability only — NOT auth/email/analytics); add `llm` to the banned lists of the
  existing dag rules for config/db/auth/email/analytics/observability; new
  `dag-core-no-llm` rule (no cycle). Each new/changed rule proven by a deliberate
  temporary violation fixture (D.9.16 discipline).
- CI: full-profile job env gains a dummy `OPENROUTER_API_KEY` (boot + doctor assert
  "llm: openrouter" — no generate call at boot, so no network); minimal profile
  unchanged. `pnpm check` composition unchanged.

### F.8 Parallel implementation split (disjoint files)

- **Orchestrator pre-work** (before agents): all package.json changes (`packages/llm`
  skeleton incl. tsconfig/vitest.config, core `"./untrusted"` subpath, root — none),
  `packages/db` schema/llm-call.ts + `schema/index.ts` line + migration 0002
  (drizzle-kit), dependency-cruiser rules, ci.yml tweak, ONE `pnpm install`.
- **Agent A — pure layer**: `packages/llm/{models.json, pricing.json,
src/{errors,routing,pricing,prompt}.ts}` + their four test files.
- **Agent B — SDK layer**: `packages/llm/src/{profile,record,generate,index}.ts` +
  generate/disabled/integration tests. Imports A's modules against the F.4 contracts
  (pinned; red typecheck from A's missing files is expected during parallel work).
- **Agent C — config/doctor**: F.5 files (`registry.ts`, doctor.ts, `.env.example`
  regen, config tests). Touches NOTHING in packages/llm.
- All agents: no package.json/lockfile edits, no commits, lint+format on touched files
  only, report format per fabulous-feature.

### F.9 Definition of done (M5)

`pnpm check` green (llm unit suites incl. type-level overload behavior; integration
skip-clean without TEST_DATABASE_URL); new boundary rules each proven by a temporary
violation fixture; live verify by the orchestrator: (a) fake OpenAI-compatible server
(scratchpad script) + `LLM_LOCAL_BASE_URL` → one real `generate()` round-trip through the
local profile persists a correct `llm_calls` row in Docker Postgres; (b) no-LLM-env boot
unchanged + doctor shows disabled with hints; (c) doctor with a fake key shows routing
table and pricing warnings correctly. `.env.example` regenerated; migration 0002 applies
cleanly on top of 0001. One Conventional Commit, approval-gated. (Part A exit criterion:
routing/cost-math unit tests + typed degraded path — covered by F.6.)

### F.10 Critique corrections (BINDING — supersede any conflicting Part F text)

Critic verdict 2026-08-20: APPROVED WITH CORRECTIONS. Verified clean by the critic (no
change needed): all F.1 ai-v7 idioms typecheck against ai@7.0.68 + zod 4.4.3 + TS 6.0.3
strict; `providerMetadata.openrouter.usage.cost?: number` (USD) confirmed in the 3.0.0
d.ts; static `import('ai')` is env/network-free (degradation-safe); no new `allowBuilds`
entries needed; pins clear `minimumReleaseAge`; root vitest auto-includes packages/llm;
core `"."` already re-exports untrusted; F.8 split is genuinely disjoint.

1. **NO ci.yml changes in M5.** F.7's "full-profile job" does not exist: ci.yml has
   exactly `pr-title, quality, minimal-boot, security, guarded-zones` — M4's planned
   full-profile job (E.6/E.9.7, Part A invariant) was never implemented and E.10 did not
   record the cut. **Recorded here as discovered M4 debt, owed to M8/M10.** Nothing calls
   `generate()` at boot; unit suites cover the enabled path.
2. **`packages/llm` does NOT depend on `drizzle-orm`** (would violate
   `no-bare-drizzle-outside-db-core`, and a plain insert needs no operators):
   `recordLlmCall` uses `getDb().insert(schema.llmCalls).values(row)` with
   `row: typeof schema.llmCalls.$inferInsert` — everything via `@factory/db`. The
   boundary rule is NOT extended.
3. **`cost_cents` column**: `numeric("cost_cents", { precision: 14, scale: 6,
mode: "number" })` — drizzle 0.45.2 numeric defaults to string mode otherwise.
4. **The schema overload of `generate()` is declared FIRST** (excess-property checks
   don't apply to non-literal args — schema-first binding keeps `GenerateResult<z.infer<S>>`
   inference for variable-passed options).
5. **`assemblePrompt` mapping pinned**: `prompt` = task text + optional fenced context
   blocks appended; `instructions` = the fixed data-not-instructions preamble ONLY when
   untrusted content is present, otherwise `undefined`. (Never an empty `prompt`.)
6. **Integration-test mechanism pinned** to the proven idiom of
   `packages/core/test/integration/rate-limit.test.ts`: `describe.skipIf(!TEST_DATABASE_URL)`
   - module-scope warn; own `Pool`; run the real migrator against `packages/db/migrations`;
     set `process.env.DATABASE_URL = TEST_DATABASE_URL` BEFORE dynamically importing the
     module under test (`getDb`/`getEnv` are memoized — a static import freezes the wrong env).
7. **`cost_source` edges pinned**: `costCents null` (unknown model, OR known model with
   undefined usage tokens) ⇒ `'unknown'`; local profile ⇒ `0` / `'estimated'`.
8. **Fence neutralization is case-insensitive and whitespace-tolerant** (e.g.
   `</ Untrusted-Content >` variants); document in prompt.ts that fencing is best-effort
   prompt-injection mitigation, NOT a security boundary.
9. **Mock pinned**: `MockLanguageModelV4` from `ai/test` (verified export in 7.0.68).
10. **Stated invariant + cheap test assert**: `resolveProvider` returns provider model
    OBJECTS only, never bare model-id strings — ai v7 routes bare strings through the
    bundled Vercel AI Gateway, which would silently bypass our profiles.
11. **Span attributes**: OTel attributes reject null — omit cost/token attributes when
    the value is null.
12. **`packages/llm/package.json` includes `"typecheck": "tsc --noEmit"`** (root
    typecheck is `pnpm -r run typecheck`).
13. (Adopted note) The F.7 boundary pass ALSO adds `email|analytics|observability` to the
    `dag-config-imports-no-workspace-package` and `dag-db-imports-only-config` ban lists —
    an M4 gap closed in the same touch.

### F.11 Accepted deviations & post-review fixes (discovered during implementation)

- **`estimateCostCents(model, inputTokens, outputTokens, pricing?)`** — parameter order
  differs from F.4's prose (`pricing` last, optional, defaulting to `pricing.json`); the
  pinned inter-agent contract, which both implementers compiled against, wins.
- **`maxOutputTokens` IS forwarded to `generateText`** (orchestrator fix, then hardened
  by review F.12): F.4's pinned call omitted it entirely; the final semantics are — with
  `maxCostCents` set, the forwarded cap is the exact output assumption the budget was
  checked against (caller's value or the 1024 default); without a budget, the caller's
  value passes through untouched.
- **`drizzle-orm` is a `packages/llm` DEVdependency** — needed only by the integration
  test's own migrator run (the exact F.10.6 pinned mechanism). F.10.2's runtime ban
  stands: no `drizzle-orm` import anywhere in `src/`.
- **`SpanStatusCode` comes from `@factory/observability`** (review finding, supersedes
  F.2.5's "llm imports @opentelemetry/api directly for SpanStatusCode"): observability
  re-exports the enum, `packages/llm` dropped its `@opentelemetry/api` dependency, and
  the `otel-api-only-in-observability` boundary rule was reverted to observability-only —
  one enum did not justify eroding the seam.
- **New boundary rule `no-unresolvable-imports`** — the M5 fixture proofs revealed that
  dependency-cruiser silently skips unresolvable edges, so an import of an UNDECLARED
  package (`import "ai"` from packages/email resolved to nothing) fired no confinement
  rule at all. Exemptions: `next-env.d.ts` (Next-generated, "types"-condition-only
  specifier) and `@/*` (apps/web-internal tsconfig alias; depcruise's schema rejects an
  `alias` resolve option, and tsc already fails typo'd `@/` imports).
- **Cross-suite integration race fixed (latent since M3)**: the db/core/llm integration
  suites share one TEST_DATABASE_URL and each drops/recreates the schemas; vitest runs
  the files in parallel workers, colliding (`CREATE SCHEMA` duplicate-key, DROP
  deadlocks) once the third suite landed on a many-core machine — CI's low-core runners
  had been serializing them by accident. All three suites now take the same session-level
  Postgres advisory lock (key 4230011) in `beforeAll`, serializing them; auto-releases on
  worker death.
- **Live verify (F.9) executed**: fake OpenAI-compatible server round-trip through the
  `local` profile persisted a correct `llm_calls` row (tokens 42/17, cost 0 'estimated',
  ok=true) via a temporary, deleted vitest harness; doctor verified in disabled /
  openrouter-dummy / env-override / unknown-model-warning scenarios; `apps/web` has no
  `@factory/llm` import edge (boot path untouched until M6).
- **Recorded follow-ups from the independent review (design-altitude pass)**: (1)
  doctor's fs-read of `packages/llm/{models,pricing}.json` plus its own copy of the
  routing pipeline (`resolveRoutingKey`, override application) is a third shadow of
  routing logic — plan-blessed by F.2.10 but a consolidation candidate (e.g. moving
  `models.json` + `resolveModel` into `packages/config`) on next touch; (2) the per-rule
  DAG deny lists (already bitten once at M4) should be considered for closed-form
  allowlist rewrites (`to: ^packages/ + pathNot allowlist`) as M6 pre-work.

### F.12 Independent review outcome (M5 cycle, post-gates)

`/code-review high` (multi-finder + adversarial verification) returned 6 findings; the
suspicious `ai`-SDK params and a doctor "silent tier skip" were refuted during its own
verification pass. Disposition:

- **FIXED (M5 code)** — `maxCostCents` without `maxOutputTokens` enforced nothing: the
  pre-check assumed 1024 output tokens but the model was free to overrun it. Now the
  budget's output assumption IS the forwarded `maxOutputTokens` cap whenever a budget is
  set (regression-tested).
- **FIXED (M4 code, shipped as a separate `fix:` commit)** —
  (1) `auth.ts` discarded `send()`'s `SendResult`: undelivered verification/magic-link
  emails (EMAIL_FROM missing, provider outage) were treated as success, dead-ending
  signups on "check your email"; now throws on non-delivery (console transport excepted).
  (2) `track.ts`/`client.tsx` cached a rejected vendor-SDK init promise forever (unlike
  observability's `sentryReady` reset); now reset on failure, and `isFeatureEnabled`
  degrades to `false` instead of rethrowing into route handlers.
  (3) `send.ts` built a new Resend client per call and rendered html on the console path;
  now a key-memoized singleton, html rendered only on the resend branch.
- **RECORDED FOLLOW-UPS** — (a) enabling email on a deploy with pre-existing unverified
  accounts locks them out (`requireEmailVerification` flips on, no resend-verification UI):
  needs a product decision in the M6 UI pass (resend affordance or `sendOnSignIn`);
  (b) doctor's duplicated routing semantics (also flagged by the altitude pass, F.11):
  consolidation candidate — hoist the pure routing module below config — M6 pre-work.

### F.13 Late finder reports (first review run's finders, delivered after F.12)

The crashed first review's finder agents self-resumed and reported after the M5 commit;
their new findings were fixed in-tree during the M6 cycle (they ride the M6 milestone
commit, as M4's fixes rode M5's):

- **OpenRouter reported-cost was dead code** (cross-file tracer, CONFIRMED against the
  3.0.0 dist): `usage.include` is opt-in at the SDK level and lives on the per-model chat
  settings — without it responses omit `usage.cost` and every openrouter row silently
  degraded to pricing.json estimates while doctor claimed provider-reported accuracy.
  `provider.chat(modelId, { usage: { include: true } })` now opts in. (The M5 research
  report's "always on per current docs" claim did not hold at the request layer.)
- **`LLM_MODEL_*` registry examples were profile-format traps**: direct-Anthropic ids
  offered as examples break 100% of calls when uncommented on the openrouter profile.
  Descriptions now state the id must match the ACTIVE profile's provider format;
  examples switched to OpenRouter format (the recommended prod default).
- **`untrusted.ts` regained the `server-only` poison**: the F.2.2 subpath export made it
  importable from client components, where the Symbol brand cannot survive
  client→server serialization — external content would arrive server-side unbranded and
  be fenced as trusted. No legitimate client consumer existed.
- **`recordLlmCall` failures now `captureException`** (reuse finding): a broken
  accounting path was a stdout-only failure, invisible to the errors capability even
  when Sentry is configured.
- **`flushAnalytics()` uses `flush()`, not `shutdown()`** (M4 code): posthog-node's
  shutdown is once-per-process; calling it per `after()` teardown as the doc comment
  suggested would kill the feature-flag poller and race concurrent captures.
- Remaining late findings were duplicates of F.12 items (auth SendResult, budget cap,
  posthog init reset — already fixed) or additions to the recorded follow-up list:
  `SERVICE_VARS` in doctor is a shadow map of the registry's `group` field
  (registry-driven hints, M6+); the three degradation contracts (typed result vs no-op
  vs throw) deserve a documented convention before M6's demo consumers multiply.
