---
name: fabulous-feature
description: Process for planning and building complex features with self-verification cycles — analysis, contract-based plan, adversarial critique, parallel implementation agents, independent review, full gates. Use for new features and structural refactors, not for one-line fixes.
---

# Fabulous Feature — build process with self-verification

Binding workflow for every non-trivial change (new feature, structural refactor, anything
touching multiple modules). The orchestrator — the strongest model in the session — plans,
delegates, and verifies; implementation subagents build. Follow the project conventions in
CLAUDE.md and `docs/agents/conventions.md`: DRY and KISS over industry ceremony.

## Phase 0 — Product decisions

If the brief leaves product decisions open (UX, behavior, scope), ask your human partner
with structured questions BEFORE starting. Minor technical details (names, sentinel
values, tie-breaks): decide autonomously and declare them in the plan. Then work
autonomously to completion.

## Phase 1 — Analysis of the real state

Read the involved files BEFORE proposing anything: never rely on memory, summaries, or
assumptions. The analysis must state what already exists, what is missing, what gets
reused.

## Phase 2 — Architectural proposal

Written plan presented to your human partner, containing:

- **explicit contracts**: exact signatures of new/changed functions, files touched per
  task, error semantics;
- declared reuse of existing code (no speculative abstractions);
- planned tests (pure unit + Postgres integration where needed);
- explicitly excluded impacts (e.g. "zero migrations", "admin area untouched").

## Phase 3 — Plan critique (fresh high-capability agent)

Spawn a fresh-context agent on the strongest available model (a `fork` agent where the
harness supports it) with a harsh read-only critic mandate: hunt logic bugs, edge cases,
races, DRY/KISS/design-system violations, test gaps. Every correction must cite real
code; inventing problems is forbidden. Required verdict: APPROVED / APPROVED WITH
CORRECTIONS / REJECTED. Fold ALL mandatory corrections into the plan; on REJECTED,
redesign and re-critique. Only an approved plan proceeds to phase 4.

## Phase 4 — Implementation (parallel subagents)

- Split into tasks with **DISJOINT files**: two parallel agents must never touch the
  same file. If A imports functions written by B, pin the exact signatures in both
  prompts and tell A that a red typecheck on B's imports alone is expected, not
  something to "fix".
- Track tasks with the harness's task tools (dependencies included), one owner per agent.
- Use the project's specialized agents where defined (e.g. a UI implementer for UI work);
  otherwise general-purpose agents on a fast implementation model.
- Every implementation prompt must contain: reference to CLAUDE.md, the list of ITS
  files, an explicit prohibition on other agents' files, exact contracts, tests to write
  following the patterns of existing test files, local verification (lint + format ONLY
  on touched files), a ban on committing, and the required report format.
- If an agent goes dormant (no report), check file mtimes to see whether it actually
  worked; if not, reassign to a fresh agent.

## Phase 5 — Independent review

- Run the project's code reviewer on the uncommitted diff, read-only (no test suites in
  its mandate: the orchestrator runs the gates). **Known fallback**: if the reviewer
  idles without a report even after one nudge, spawn a fresh read-only general-purpose
  agent with the same mandate.
- Visual/design review if there are visible UI changes.
- Blocking and minor findings: fix immediately — by the orchestrator when trivial,
  otherwise by a dedicated agent. Nits: at your discretion, but declare them in the
  final report.
- In parallel with the review, the orchestrator personally re-reads the diff at the
  critical points and verifies adherence to the critic-corrected plan, point by point.

## Phase 6 — Full gates

All green, run by the orchestrator, repeated after every fix. Use the project's gate
command — in this repo:

```
pnpm check   # lint + boundaries + typecheck + tests
```

Integration tests run in both profiles (minimal: DATABASE_URL + BETTER_AUTH_SECRET; full:
all services mocked). Without a test database configured, the integration suite must skip
cleanly.

## Phase 7 — Closure

- Final report to your human partner: what the feature does, how the process went
  (critic's verdict, review outcome, gates), debts/nits left, decisions taken
  autonomously.
- Commit ONLY on explicit approval, using the Conventional Commits format. Never push
  without separate explicit approval.
