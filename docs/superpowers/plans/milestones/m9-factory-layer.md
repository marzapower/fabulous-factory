# Part J — M9 Factory layer

**Milestone:** M9 (spec §7, §8.2–8.3, §8.6–8.7, §9.7)
**Cycle:** fabulous-feature — this Part is the contract; §J.12 (critique corrections)
supersedes anything above it; §J.11 + §J.12 record accepted deviations.

## J.1 Scope and exit criteria

Delivers the AI-native factory layer:

1. **Slim Adoption Ledger** — `.factory/manifest.json` (8 items, plain SHA-256 content
   hashes), `.factory/config.json` (`stage: prototype | production`), `pnpm factory:status`
   (report, always exit 0), `pnpm preflight` (stage-aware ship gate), a factory section
   inside `pnpm factory:doctor`, and `pnpm factory:manifest` (hash regeneration +
   `--check` staleness gate for template CI).
2. **Handoff** — `.factory/handoff/` staging the adopter instruction set
   (CLAUDE.md/AGENTS.md/skills); root carries the factory-dev set; `pnpm factory:init` =
   one-shot mechanical promotion. Mode inferred solely from handoff-dir presence;
   advisory nag (never blocking) in doctor/status/preflight while it exists,
   silenced by `FACTORY_DEV=1`.
3. **Agent memory artifacts** — root `CLAUDE.md` (<60 lines) + `AGENTS.md` (thin
   pointer), `docs/agents/conventions.md` (canonical shared rules),
   `docs/templates/{SPEC.md,ADR.md}`, root `PRODUCT.md` placeholder,
   `docs/adr/0001-record-architecture-decisions.md`.
4. **Skills** — 7 adopter skills staged in handoff, 4 factory-dev skills at root,
   1 new shared skill (`add-a-job`); `fabulous-feature` stays shared and untouched.
5. **`pnpm gen job|page|handler <name>`** — deterministic scaffolds stamped from
   inline templates; generated files pass the raw-handler lint rule and boundary rules.
6. **Missing shipped defaults the ledger points at** — placeholder legal pages
   (`apps/web/app/(legal)/terms`, `.../privacy`) linked from the landing footer.
7. **CI** — `pnpm factory:manifest --check` + `pnpm preflight` steps in the `quality`
   job; README quickstart claims made true.

Exit criteria (from master plan Part A): `factory:init` one-shot works on a fresh
clone (live-verified on a tree copy); preflight stage-aware in CI.

Explicitly excluded: **zero migrations, zero schema changes, zero dependency changes**
(hashing uses `node:crypto`, fs ops use `node:fs`); no changes to packages
auth/core/billing/db/middleware (no guarded zones touched); no LICENSE/CONTRIBUTING
(M10 distribution debt); no ack ceremony / overlay UI / normalized hashing (cut, spec §11).

## J.2 Verified current state (research digest)

- Theme = `apps/web/app/globals.css` (Tailwind v4 CSS-native; the spec's
  `apps/web/styles/theme.css` path is stale). No PRODUCT.md, no legal pages, no
  `docs/templates|agents|adr`, no `.factory/`, no root CLAUDE.md/AGENTS.md; `.claude/skills/`
  holds only `fabulous-feature` (frontmatter = `name` + `description` only).
- Script conventions: root `package.json` scripts run `tsx packages/config/scripts/<x>.ts`;
  scripts import sibling `../src/*`; plain `console.log` with `✓ ✗ ⚠` glyphs; doctor
  always exits 0 (report), `gen-env-example --check` exits 1 (gate). Test convention:
  scripts export pure functions, CLI gated behind an `invokedDirectly` check, vitest
  imports the functions (never subprocess exec).
- CI: `quality` job already chains lint → boundaries → format:check →
  `gen:env-example --check` → typecheck → test; SHA-pinned actions. Doctor output is
  grep-asserted (`grep -qF`, presence-only — extra lines are safe).
- Jobs registration: `packages/jobs/src/functions/index.ts` exports
  `export const functions = [monitorCron, monitorWorker];` consumed by the Inngest mount.
- Lint constraints on generated files: `factory/no-raw-handler` (route files must
  `export const GET = defineHandler(...)` directly), `"use server"` files must export
  only `defineAction` results; jobs may import only
  `@factory/{config,db,core,llm,email,analytics,observability}` (no auth) per depcruise.
- Prettier checks `.factory/*.json`, `.claude/**/*.md`, all new markdown
  (only `node_modules/.next/coverage/pnpm-lock/.husky/db-migrations` are ignored) —
  every authored file must be prettier-clean; JSON written by scripts must be
  `JSON.stringify(v, null, 2) + "\n"`.
- TS sweep: files under `packages/config/scripts|test` are typechecked/linted; files
  outside `apps/`/`packages/` (docs, .factory, .claude) are not.
- Guarded-zones CI list does not include any M9 path. README already documents
  `factory:init`/`factory:status` (currently aspirational).

## J.3 The ledger

### J.3.a `.factory/config.json`

```json
{ "stage": "prototype" }
```

Only key: `stage` ∈ `prototype | production`. Template ships `prototype`.

### J.3.b `.factory/manifest.json`

```json
{
  "comment": "Adoption Ledger — factory defaults a real product must own. Hashes are SHA-256 of shipped bytes; a formatter pass flips an item to touched — accepted, the ledger guides, per-item recipes gate. Regenerate with: pnpm factory:manifest (template repo only).",
  "items": [
    {
      "id": "product-def",
      "title": "Product definition",
      "why": "PRODUCT.md is still the shipped placeholder — no one has said what this product is.",
      "skill": "define-product",
      "blocksProduction": true,
      "files": [{ "path": "PRODUCT.md", "hash": "<sha256>" }]
    }
  ]
}
```

The 8 items (id → files → blocksProduction → skill):

| id              | files                                                                                                                                                                                     | blocks | skill          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------- |
| product-def     | `PRODUCT.md`                                                                                                                                                                              | yes    | define-product |
| app-identity    | `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`                                                                                                                                        | yes    | brand-it       |
| design-system   | `apps/web/app/globals.css`                                                                                                                                                                | no     | brand-it       |
| demo-logic      | `packages/jobs/src/demo/*` (6 files), `apps/web/components/demo/*` (6 files), `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/actions.ts`, `packages/db/src/schema/monitor.ts` | yes    | make-it-yours  |
| legal-pages     | `apps/web/app/(legal)/terms/page.tsx`, `apps/web/app/(legal)/privacy/page.tsx`                                                                                                            | yes    | make-it-yours  |
| email-templates | `packages/email/src/templates/{verify-email,magic-link,change-digest}.tsx`                                                                                                                | no     | brand-it       |
| plans-catalog   | `packages/config/src/plans.ts`                                                                                                                                                            | no     | enable-billing |
| readme          | `README.md`                                                                                                                                                                               | no     | make-it-yours  |

File lists are explicit path arrays in the JSON (no globs — deterministic). Manifest is
committed with real hashes, filled by `pnpm factory:manifest` as the LAST implementation
step (after all content lands).

### J.3.c Item status semantics

Per item: every listed file present with matching hash → `factory-default`; at least
one file differing or missing (but not all missing) → `touched`; all files missing →
`removed`. `touched` and `removed` both mean "owned" — green. Accepted limitation
(recorded in the manifest comment): trivial edits flip to `touched`.

### J.3.d Shared logic — `packages/config/scripts/factory-ledger.ts`

Pure module (no CLI). Exports:

```ts
export type Stage = "prototype" | "production";
export type ItemStatus = "factory-default" | "touched" | "removed";
export interface ManifestItem {
  id: string;
  title: string;
  why: string;
  skill: string;
  blocksProduction: boolean;
  files: { path: string; hash: string }[];
}
export interface LedgerReport {
  stage: Stage;
  handoffPresent: boolean;
  items: (ManifestItem & { status: ItemStatus })[];
}
export function hashFile(absPath: string): string; // sha256 hex of raw bytes
export function loadManifest(rootDir: string): { comment: string; items: ManifestItem[] };
export function loadStage(rootDir: string): Stage; // missing/invalid config.json → "prototype"
export function itemStatus(rootDir: string, item: ManifestItem): ItemStatus;
export function ledgerReport(rootDir: string): LedgerReport;
export function staleEntries(
  rootDir: string,
): { path: string; expected: string; actual: string | null }[]; // manifest vs disk, for --check
export function renderStatusLines(report: LedgerReport): string[]; // shared by factory-status + doctor section
```

All functions take `rootDir` (tests use temp dirs). Missing manifest → clear error.

### J.3.e CLIs

- **`factory-status.ts`** (`pnpm factory:status`): prints the ledger report — stage
  line, then one line per item: `● <id> — factory default → skill: <skill>` /
  `✓ <id> — touched` / `✓ <id> — removed`; then the handoff nag when
  `handoffPresent && !process.env.FACTORY_DEV`. Always exit 0.
- **`preflight.ts`** (`pnpm preflight`): prints the same report, then stage-aware
  gating. `prototype`: everything advisory, always exit 0 (prints what production
  would block). `production`: exit 1 if any `blocksProduction` item is still
  `factory-default`, or `.factory/handoff/` still exists ("run pnpm factory:init"),
  or a configured `STRIPE_SECRET_KEY` starts with `sk_test_` (read via the same
  root-`.env` loader doctor uses; unset → skip). Non-blocking warning at both stages:
  email capability disabled → "auth runs without email verification" (§5.2 posture).
  Pointer check (mirror staleness, spec §8.2): `CLAUDE.md` and `AGENTS.md` must each
  contain the literal string `docs/agents/conventions.md` — warning in prototype,
  blocking in production.
- **`factory-manifest.ts`** (`pnpm factory:manifest [--check]`): default mode rewrites
  every `hash` in manifest.json from disk bytes (error on missing file) — refuses with
  a message when `.factory/handoff/` is absent (product repos must not regenerate; the
  frozen manifest IS the record of shipped bytes). `--check`: recompute and exit 1
  listing stale entries; when handoff is absent print
  `– factory:manifest --check skipped (product repo)` and exit 0 (adopter CI stays green).
- **`factory-init.ts`** (`pnpm factory:init`): exported `runFactoryInit(rootDir)`;
  steps, in order: (1) if `.factory/handoff/` missing → print "already initialized"
  and exit 1; (2) copy `handoff/CLAUDE.md` → `CLAUDE.md` and `handoff/AGENTS.md` →
  `AGENTS.md` (overwrite); (3) move every `handoff/skills/<name>/` into
  `.claude/skills/<name>/` (overwrite); (4) delete the factory-dev-only skills
  `add-integration-package`, `update-ledger-hashes`, `write-adr`, `release-template`
  from `.claude/skills/`; (5) `rm -rf .factory/handoff`; (6) write
  `{ "stage": "prototype" }` to `.factory/config.json`; (7) print the closing message:
  `Initialized as a product repo. Ask your agent: "what's left to make this mine?"`.
  No git operations, no interactivity, exit 0.
- **doctor**: new `printFactorySection()` after the service loop — stage, counts
  (`N of 8 factory defaults still in place — run pnpm factory:status`), and the nag
  (same `FACTORY_DEV` silence). Reuses `ledgerReport`; doctor still always exits 0.

## J.4 Instruction sets, templates, skills

### J.4.a Root (factory-dev mode)

- **`CLAUDE.md`** (<60 lines): one-line premise (this is the TEMPLATE repo — factory-dev
  mode; adopters run `pnpm factory:init`); frozen stack summary; hard rules (all
  routes/actions via `defineHandler`/`defineAction`; LLM only via `@factory/llm`; no
  vendor SDKs outside adapter packages; env only via `@factory/config`; graceful
  degradation is the core contract; never log secrets); definition of done =
  `pnpm check` green; Conventional Commits; pointer line `Canonical conventions:
docs/agents/conventions.md`; skill map (fabulous-feature for non-trivial changes,
  factory-dev skills list).
- **`AGENTS.md`**: thin pointer (≤15 lines) — "read CLAUDE.md; canonical conventions:
  `docs/agents/conventions.md`" — never a copy.
- **`docs/agents/conventions.md`** (canonical, ~120 lines): the deterministic layer
  shared by both modes — kernel rules, package DAG (config ← db ← auth/email/analytics/
  observability ← core ← llm ← jobs ← billing ← web), degradation contract
  (required baseline = `DATABASE_URL` + `BETTER_AUTH_SECRET`, everything else optional),
  env registry discipline, test conventions (pure + integration-with-skip),
  `pnpm check` DoD, Conventional Commits, security posture pointers (safeFetch,
  rate limits in wrapper, guarded zones).
- **`docs/templates/SPEC.md`** — one JTBD, primary flow, error states, acceptance
  tests, kill criteria. **`docs/templates/ADR.md`** — status/context/decision/consequences.
- **`PRODUCT.md`** (root, the shipped placeholder the ledger hashes): pre-structured
  human document — product one-liner, persona, the €N/month sentence, pricing table
  ref to `plans.ts`, distribution channels; placeholder prose clearly marked.
- **`docs/adr/0001-record-architecture-decisions.md`**: classic bootstrap ADR,
  instantiated from the template.

### J.4.b Handoff (adopter mode) — `.factory/handoff/`

- `CLAUDE.md` (adopter version, <60 lines): same hard rules/DoD, but premise =
  "this is YOUR product repo; PRODUCT.md is the human's document; the ledger is the
  shared to-do list (`pnpm factory:status`)"; same pointer line to conventions.md;
  adopter skill map.
- `AGENTS.md`: same thin-pointer shape.
- `skills/<name>/SKILL.md` × 7 (see J.4.c).

### J.4.c Skills (all: 2-field frontmatter, ≤80 lines, concrete commands/paths, English)

Adopter (staged in handoff): **define-product** (interview → fill PRODUCT.md → derive
first SPEC from docs/templates/SPEC.md → re-run factory:status), **add-a-feature**
(SPEC-first; `pnpm gen` for scaffolds; fabulous-feature for non-trivial; `pnpm check`
DoD), **enable-billing** (Stripe env vars, edit `packages/config/src/plans.ts`,
webhook via Stripe CLI, entitlement seam, preflight test-key rule), **swap-llm-provider**
(LLM_PROFILE/env, models.json routing, verify with doctor), **brand-it** (identity:
layout metadata + landing page; theme tokens in globals.css; email template copy —
UI work follows the repo's design conventions), **make-it-yours** (umbrella: run
factory:status, walk every item; includes the demo-removal recipe: delete
`packages/jobs/src/demo/`, `apps/web/components/demo/`, demo parts of dashboard,
`monitor.ts` schema + a drop migration via `pnpm db:generate`), **pre-ship-check**
(set stage=production in `.factory/config.json`, run `pnpm preflight`, resolve
blockers, final gates).

Factory-dev (root `.claude/skills/`): **add-integration-package** (registry entry +
capability + adapter + contract suite + doctor hint + depcruise allowlist),
**update-ledger-hashes** (when shipped defaults change: `pnpm factory:manifest`,
commit — CI `--check` enforces), **write-adr** (docs/adr/NNNN-slug.md from template),
**release-template** (maintainer checklist: gates, manifest fresh, quickstart re-verified,
tag).

Shared (root, survive init): existing **fabulous-feature** (untouched), new
**add-a-job** (`pnpm gen job <name>`, register in `packages/jobs/src/functions/index.ts`,
event naming `app/<name>`, step patterns, allowed imports (no `@factory/auth`), test
pattern, INNGEST env vars).

## J.5 `pnpm gen` — `packages/config/scripts/gen.ts`

CLI: `pnpm gen <handler|page|job> <name>`; name must match `^[a-z][a-z0-9-]*(-[a-z0-9]+)*$`
(single segment, no slashes — path-traversal impossible by construction); refuse to
overwrite an existing target (exit 1). Templates are **inline template literals** in
gen.ts (typechecked as strings, zero stray files). Exports for tests:
`renderTemplate(kind, name): string`, `targetPath(kind, name): string`,
`writeScaffold(rootDir, kind, name)`; CLI behind `invokedDirectly`.

- `handler <name>` → `apps/web/app/api/<name>/route.ts`: `defineHandler` with
  `auth: "required"`, `input: "none"`, `rateLimit: "none"` + TODO comments telling the
  agent to choose auth mode/schema/rate limit deliberately (auth-required is the safe
  default). Passes `factory/no-raw-handler` by construction.
- `page <name>` → `apps/web/app/<name>/page.tsx`: minimal server component, layout-consistent
  wrapper, TODO markers.
- `job <name>` → `packages/jobs/src/functions/<name>.ts`: event-triggered
  `inngest.createFunction({ id: "<name>", triggers: [{ event: "app/<name>" }] }, ...)`
  with a `step.run` skeleton; imports only from allowed packages. After writing, print
  the exact registration line to add to `packages/jobs/src/functions/index.ts`
  (deterministic file write + explicit instruction; no fragile AST editing in v1).

Generated output must be prettier-clean (templates authored to prettier style) and pass
`pnpm lint` — live-verified in Phase 6.

## J.6 Legal pages + landing footer

- `apps/web/app/(legal)/terms/page.tsx` and `.../privacy/page.tsx`: static server
  components in the existing shell idiom (same typography/container classes as (auth)
  pages), clearly-placeholder copy ("This is placeholder text shipped by the template —
  replace before production", section skeletons). Public routes (static content pages,
  no handler — middleware allowlist: verify `(legal)` routes are publicly reachable;
  if the middleware requires an allowlist entry, add `/terms` + `/privacy`).
- Landing `apps/web/app/page.tsx`: add a small footer with Terms/Privacy links.

## J.7 CI + root wiring (orchestrator pre-work + Worker D)

Root `package.json` scripts (orchestrator adds before implementers start):

```json
"factory:status": "tsx packages/config/scripts/factory-status.ts",
"factory:init": "tsx packages/config/scripts/factory-init.ts",
"factory:manifest": "tsx packages/config/scripts/factory-manifest.ts",
"preflight": "tsx packages/config/scripts/preflight.ts",
"gen": "tsx packages/config/scripts/gen.ts",
```

`quality` job: after `pnpm test`, add `- run: pnpm factory:manifest --check` and
`- run: pnpm preflight`. No new CI job (piggybacks on existing pnpm setup). Doctor
grep assertions in `full-profile` are presence-only — the new factory section is safe.
README: verify/fix the quickstart + "make it yours" sections against the now-real
commands; no aspirational claims left.

## J.8 Tests (packages/config/test/, existing conventions)

- `factory-ledger.test.ts`: hashFile stability; itemStatus classification matrix
  (default/touched/removed, multi-file items with partial edits) on temp-dir fixtures;
  loadStage fallback; staleEntries detection.
- `preflight.test.ts`: exported `evaluatePreflight(rootDir, env)` →
  `{ failures: string[]; warnings: string[] }`; prototype never fails; production
  fails on factory-default blockers / handoff present / sk_test_ key; pointer check
  warning-vs-blocking per stage.
- `factory-init.test.ts`: build a fake mini-repo in a temp dir (handoff with CLAUDE/
  AGENTS/2 skills, root .claude/skills with a factory-dev + a shared skill), run
  `runFactoryInit`, assert full end-state (files promoted, factory-dev skills gone,
  shared skill intact, handoff deleted, config stage prototype); second run exits
  "already initialized".
- `gen.test.ts`: renderTemplate output contains `defineHandler(`/`createFunction(`;
  name validation rejects `../x`, `A`, `a/b`, empty; writeScaffold refuses overwrite;
  targetPath mapping.

No DB, no network — all pure fs/tmp. Both profiles unaffected (424+17 / 441 baseline
grows by these suites).

## J.9 Worker split (disjoint files) and sequence

Orchestrator pre-work: this plan file + master-plan index row + root `package.json`
script lines.

- **Worker A (ledger)**: `packages/config/scripts/{factory-ledger,factory-status,preflight,factory-manifest,factory-init}.ts`,
  `packages/config/scripts/doctor.ts` (factory section only), `.factory/config.json`,
  `.factory/manifest.json` (real paths, placeholder `"hash": "PENDING"` values),
  `packages/config/test/{factory-ledger,preflight,factory-init}.test.ts`.
- **Worker B (gen)**: `packages/config/scripts/gen.ts`, `packages/config/test/gen.test.ts`.
- **Worker C (prose)**: root `CLAUDE.md`, `AGENTS.md`, `PRODUCT.md`,
  `docs/agents/conventions.md`, `docs/templates/{SPEC.md,ADR.md}`,
  `docs/adr/0001-record-architecture-decisions.md`, `.factory/handoff/**`
  (CLAUDE.md, AGENTS.md, 7 skills), `.claude/skills/{add-integration-package,update-ledger-hashes,write-adr,release-template,add-a-job}/SKILL.md`.
- **Worker D (app + CI)**: `apps/web/app/(legal)/**`, `apps/web/app/page.tsx` (footer),
  `apps/web/middleware.ts` (add `/terms` + `/privacy` to `EXACT_ALLOWLIST` — verified
  required, see §J.12.1), `README.md`, `.github/workflows/ci.yml`, `.gitattributes`.

Orchestrator post-merge: run `pnpm factory:manifest` to fill real hashes (LAST content
step), then Phase 5 review, gates, live verify.

## J.10 Live verify (Phase 6, beyond `pnpm check`)

1. In-repo: `pnpm factory:status`, `pnpm preflight`, `pnpm factory:doctor` (nag visible,
   FACTORY_DEV=1 silences), `pnpm factory:manifest --check` green.
2. Fresh-clone simulation: rsync working tree (minus node_modules/.next) to scratchpad,
   `pnpm install` (shared store), `pnpm factory:init` → assert: root CLAUDE.md is the
   adopter version, handoff gone, adopter skills in `.claude/skills/`, factory-dev
   skills gone, fabulous-feature + add-a-job intact; `pnpm factory:status` reports all
   8 factory-default; `pnpm preflight` exit 0 (prototype); flip stage to production →
   preflight exit 1 listing blockers; `factory:manifest --check` prints the product-repo
   skip; second `factory:init` exits 1.
3. Gen live test (real repo): `pnpm gen handler ping`, `pnpm gen page about`,
   `pnpm gen job sample-sync` → `pnpm lint` + `pnpm typecheck` green with generated
   files present (job unregistered on purpose — must still compile), then delete them.
4. Legal pages reachable: boot `PORT=3005 pnpm dev`, GET /terms + /privacy → 200
   unauthenticated.

## J.11 Out of scope / debts recorded

- LICENSE + CONTRIBUTING (README links exist) → M10 distribution.
- `pre-ship-check`'s deploy checklist points to M10 deploy guides (not yet written —
  the skill says so honestly).
- Spec §8.6 "unverified-auth warning acknowledged": ack ceremony was cut (§11) — v1
  prints a non-blocking warning instead; recorded here as the deliberate slim-down.
- AGENTS.md staleness: since AGENTS.md is a pointer (never a generated copy), the CI
  check is the preflight pointer assertion, not a regenerate-and-diff.

## J.12 Binding critique corrections (supersede everything above)

Critique verdict (fresh Opus agent, 2026-08-21): **APPROVED WITH CORRECTIONS** — 13
mandatory, all folded below; all 11 optional improvements adopted (opt-14…opt-24).

1. **Middleware is IN scope (guarded zone).** `middleware.ts:93` matcher covers
   `/terms`+`/privacy` and they are absent from `EXACT_ALLOWLIST` (lines 42-49) —
   unauthenticated GETs 307 to `/login`. Worker D adds `"/terms"` and `"/privacy"` to
   `EXACT_ALLOWLIST` (exact entries, NOT prefixes — per the rationale documented at
   middleware.ts:30-40). J.1's "no guarded zones touched" claim is VOID: M9 touches
   one guarded zone; the Phase-5 reviewer gets an explicit security-review mandate on
   the middleware diff, and Phase 6 asserts the entries are exact.
2. **Item status semantics are AND, not OR.** An item is `factory-default` if ANY
   listed file is present with a matching hash; `removed` if ALL files are missing;
   `touched` otherwise (every present file differs, ≥1 present). Rationale: one
   untouched shipped file means the item is not yet owned. J.8's matrix tests the
   multi-file partial case against this rule; manifest `comment` states it.
3. **Every CLI surface degrades on missing/corrupt `.factory/`.** `loadManifest`
   throws; `ledgerReportSafe(rootDir)` returns `null` on any failure.
   `printFactorySection()` wraps its body in try/catch → single
   `⚠ .factory/manifest.json missing or unreadable — ledger unavailable` line
   (doctor.ts calls `main()` at module scope — a throw escapes before
   `process.exitCode = 0` and would break full-profile CI). `factory-status` and
   `preflight` print the same warning and exit 0. Only `factory:manifest` (both
   modes) may hard-error on a missing manifest.
4. **Preflight signature pinned:** `evaluatePreflight(rootDir: string, env:
Record<string, string | undefined>): { failures: string[]; warnings: string[] }`.
   The CLI calls it with `{ ...readMergedEnv(), FACTORY_DEV: process.env.FACTORY_DEV }` —
   `readMergedEnv()` (env-file.ts) is registry-filtered and path-less, so `FACTORY_DEV`
   must be threaded in explicitly. Tests pass plain objects. Corrected CI fact: the
   `quality` job sets ONLY `TEST_DATABASE_URL` — no DATABASE_URL/BETTER_AUTH_SECRET/
   Stripe keys — so the `sk_test_` check trivially skips there and the email-disabled
   warning always prints. That is expected; do not "fix" it.
5. **Spec §8.2's mirror-staleness check lives in vitest, not preflight.** New
   `packages/config/test/factory-docs.test.ts` (Worker A), golden-file style per
   gen-env-example.test.ts: root `CLAUDE.md` and `AGENTS.md` each contain the literal
   `docs/agents/conventions.md`; `AGENTS.md` ≤ 15 lines; `CLAUDE.md` < 60 lines; when
   `.factory/handoff/` exists (skip-clean otherwise) the handoff CLAUDE/AGENTS satisfy
   the same. Runs inside `pnpm test` → CI can actually go red. The preflight pointer
   check stays as an adopter-facing surface. (Prettier cannot reflow the literal path:
   `proseWrap: "preserve"` and prettier never breaks inside a token.)
6. **Template marker replaces handoff-inference for manifest tooling.**
   `.factory/config.json` ships `{ "stage": "prototype", "template": true }`;
   `factory-init` step (6) writes `{ "stage": "prototype" }` (drops the flag).
   `factory:manifest --check` runs iff `template === true`, else prints the skip and
   exits 0 (a fork that edits README pre-init no longer goes red with un-followable
   advice); default (rewrite) mode refuses unless `template === true`. AND:
   `factory:manifest --check` is appended to the root `"check"` script (orchestrator
   pre-work) so template-local DoD and CI cannot diverge. Init end-state and J.10
   assertions updated accordingly.
7. **`runFactoryInit(rootDir): { ok: boolean; messages: string[] }`** — never calls
   `process.exit`; the CLI wrapper sets `process.exitCode`. Every step individually
   idempotent: step (3) `mkdirSync(".claude/skills", { recursive: true })`, then per
   source dir `rmSync(dest, { recursive: true, force: true })` BEFORE `renameSync`
   (rename cannot overwrite a non-empty directory — ENOTEMPTY), iterating whatever
   `handoff/skills/` contains, tolerating empty; step (4) `rmSync(..., { force: true,
recursive: true })`. A re-run with handoff still present completes whatever remains
   and returns `ok: true`; handoff absent → `ok: false`, "already initialized". J.8
   adds the partial-state re-run case.
8. **Name regex fixed:** `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` (the old trailing group was
   dead and admitted `foo-`, `foo--bar`). Both strings join the gen.test.ts rejection
   list.
9. **`gen page` collision check is route-group aware:** refuse if
   `apps/web/app/<name>/page.tsx` exists OR any `apps/web/app/(<group>)/<name>/page.tsx`
   exists (single-level scan of parenthesized dirs) — `gen page login` would otherwise
   produce a duplicate `/login` route that only `next build` catches. Error message
   names the colliding file; gen.test.ts covers it with a fixture group dir.
10. **Gen identifier derivation pinned:** `toCamelCase(name)` = job export const;
    `toPascalCase(name) + "Page"` = page default export; Inngest `id: "<name>"`
    verbatim kebab. After writing a job, print BOTH required edits to
    `packages/jobs/src/functions/index.ts`: the `import { <camel> } from "./<name>";`
    line and the `functions` array entry. Both asserted in gen.test.ts.
11. **`docs/templates/PRODUCT.md` ships too** (Worker C) — the reusable template; root
    `PRODUCT.md` stays the instantiated placeholder the ledger hashes (spec §7 and
    README:170 both demand it). README truthfulness is an explicit list for Worker D:
    rewrite README:122 to point at the `make-it-yours` skill (not
    `docs/guides/make-it-yours.md`); `docs/guides/` reference and LICENSE/CONTRIBUTING
    badges stay as knowingly-deferred M10 debt (recorded in J.11), not silently fixed.
12. **CLAUDE.md hard rules complete per spec §7:** add "every external call has an
    explicit timeout and a bounded retry (`safeFetch` for user-supplied URLs)" and
    "never log secrets or PII" to BOTH instruction sets (root + handoff).
13. **`FACTORY_DEV=1` silences only the advisory nag** in doctor/status/preflight. It
    never suppresses the production-stage handoff blocker — a repo with
    `.factory/handoff/` present is by definition not a product repo. Pinned by a
    preflight.test.ts case.

Adopted optionals: **opt-14** `.gitattributes` with `* text=auto eol=lf` (Worker D;
CRLF checkouts would flip every hash and green the whole ledger on day zero) + note in
manifest comment. **opt-15** `app-identity.files = [apps/web/app/page.tsx]` only —
layout.tsx churns for non-identity reasons; brand-it still covers `metadata.title`.
**opt-16** `blocksProduction` replaces spec's "severity" — recorded as accepted
deviation. **opt-17** status/doctor counts use `items.length`, never a literal 8.
**opt-18** generated job event = `app/<name>.requested` (matches the
`namespace/entity.action.state` idiom of `demo/monitor.check.requested`), const defined
in the generated file; `add-a-job` states `demo/` = demo namespace, `app/` = product.
**opt-19** `make-it-yours` says: REPLACE legal pages, don't delete (footer links would
404); deleting requires removing the footer links too. **opt-20** J.10's rsync excludes
`.env*` and `.git`; the clone-sim runs with only `FACTORY_DEV` unset and no service env.
**opt-21** when `handoffPresent`, factory-status prints one line noting the named
adopter skills install on `pnpm factory:init`. **opt-22** the committed manifest uses
expanded `JSON.stringify(v, null, 2)` shape (the J.3.b inline example is illustrative
only). **opt-23** never `realpath` `rootDir` (macOS `/tmp` symlink would break temp-dir
fixtures); thread it verbatim into `path.join`. **opt-24** doctor's factory section
intentionally does NOT reuse `renderStatusLines` (different verbosity) — declared, not
a DRY miss.

## J.13 Cycle record (review outcome, gates, live verify)

- **Critique** (fresh Opus): APPROVED WITH CORRECTIONS — 13 mandatory + 11 optional,
  ALL folded (§J.12). Highest-value catches: middleware allowlist requirement (§J.12.1),
  AND-rule status semantics (§J.12.2), both CI gates structurally unable to fail
  (§J.12.5/6).
- **Review** (fresh Opus, security mandate on middleware): SHIP WITH FIXES — security
  CLEAN (exactly two exact allowlist entries, static pages, no traversal in
  init/gen), all §J.12 items verified implemented; 3 BLOCKING + 9 MINOR + 5 NIT, all
  17 prose/polish findings fixed same-cycle (manifest comment truthfulness, conventions
  DAG rewritten as per-package allowlists matching depcruise, make-it-yours
  demo-removal recipe completed with the 4 missing touchpoints, plus small script
  polish). Orchestrator re-read additionally caught and fixed: `brand-it` referencing
  the non-shipped `frontend-design` skill (author's personal tooling leaking into the
  template) and a "react-email templates" factual error.
- **Gates**: `pnpm check` green in BOTH profiles after all fixes — minimal 513 passed +
  17 skipped, full 530/530 (M8 baseline 424+17/441; +89 tests). `pnpm check` now ends
  with `factory:manifest --check` (§J.12.6).
- **Live verify**: in-repo status/preflight/doctor/manifest all per contract; fresh-tree
  simulation (`rsync` minus `.env*`/`.git`/`node_modules`, real `pnpm install`):
  `factory:init` one-shot exit 0 with correct end-state (adopter set promoted, handoff
  gone, 7+2 skills, factory-dev skills removed, template flag dropped), prototype
  preflight exit 0, production preflight exit 1 listing exactly the 4 blockers,
  `factory:manifest --check` prints the product-repo skip, second init refuses exit 1,
  `FACTORY_DEV=1` silences the nag; gen probe (handler/page/job) lint+typecheck green,
  no residue; `/terms` + `/privacy` 200 unauthenticated on :3005 while `/dashboard`
  still 307s to login.
- Exit criteria of §J.1: both met.
