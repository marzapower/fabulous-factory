# ADR 0004: The shipped demo becomes a keepable base, not disposable example code

**Status:** accepted

## Context

Every prior demo the template shipped (the page monitor) was written to be deleted.
`make-it-yours` Phase 2 was a deletion recipe: `rm -rf packages/jobs/src/demo/`, drop a
table, remove four barrel touchpoints, done. The demo's only job was to exercise every
package end to end and prove graceful degradation; nothing about its shape was meant to
survive contact with a real product.

Milestone 11 replaces that demo with Untangle, a brain-dump→tasks workspace, and splits
it into two halves along a directory boundary: a domain-agnostic run engine
(`packages/jobs/src/runs/`, `packages/db/src/schema/run.ts`, the SSE transport, the
run-history page) and a renameable domain riding on it (`packages/jobs/src/tasks/`,
`packages/db/src/schema/task.ts`, the workspace UI). The run engine — steps, two
drivers, persisted run/step rows with cost and token accounting — is exactly the
infrastructure almost any AI-shaped feature needs, and rewriting it from scratch on
every adopted clone is pure waste. The question this ADR answers is whether that engine
should ship as something adopters are expected to keep, or as more disposable example
code that happens to look reusable.

## Decision

We ship the run engine as **keepable, load-bearing infrastructure**, not example code.
`make-it-yours` Phase 2 changes its verb from _delete the demo_ to _rename the domain_:
an adopter keeps `packages/jobs/src/runs/` and everything downstream of it verbatim, and
renames only `packages/jobs/src/tasks/` and its schema to their own product's noun. The
keep/rename boundary is encoded directly in the directory names so it doesn't depend on
anyone reading a comment to find it.

## Consequences

An adopter building anything AI-shaped — not just a brain-dump tool — inherits a tested,
cost-accounted, degradation-proof execution engine for free, and never has to design
that plumbing themselves. This is real, and it's the entire point.

**Costs, stated honestly, not just benefits:**

- **The demo code quality bar rises.** Code an adopter is expected to keep and build on
  is held to a different standard than code an adopter is expected to delete in week
  one. Bugs, awkward naming, or a shortsighted API choice in `runs/` now ships into
  every product built on this template, not just into a repo that gets thrown away in
  the first hour. This milestone's own critique cycle (K.14, ten corrections before
  merge) is evidence of that higher bar being paid for, not evidence it's free.
- **`make-it-yours` grows harder to write and to execute.** A deletion recipe is
  mechanical: `rm -rf` and a barrel cleanup, and the "done means" criterion is trivially
  checkable (nothing left, nothing dangling). A rename recipe is not: it has to name
  which half is which, walk through renaming a domain across a schema, a barrel, an
  event name, and a UI directory without breaking anything the kept half depends on, and
  trust the adopter to actually do the rename with the same rigor they'd have needed to
  delete cleanly. A half-renamed domain (some symbols carried, some still saying
  "task") is a worse failure mode than a half-deleted one, because it compiles and looks
  finished.
- **A keepable demo risks adopters shipping a product shaped like the template's
  example.** The clean, fast path is now "keep the workspace, rename the nouns" rather
  than "design your own feature from a blank slate." That path is faster precisely
  because it doesn't force a founder to think from first principles about what their
  product's core loop actually is — the risk is real products that are recognizably
  "Untangle with different labels" rather than something an adopter would have designed
  unprompted. `define-product`'s interview (persona, pricing, distribution) exists
  independently of this decision and is the mitigation, not a guarantee.
- **A second decision point that didn't exist before.** Deleting a demo is a decision
  every adopter makes once and moves past. Choosing to rename vs. delete the engine is a
  new fork adopters must actually reason about — most will want to keep it, but the
  template no longer collapses everyone onto a single well-worn path.

**Rejected: ship the run engine as a separate always-kept package, with `tasks/` as the
only "demo."** This was considered so the keep/rename boundary would be enforced by the
package DAG instead of by discipline and directory naming alone. Rejected because it
would require new `dag-*` rules and a new workspace package for zero additional
adopter-facing safety — `packages/jobs`' existing allowlist already covers everything the
engine needs, and a same-package split still lets `runs/` and `tasks/` share the DAG
row while the directory names alone carry the semantic boundary (`run.ts` never imports
`task.ts`, verified by review and by the schema's own doc comment).
