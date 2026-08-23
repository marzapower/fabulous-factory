# npx Installer — replacing the template-repo distribution model

**Date:** 2026-08-22
**Status:** Approved design, pending implementation plan

> **Superseded notes (added later, body below left as originally written):**
>
> - §4's single `apps/demo` layout was superseded by the three-preset family
>   (`untangle`/`nothing`/`brainstorm`, commit 2c71ee3) — there is no single `apps/demo`
>   in the shipped repo.
> - Package pruning, which §3/§5 said v1 would NOT implement, IS implemented: compose-time
>   pruning of unclaimed domain packages (`packages/create/src/compose.ts`), migration-chain
>   pruning, and Dockerfile `COPY` marker stamping all key off each preset's `packages` field.
> - The per-preset README seed override (§5, "a README adopter seed, per-preset
>   overridable") was not implemented — there is a single `payload/variants/README.md`
>   shared by every preset, not one per preset.

## 1. Problem

Fabulous Factory is distributed as a GitHub template repo: adopters clone it in
factory-dev mode and run `pnpm factory:init` to promote the instruction set staged in
`.factory/handoff/` over the maintainer's. This model has three structural limits:

1. **It only scales to one preset.** A second demo app would need a branch or a second
   repo — reintroducing the shared-infrastructure drift the factory exists to cure.
2. **Promotion happens at the adopter's desk.** `factory:init` is a runtime script the
   adopter must run correctly; every guard around it (`HANDOFF_NAG`, the preflight
   handoff blocker, ADR-0002's staging discipline, the roster-sync tests) exists to
   police a step that shouldn't be the adopter's job at all.
3. **Nothing validates what adopters actually receive.** The release skill verifies
   clone-and-init by hand; no CI job ever runs `pnpm check` on a post-init tree.

## 2. Decision

Replace template-clone distribution with a published npm installer:

```
npx fabulous-factory@latest install     # or: pnpm create fabulous-factory
```

The installer offers a choice of **presets** and scaffolds a new folder that is **born a
product repo**: common infrastructure + the chosen preset app + the adopter instruction
set already installed. The repo becomes a **pure factory** — a runnable multi-preset
workspace plus a CLI package — and stops being directly adoptable. `factory:init` and the
entire `.factory/handoff/` mechanism are deleted, absorbed into a publish-time compose
step.

Competitor grounding: this combines the embedded-template model (`create-next-app`,
`create-vite` — atomic npm versioning, no GitHub dependency at install time) with the
live-runnable-examples virtue of the git-fetch model (`create-astro`, `create-turbo`),
while avoiding `create-t3-app`'s dead-fragment tax: our presets are real workspace apps
exercised by `pnpm check` every day, because our variant space is discrete presets, not
combinatorial addons.

## 3. What a preset is

**A preset is a product shape, not just a different demo.** The Untangle SaaS is the
first; future shapes include a smart web application (no billing) and a micro web
service (API-only, no UI — `defineHandler` routes work fine without pages).

Two invariants:

- **The skeleton is preset-independent.** The 10 infrastructure packages ship with
  every preset. Graceful degradation is already the core contract — a shape that doesn't use
  billing simply has that seam dark: zero runtime cost, zero config demanded. Every
  generated repo is structurally identical (same conventions, same agents, same
  `pnpm check`).
- **The preset carries the shape**: its app, its `PRODUCT.md` seed, its `LAUNCH.md`
  variant (a micro-service checklist has no "Design system" or "Legal pages" item), and
  which capabilities its README/onboarding highlight.

`preset.json` reserves a `packages` field for future pruning of true leaf packages
(e.g. billing), but v1 does not implement pruning: the DAG makes it tangled (auth →
email, jobs → llm/analytics/email) and dark seams already cost nothing. YAGNI.

## 4. Target repository layout

```
fabulous-factory/                  (the factory — no longer directly adoptable)
├── apps/
│   └── demo/                      renamed from apps/web; later apps/<preset-2>, …
├── packages/                      the 10 @factory/* packages, untouched
│   └── create/                    NEW — the installer CLI (npm: fabulous-factory)
├── payload/                       NEW — adopter surface, common to all presets
│   ├── CLAUDE.md  AGENTS.md  LAUNCH.md
│   ├── agents/    fab-smith, fab-muse, fab-scribe, fab-preflight
│   └── skills/    define-product, add-a-feature, enable-billing,
│                  swap-llm-provider, brand-it, make-it-yours, pre-ship-check
├── presets/
│   └── demo/
│       ├── preset.json
│       └── overlay/               PRODUCT.md seed, preset LAUNCH.md items, …
└── .factory/                      DELETED
```

Notes:

- **App naming.** In the factory each preset app keeps its own name (`apps/demo`,
  package name `demo`). Compose renames the chosen app to **`apps/web` / name `web`** in
  the output, so every adopter repo is uniform. The rename is a directory move plus one
  `name` field patch; app-path-coupled root files that cannot be shared (root
  `package.json`, Dockerfile) ship as payload variants (§5).
- **Config generalization makes the rename cheap.** eslint's `no-raw-handler` route
  detection is already app-name-agnostic. The `apps/web` hardcodings are the eslint
  `FRAMEWORK_MOUNTS` exemptions (2 entries) and **5 dependency-cruiser rules / 6 regex
  sites** (better-auth allowlist ×2, auth-route subpath, middleware cookies-subpath,
  inngest mount ×2); all are generalized to `apps/[^/]+/…` once, after which the same
  configs serve the multi-app factory and the single-app output. Generalizing
  `^apps/web/middleware\.ts$` → `^apps/[^/]+/middleware\.ts$` deliberately extends the
  same trust to every preset app — accepted, since preset apps are first-party code
  under the same review gates.
- **Root rename.** The workspace root package is renamed (`fabulous-factory-monorepo`)
  because pnpm forbids the root and `packages/create` sharing the name
  `fabulous-factory`. Both npm names (`fabulous-factory`, `create-fabulous-factory`)
  were verified unclaimed on 2026-08-22.

## 5. Compose model

A scaffolded project = **base + payload + preset**, assembled at **publish time** into a
complete inert file tree per preset, embedded in the npm tarball under
`templates/<preset>/`.

**`templates/` is ephemeral pack-time output**: generated by `prepack`, never
committed, gitignored, and excluded from every gate (eslint global ignores,
dependency-cruiser `exclude`, the `packages/create` vitest project). Golden tests
compose into a temp dir, never into the tracked tree — otherwise the nested copies of
`packages/*` would be crawled by root vitest's `packages/*` project glob, linted, and
dependency-cruised with regexes that no longer match.

- **Base (common infrastructure, shared verbatim):** `packages/*` (excluding
  `create`), root configs (eslint, dependency-cruiser, tsconfig, vitest, prettier,
  commitlint, pnpm-workspace.yaml incl. supply-chain policy), `.husky/`,
  `.github/PULL_REQUEST_TEMPLATE.md` (load-bearing for the guarded-zones CI job),
  `LICENSE`, `.gitattributes`, `.devcontainer/`, `docs/agents/conventions.md`, the
  guides and doc templates, shared skills (`fabulous-feature`, `add-a-job`), shared
  agents (`fab-warden`, `fab-bastion`, `fab-medic`), `.env.example`, `gitignore`
  (stored undotted — npm strips `.gitignore` from tarballs — and re-dotted on install).
- **Payload (adopter surface + maintained adopter variants):** adopter
  `CLAUDE.md`/`AGENTS.md`/`LAUNCH.md` at root, the 4 adopter agents into
  `.claude/agents/`, the 7 adopter skills into `.claude/skills/`. Plus the root files
  that cannot be shared with the factory and are **maintained as payload variants, not
  derived by patching**: the CI workflow (compose/scaffold-and-check jobs stripped),
  the Dockerfile (+ docker-compose if it diverges) with `apps/web` paths — the factory's
  own Dockerfile says `apps/demo` and COPYs `packages/create/package.json`, which
  doesn't exist in adopter repos and COPY cannot be conditional — the root
  `package.json` (name stamped at install, `--filter web` scripts, no factory-dev
  scripts), and a README **adopter seed** (per-preset overridable; the factory's own
  README describes the factory and is never shipped). Everything `factory:init` did at
  the adopter's desk happens here.
- **Preset:** the chosen app renamed to `apps/web`, `PRODUCT.md` seed, preset-specific
  `LAUNCH.md` items (see merge rule below), preset-specific marketing/onboarding copy.
- **Lockfile:** the release pipeline captures the `pnpm-lock.yaml` produced by the
  scaffold-and-check job (§8.3) into each preset's template, so shipped installs are
  reproducible and match exactly what CI validated — avoiding the classic create-*
  failure where fresh resolution breaks the day after a green release, and preserving
  the supply-chain policy's bite (`minimumReleaseAge`, overrides) from first install.

**LAUNCH.md merge rule:** `payload/LAUNCH.md` carries the shape-generic items plus an
explicit insertion marker (`<!-- preset:items -->`); each preset overlay provides a
fragment inserted there at compose time (the demo's fragment holds "Demo logic" and
"Template showcase"). The drift test re-pins the _composed demo output_ at 9 items.

- **Never shipped:** factory-dev skills (`add-integration-package`, `write-adr`,
  `release-template`), factory agents (`fab-forge`, `fab-steward`), `payload/`,
  `presets/`, `packages/create/`, `docs/superpowers/`, research dumps, `.factory/`.
  The shipped `.factory/config.json` is exactly `{"stage":"prototype"}` — the
  `template` flag (read nowhere; the real signal was always the handoff dir) dies.

A `compose.config.ts` in `packages/create/` declares these lists **explicitly**
(include/exclude globs + per-preset entries). No heuristics. A golden test pins the
output shape the way `factory-init.test.ts` pins promotion today.

### 5.1 preset.json contract

Plain JSON, parsed with `JSON.parse` — no comments, no trailing commas:

```json
{
  "id": "demo",
  "label": "Untangle demo",
  "description": "Full working micro-SaaS: capture → normalize → daily plan",
  "appDir": "apps/demo",
  "status": "available",
  "packages": null
}
```

`status` is `"available"` or `"coming-soon"` (listed in the picker, not installable);
`packages` is reserved for future leaf pruning — `null` means all.

## 6. CLI — UX and packaging

```
$ npx fabulous-factory@latest install
┌ fabulous-factory
◇ Project name › my-saas
◇ Preset       › ● Untangle demo (full working micro-SaaS)
                 ○ …coming-soon presets listed, not selectable
◇ Install dependencies with pnpm? › yes
◇ Initialize git repository?      › yes
└ Done. cd my-saas → cp .env.example .env → set DATABASE_URL + BETTER_AUTH_SECRET → pnpm dev
   Then ask your agent: "what's left to make this mine?"
```

- **Package `fabulous-factory`** (`packages/create/`): bin with `install` as the default
  command (bare `npx fabulous-factory` works). Flags: `--preset <id>`, `--dir <path>`,
  `--no-install`, `--no-git`, `--yes` (non-interactive, for CI and tests). Prompts via
  `@clack/prompts`; bundled with tsup to self-contained JS. It is the first
  non-`private` package in the workspace and the only one with a build step.
- **Install steps:** copy `templates/<preset>/` → target dir (refuse a non-empty
  target), re-dot `gitignore` files, stamp the project name into root `package.json` and
  README, optional `git init` + initial commit, optional `pnpm install`, print next
  steps. Errors before copy leave nothing behind; errors after copy leave the partial
  dir with a clear message (no automatic deletion of a user's folder).
- **Package `create-fabulous-factory`:** a thin alias exposing the same bin so
  `npm create fabulous-factory` / `pnpm create fabulous-factory` work. Published in
  lockstep, same version.
- **Constraints:** `packages/create` must satisfy the workspace rules — no
  `process.env` outside allowed paths (add `packages/create/src/**` to
  `PROCESS_ENV_EXCEPTIONS` only if genuinely needed) and no imports from `apps/*`.
  Note the dependency-cruiser DAG rules only constrain _existing_ packages' `from`
  paths — nothing would stop a new package's own imports by default — so M3 adds a
  proactive `dag-create-imports-no-workspace-package` rule enforcing the v1 target
  that `packages/create` imports no workspace package (it manipulates files, not
  factory code).

## 7. Retirement of the promotion machinery

Deleted outright:

- `packages/config/scripts/factory-init.ts` + `factory-init.test.ts` (assertions reborn
  as compose golden tests).
- `HANDOFF_NAG` / `isHandoffPresent` / `template` handling in `factory-stage.ts`
  (`loadStage` survives).
- The hardcoded roster strings + nag in `factory-status.ts`; the handoff blocker + nag
  in `preflight.ts`; the nag section in `doctor.ts`.
- `.factory/handoff/` (content moves to `payload/` and `presets/demo/overlay/`).
- Handoff-dependent test blocks: `factory-agents.test.ts` root/handoff tiering
  (re-pointed at root + `payload/agents/`, keeping frontmatter/disjointness checks),
  `factory-docs.test.ts` mirror block (**re-pointed at `payload/`, not deleted** — the
  golden tests validate composed output, but only this test guards the source files a
  maintainer edits), `launch-checklist-drift.test.ts` (re-pointed at the composed demo
  output per §5's merge rule), `preflight.test.ts` handoff cases,
  `factory-status.test.ts` roster/nag cases.
- ADR-0002 is superseded by a new ADR ("compose at publish time replaces promotion at
  adoption time") recorded via the `write-adr` skill.

Kept, because adopters still need them: `factory-status` (LAUNCH.md renderer),
`launch-checklist.ts`, `preflight` (minus handoff blocker; `sk_test_` and
conventions-pointer checks remain), `doctor`, `gen` — with `gen.ts`'s hardcoded
`apps/web` replaced by "detect the single dir under `apps/`; require `--app` when
several exist", correct in both the factory and every output.

Rewritten framing: README + CONTRIBUTING ("template repo" → "factory + installer");
marketing components rendering `pnpm factory:init` (`quickstart-strip.tsx`,
`built-on-factory.tsx`, hero/header/features copy) now advertise the npx command;
`release-template` skill Phase 2 (clone-and-init → scaffold-and-check);
`fab-steward`'s remit (handoff mirrors → payload/presets/compose config);
`add-a-job`'s "survives pnpm factory:init" description; `docs/guides/release-checklist.md`
§5 (the GitHub **Template repository** checkbox is turned **off** — the installer is the
only supported door).

## 8. Publish pipeline and validation

1. `packages/create` `compose` script assembles `templates/<preset>/` per §5.
2. **Golden tests** (fast, every CI run): composed output has adopter CLAUDE.md at
   root, LAUNCH.md seeded, no `.factory/handoff/`, no factory-dev skills/agents, all 7
   adopter skills + 4 adopter agents + 3 shared agents present, `docs/agents/conventions.md`
   pointer intact in both CLAUDE.md and AGENTS.md, `gitignore` undotted in the template
   and re-dotted by install.
3. **Scaffold-and-check** (release CI job, per preset): run the CLI with `--yes` into a
   temp dir, `pnpm install`, then run the _output's own_ `pnpm check` and the minimal
   boot (migrate + `/api/health`). This validates what adopters actually receive. The
   `pnpm-lock.yaml` this job produces is captured into the preset's template (§5).
4. Publish: `prepack` runs compose into the ephemeral `templates/` (§5); git tag
   `vX.Y.Z` matches the npm version; both packages published together.

## 9. Testing strategy

- Compose engine: pure unit tests (config parsing, rename/undot logic) + golden tests
  against a real compose run into a temp dir.
- CLI: integration test driving the bin with `--yes --no-install --no-git` and
  asserting the tree; non-empty-target refusal; name stamping.
- Existing suites: `factory-agents.test.ts` keeps frontmatter/description validation,
  re-pointed at root + `payload/agents/`; drift test re-pointed at payload + overlays.
- The full scaffold-and-check job runs on release branches/tags only (cost), golden
  tests everywhere.

## 10. Explicitly out of scope for v1

- Package pruning per preset (§3), beyond reserving the `preset.json` field.
- The two future presets themselves — only `demo` ships; the picker lists coming-soon
  entries from `preset.json` `status`.
- Install-time composition, remote template fetching, offline caches, version-skew
  handling between CLI and templates (embedded model makes it moot).
- A `create-fabulous-factory`-first branding switch; `fabulous-factory` stays primary.
- Windows CI coverage for the CLI (path handling written portably; CI job is
  linux-only for now).

## 11. Migration milestones (input to the implementation plan)

Each independently shippable, `pnpm check` green after each, run through
fabulous-feature phases 3–7:

- **M1 — Generalize + rename:** app-name-agnostic eslint/dep-cruiser mounts (5 rules /
  6 regex sites, §4); rename `apps/web` → `apps/demo`; update hardcoded spots
  (Dockerfile deps-stage COPY, standalone-copy lines and CMD, CI guarded zones, root
  `--filter web` scripts, `gen.ts` + tests, CONTRIBUTING, fab-bastion description);
  **regenerate `pnpm-lock.yaml`** (the importer key `apps/web:` changes, or every
  frozen-lockfile CI job fails). Repo behavior unchanged.
- **M2 — Payload extraction:** `.factory/handoff/` → `payload/` + `presets/demo/`;
  retire init/nag machinery and its tests; new ADR; README/CONTRIBUTING/docs rewrite;
  fab-steward remit update; `release-template` skill rewrite (its Phase 2 exercises
  `factory:init`, deleted in this milestone — docs-only, cannot wait for M4);
  retarget the in-app `pnpm factory:init` mentions (`quickstart-strip.tsx` etc.) to
  the npx command. Accepted window: the npx command is advertised before the package
  exists (M4) — only visible if the live demo redeploys between M2 and M4.
- **M3 — The CLI:** `packages/create` + compose engine + golden tests + the
  `dag-create-imports-no-workspace-package` rule + gate exclusions for ephemeral
  `templates/` + payload Dockerfile/CI/package.json variants + local dry-run path
  (`node packages/create/dist/cli.js install --yes` from the repo).
- **M4 — Publish + polish:** scaffold-and-check CI job with lockfile capture; npm
  publishing (both names, lockstep versioning); marketing site update to the npx
  story; turn off the GitHub template checkbox at first publish.
