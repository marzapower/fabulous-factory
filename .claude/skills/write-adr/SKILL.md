---
name: write-adr
description: Record an architecture decision as a numbered ADR in docs/adr/. Use when a decision has real trade-offs or is hard to reverse — not for routine implementation detail.
---

# Write an ADR

See `docs/adr/0001-record-architecture-decisions.md` for why this exists at all: agents
retain nothing between sessions, so a decision that isn't written down is a decision a
later agent will silently re-litigate or reverse.

## When an ADR is warranted

Ask: does this decision have a real trade-off, or would reversing it later be costly?
Yes to either → write one. Examples that qualify: choosing a library where alternatives
were seriously considered, a schema or API shape that's expensive to change later, a
deliberate deviation from `docs/agents/conventions.md` with a documented reason. Examples
that don't: a bug fix, a routine refactor, a scaffold's TODO filled in as the SPEC
already specified.

## Steps

1. Find the next number: `ls docs/adr/` and increment the highest existing prefix
   (`0001-`, `0002-`, …).
2. Copy `docs/templates/ADR.md` to `docs/adr/NNNN-slug.md`, where `slug` is a short
   kebab-case description of the decision (not the topic — "use-postgres-rate-limiter",
   not "rate-limiting").
3. Fill in **Status** (`proposed` while under discussion, `accepted` once settled),
   **Context** (the forces at play, stated as they are — not the solution), **Decision**
   (active voice: "We will …"), **Consequences** (what gets easier or harder, including
   the honest downsides and the alternatives you didn't pick).
4. If this ADR reverses or replaces an earlier one, update the old ADR's Status to
   `superseded by ADR-NNNN` — don't just leave it looking current.

## Verify

`pnpm exec prettier --check docs/adr/NNNN-slug.md` — every authored file in this repo
must be prettier-clean.
