# ADR 0005: Compose at publish time replaces promotion at adoption time

**Status:** accepted

## Context

The factory was distributed as a GitHub template repo: adopters clicked "Use this
template", cloned the result in factory-dev mode, and ran `pnpm factory:init` to promote
the instruction set staged in `.factory/handoff/` over the maintainer's own `CLAUDE.md`,
`AGENTS.md`, and agent/skill roster (ADR-0002). That model carried three structural
limits, not just rough edges:

- **It only scales to one preset.** A second product shape (a smart web app with no
  billing, an API-only micro-service) would need a second branch or a second repo,
  reintroducing exactly the shared-infrastructure drift the factory exists to cure.
- **Promotion happened at the adopter's desk.** `factory:init` was a runtime script the
  adopter had to run correctly, and every guard built around it — the `HANDOFF_NAG`, the
  preflight handoff blocker, ADR-0002's staging discipline, the roster-sync tests —
  existed to police a step that shouldn't have been the adopter's job in the first place.
- **Nothing validated what adopters actually received.** The `release-template` skill
  verified clone-and-init by hand, once, per release. No CI job ever ran `pnpm check`
  against a post-init tree, so a broken promotion step could ship and stay broken until
  an adopter tripped over it.

## Decision

We will replace template-clone distribution with a published npm installer:
`npx fabulous-factory@latest install` (aliased as `pnpm create fabulous-factory`). The
installer scaffolds a repo that is **born a product repo** — common infrastructure, a
chosen preset app, and the adopter instruction set already installed — with no promotion
step left for the adopter to run.

A scaffolded project is assembled at **publish time**, not install time, as **base +
payload + preset**: the base is the 10 `@factory/*` packages and the root tooling
config, shared verbatim; the payload (`payload/`) is the adopter-facing `CLAUDE.md` /
`AGENTS.md` / `LAUNCH.md`, the adopter skills and agents, and the root files that can't
be shared with the factory (CI workflow, Dockerfile, root `package.json`, README seed);
the preset (`presets/<id>/`) is a product shape — its app, its `PRODUCT.md` seed, its
`LAUNCH.md` fragment. Presets are real, runnable workspace apps under `apps/*`, exercised
by the factory's own `pnpm check` every day, not template fragments that only get
compiled together at install time and might not actually build. The compose step runs
once, at package `prepack`, and embeds the result in the npm tarball under
`templates/<preset>/` — an atomic, versioned artifact, not a live git fetch.

## Consequences

The promotion machinery is deleted outright: `factory-init.ts` and its test,
`HANDOFF_NAG`/`isHandoffPresent`, the roster nags in `factory-status.ts` and
`preflight.ts`, and `.factory/handoff/` itself (its content lives on as `payload/` and
`presets/demo/overlay/`). ADR-0002, which justified staging adopter agents in the
handoff dir for exactly this promotion flow, is superseded by this ADR — the three-way
skill/agent split it introduced survives, but the mechanism that moved files from one
tier to another at the adopter's desk does not.

The factory stops being directly adoptable. Cloning this repo no longer gets you a
product starting point; it gets you the factory itself, useful only for building presets
and infrastructure or for contributing. That's a real loss of a low-friction path
("fork and go") in exchange for a distribution channel that scales past one preset and
that npm's atomic versioning makes safer than a live git clone.

What was manual verification becomes a machine-checked publish gate: a scaffold-and-check
CI job runs the installer with `--yes` into a temp dir, then runs the **output's own**
`pnpm check` and a minimal boot, on every release. This is strictly more validation than
`release-template`'s hand-run clone-and-init ever gave — the trade is that releasing now
depends on that job passing, where previously an adopter could clone a template repo that
happened to be temporarily broken without blocking anyone.

**Rejected: keep `factory:init` and add a second preset as a second `factory:init`
mode chosen at promotion time (e.g. an interactive prompt or a flag).** This was
considered because it's less new surface than a CLI package and a compose engine.
Rejected because it does nothing about the second and third structural limits above —
promotion still happens unverified at the adopter's desk — and because a prompt-driven
`factory:init` would need to carry every preset's app in the same clone, which is the
drift problem restated, not solved.
