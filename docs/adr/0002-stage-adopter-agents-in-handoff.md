# ADR 0002: Stage adopter agents in the handoff, not at root

**Status:** accepted

## Context

The template shipped guided workflows (`.claude/skills/`) but no subagent roster. Every
non-trivial change therefore ran in one context, and `fabulous-feature` — the binding build
process — could only gesture at "the project's specialized agents where defined" and "the
project's code reviewer", abstractions that had no concrete instances anywhere in the repo.

Skills already resolve a three-way split: adopter skills staged in `.factory/handoff/skills/`,
factory-dev skills at root, shared skills that survive `pnpm factory:init`. Agents face the
identical problem — `fab-forge` maintains the template's own packages and would only confuse
someone building a product, while `fab-smith` builds product features that do not exist in the
template repo — but `runFactoryInit` knew nothing about agents, so anything staged in the
handoff would have been deleted along with it.

The competing option was to ship all agents at root and have `factory:init` delete only the
factory-dev-only ones. That is less code — no promotion step at all — and it would let the
template's own maintainers dogfood the adopter agents.

## Decision

We will mirror the skills architecture exactly: adopter agents live in
`.factory/handoff/agents/`, factory-dev agents (`fab-forge`, `fab-steward`) live in
`.claude/agents/` and are deleted on init, and the three agents that are useful in both modes
(`fab-warden`, `fab-bastion`, `fab-medic`) ship at root and survive it. `runFactoryInit` gains
a promotion step and a `FACTORY_DEV_ONLY_AGENTS` list alongside the existing
`FACTORY_DEV_ONLY_SKILLS`.

The two promotion loops are deliberately not factored into a shared helper. A skill is a
directory that gets moved after clearing a stale destination — `renameSync` cannot overwrite a
non-empty directory — while an agent is a single file that gets cleared and copied. One
function with a mode flag would be longer and harder to read than the two loops it replaced.

## Consequences

An adopter's agent list contains only agents that can act on their repo, and the tier an agent
belongs to is visible from its path rather than from a comment. `fabulous-feature` can now name
real agents, which removes the unresolved abstraction it had been carrying.

The cost is that the template's own maintainers cannot use the adopter agents while developing
the template — `fab-smith` is invisible here — so a change to an adopter agent is verified by
reading it and by `packages/config/test/factory-agents.test.ts`, not by running it. We accept
this: it is the same trade-off already made for adopter skills, and the alternative leaks
product-shaped tooling into a repo that has no product.

Two failure modes are structural rather than obvious, so tests pin them. A handoff agent whose
name collides with a root agent would be silently installed over a shared agent, or installed
and then swept if it collided with a factory-dev name — `factory:init` reports success either
way, so a disjointness assertion guards it. And a malformed frontmatter block is neither a lint
error nor a type error; Claude Code simply does not load the agent. The per-directory agent
counts, the name-matches-filename check, and the ban on `": "` inside an unquoted description
exist because nothing else in the toolchain would go red.
