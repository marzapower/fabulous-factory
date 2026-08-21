# ADR 0003: Replace the hash-based Adoption Ledger with a declarative LAUNCH.md checklist

**Status:** accepted

## Context

The Adoption Ledger inferred adoption progress from SHA-256 hashes of nine shipped
files (`.factory/manifest.json`, computed by `factory-ledger.ts`). The hash check
answers _"was this file edited?"_, but the question that actually matters before
shipping is _"was this item completed?"_ — and those two questions diverge badly. A
one-character edit to `terms/page.tsx` flips `legal-pages` to `touched` while the Terms
remain legally empty; a formatter pass alone can do the same. The manifest's own
comment admitted the per-item recipes, not the hashes, were the real gate — but nothing
recorded completion as a first-class fact anywhere in the repo. Field experience
(an adopted repo, 2026-08-21) confirmed the failure mode directly: the ledger reported
7 of 8 items customized while the product remained launch-incomplete on several
semantically-unfinished items the hash check had no way to see.

## Decision

We replace the hash mechanism entirely with a declarative launch checklist,
`LAUNCH.md`, staged at `.factory/handoff/LAUNCH.md` and promoted to the adopter's repo
root on `pnpm factory:init` (copy-if-absent, so a re-run never clobbers ticked
progress). Each of the checklist's items carries explicit, human-readable acceptance
criteria ("Done means") instead of a hash; items with real judgment calls (legal
copy, the product definition itself, pricing) are additionally marked 🔒 and require
**human sign-off**, recorded on the item's Signed off line, before an agent may tick
them. Items marked `blocks launch` are the hard gate: `pre-ship-check`'s first phase,
and no other point in the workflow, refuses to proceed while one is unchecked. Open 🔒
items that do _not_ block launch (e.g. the plans catalog) are surfaced with a
recommendation instead of gating.

Enforcement is **agent and skill discipline only — there is no CLI gate**. `pnpm
factory:status` survives as a dumb, read-only renderer of the checklist (plus its
existing staged-agents roster announcement); it always exits 0. `pnpm preflight`
survives as the mechanical env gate (live Stripe key, pointer-file staleness, handoff
presence, the email-disabled warning) and loses its per-item ledger loop entirely —
`LAUNCH.md` is the semantic gate, preflight is the mechanical one, and the two no
longer overlap.

## Consequences

Checking an item off now requires reading its criteria and actually verifying them (or,
for 🔒 items, getting a human to say so) rather than the mechanical fact of a diff
existing. This makes the checklist harder to satisfy accidentally and impossible to
satisfy with a no-op edit or a formatter pass — the exact failure mode that motivated
this ADR.

**Accepted loss, explicit:** nothing mechanical detects "a shipped factory default was
edited" or "a newly shipped default lacks a checklist item" anymore. The only test
guarding the seeded item list is a template-repo drift test asserting the staged
`.factory/handoff/LAUNCH.md` still parses to exactly the 9 seeded items with the
correct markers — it guards the seeded list, nothing else. If a future factory default
ships without a corresponding `LAUNCH.md` item, no test will fail; a reviewer has to
catch it. This is the price of dropping hashes, accepted by design in exchange for a
gate that actually measures completion instead of file-touch.

**Rejected: a CLI gate on the checklist.** A script that parses `LAUNCH.md` and exits
non-zero on an unchecked `blocks launch` item was considered and rejected. "Done means"
criteria are inherently things a machine cannot verify — whether Terms name the real
legal entity, whether the landing page copy actually speaks the product's voice — so a
CLI gate could only re-implement the old hash check's blind spot under a new name: it
would happily pass a checklist ticked by rote without the criteria having been checked
at all. The discipline has to live in the agent reading and verifying the criteria, not
in a parser counting checkboxes.

**Rejected: keeping the hashes as a supplementary cross-check.** Running the old
manifest alongside `LAUNCH.md` — hashes as a tripwire, checklist as the semantic
record — was considered and rejected as complexity that pays for itself only in the
narrow case the drift test already covers (a seeded item silently going untracked). Two
divergent sources of truth about the same nine items is itself a maintenance and
confusion cost, and the field-experience failure this ADR responds to was exactly a
human trusting the hash source when it was already wrong.
