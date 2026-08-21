# ADR 0001: Record architecture decisions in `docs/adr/`

**Status:** accepted

## Context

Agents retain nothing between sessions (spec §8.2) — every decision that matters beyond
the current diff has to persist as an artifact in the repo, or it is lost the moment the
session ends. Architectural decisions in particular — the ones with real trade-offs,
the ones a later agent (or human) will otherwise silently re-litigate or reverse without
knowing why they were made — need a durable, greppable record, not a comment buried in a
commit message or a Slack thread.

## Decision

We record architecture decisions as Markdown files in `docs/adr/`, numbered sequentially
(`0001-`, `0002-`, …), one file per decision, each instantiated from
`docs/templates/ADR.md`. An ADR is warranted for a decision with real trade-offs or
irreversibility — not for routine implementation detail; the `write-adr` skill has the
concrete bar. This ADR is itself the first entry, recorded via the same process it
describes.

## Consequences

Future agents and humans can answer "why is it built this way?" by reading `docs/adr/`
instead of guessing or re-deriving it from the diff. The cost is discipline: an ADR that
should have been written and wasn't leaves the same gap this decision exists to close —
the `write-adr` skill and `fabulous-feature`'s planning phase are the two points where an
agent should ask "does this decision need one?"
