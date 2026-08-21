# Fabulous Factory — Development Master Plan

**Date:** 2026-08-20
**Source spec:** `docs/superpowers/specs/2026-08-20-fabulous-factory-design.md` (approved)
**Process:** `fabulous-feature` cycle per milestone. This document holds the milestone map
(M1–M10) and cross-milestone invariants; the full implementation contracts live in one
file per milestone under `milestones/` (index at the bottom).

---

## Part A — Milestone map (from spec §14)

Each milestone is one fabulous-feature cycle: contracts → critique → parallel
implementation → review → gates → approval-gated Conventional Commit.

| #   | Name                        | Delivers                                                                                                                                                                                                                                                 | Exit criterion                                                                                 |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| M1  | Workspace + config keystone | pnpm workspace, `packages/config` (server-only capability map, env registry, `ClientConfigProvider`), generated `.env.example`, `pnpm factory:doctor`, commitlint/husky, minimal `apps/web` skeleton, CI with **minimal-profile boot check**             | CI green: lint, typecheck, unit tests, boot check with only `DATABASE_URL` set                 |
| M2  | Data + auth + app shell     | `packages/db` (Drizzle schema/client/migrations/seed), `packages/auth` (Better Auth, `requireSession`), Tailwind + shadcn/ui app shell, `.devcontainer`/Codespaces, predev self-healing migrations                                                       | First milestone of the promise: full app boots with only Postgres; signup/login works          |
| M3  | Enforcement kernel          | `packages/core`: `defineHandler`/`defineAction`, raw-handler lint ban, boundary rules (dependency-cruiser/eslint-boundaries), security headers + CSRF, Postgres rate limiter, `safeFetch`, `untrusted()`, guarded zones, gitleaks/audit/semgrep CI gates | A raw route handler fails lint; all existing routes migrated to wrappers; boundary suite green |
| M4  | Thin services               | `packages/email` (resend/console/disabled), `packages/analytics` (PostHog + no-op), `packages/observability` (Sentry + OTel + no-op); auth×email verification posture (§5.2)                                                                             | Contract suites pass for every transport/no-op; doctor reports the three services              |
| M5  | LLM gateway                 | `packages/llm`: `generate()`, profiles local/openrouter/direct, routing config, `pricing.json` cost accounting, `LlmDisabledError`, OTel spans                                                                                                           | Unit tests for routing/cost math; degraded path typed and tested                               |
| M6  | Jobs + demo loop            | `packages/jobs` (Inngest client/functions), page-monitor demo: URL watch, cron fetch via `safeFetch`, hash diff, LLM summary, in-app feed, manual "check now" fallback                                                                                   | Golden-path smoke passes in both profiles; no-LLM-call-on-unchanged-hash tested                |
| M7  | Billing                     | `BillingProvider` interface, `adapters/{stripe,disabled}`, shared contract suite, webhook-cached subscription table, `plans.ts` catalog with `providerRefs`                                                                                              | Both adapters pass the same contract suite; checkout hidden when disabled                      |
| M8  | Docker + deploy             | Multi-stage Dockerfile (runtime + migrate images), compose profiles (base/jobs/llm), `/api/health` liveness-only, CI docker-build check                                                                                                                  | `docker compose up` is the minimal-boot quickstart; image builds with zero service env         |
| M9  | Factory layer               | Slim Adoption Ledger (`manifest.json`, `factory:status`, `preflight`), `.factory/handoff/` set, `factory:init`, adopter + factory-dev skills, `pnpm gen` scaffolds                                                                                       | `factory:init` one-shot works on a fresh clone; preflight stage-aware in CI                    |
| M10 | Polish + distribution       | Degradation-matrix tests, guides (deploy×2, llm-evals, make-it-yours), README final pass, live demo deploy, template publish + launch checklist                                                                                                          | Live demo up with "what's disabled" panel; quickstart verified from a clean clone              |

Cross-milestone invariants (enforced from M1, never regressed):

- English-only repo content; Conventional Commits.
- No `NEXT_PUBLIC_*` capability signals; capability map is server-only, request-time.
- `pnpm check` is the machine-checkable definition of done; it must stay green on a
  zero-config machine (integration tests skip cleanly with a visible notice).
- CI runs the suite in minimal profile from M1; the full (mocked) profile is added in M4
  when the first mockable service exists.
  (M4 debt, discovered in the M5 critique: that full-profile CI job was never actually
  implemented — owed to M8/M10, recorded in `milestones/m5-llm-gateway.md` §F.10.1.)

---

## Per-milestone contract files

Parts B+ were split out on 2026-08-20 (the single file had grown past 35k tokens; one
read per resume was the dominant process cost). Each finished Part is a frozen record —
contracts, binding "critique corrections", and "accepted deviations". During a cycle,
read Part A plus ONLY the active milestone's file.

| Part | Milestone                      | File                                  |
| ---- | ------------------------------ | ------------------------------------- |
| B    | M1 workspace + config keystone | `milestones/m1-workspace.md`          |
| C    | M2 data + auth + app shell     | `milestones/m2-data-auth-shell.md`    |
| D    | M3 enforcement kernel          | `milestones/m3-enforcement-kernel.md` |
| E    | M4 thin services               | `milestones/m4-thin-services.md`      |
| F    | M5 LLM gateway                 | `milestones/m5-llm-gateway.md`        |
| G    | M6 jobs + demo loop            | `milestones/m6-jobs-demo.md`          |
| H    | M7 billing                     | `milestones/m7-billing.md`            |

New milestones append a row here and a new file there (G=M6 → `m6-jobs-demo.md`, …).
