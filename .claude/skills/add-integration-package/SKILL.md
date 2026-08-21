---
name: add-integration-package
description: Add a new optional service integration to the factory — registry entry, adapter package, capability wiring, contract tests, doctor hint, boundary allowlist. Use when the template itself gains a new integration seam (e.g. a second email provider, a new billing adapter).
---

# Add an integration package

Factory-dev work: this changes what every future adopter's clone ships with. Follow
`docs/agents/conventions.md` throughout — this skill is the checklist for staying inside
it while adding a new seam.

## Phase 1 — Registry entry

Add every new env var to `ENV_REGISTRY` in `packages/config/src/registry.ts`: `name`,
`group`, `description`, `example`, and explicit `required`/`secret`/`enables` booleans
(never omitted — the shared literal shape depends on it). `enables: true` means the
var's mere presence lights up the capability; that's what `doctor` and the capability map
key off.

## Phase 2 — Capability wiring

Wire the new service into its group's capability resolution (`packages/config`'s
capability map) so `isEnabled(service)` and the typed config object reflect it. If it's a
genuinely new service group (not core/auth/billing/llm/email/jobs/analytics/
observability), add the group to `ServiceGroup` first.

## Phase 3 — Adapter package

The vendor SDK import lives ONLY inside the new adapter's own module, behind a guarded
dynamic import — no SDK code executes when the service is disabled, and a misconfigured
service can never crash an unrelated feature. Export the same interface every other
adapter/fallback in that package exports.

## Phase 4 — Contract test suite

Every adapter (including a `disabled`/no-op one, if you're adding a new fallback) passes
the SAME shared interface test suite as its siblings — that suite, not a hand-written
duplicate, is what proves "same interface."

## Phase 5 — Doctor hint + boundary allowlist

Doctor derives its enablement hint from `ENV_REGISTRY.filter(v => v.group === group &&
v.enables)` automatically — no hand-maintained hint list to update, just confirm the
registry entries from Phase 1 are correct. Add the new vendor SDK to
`.dependency-cruiser.cjs`'s confinement rules (the new adapter path is the only allowed
`from`, same shape as the existing `no-better-auth-outside-auth`-style entries).

## Phase 6 — Regenerate

```bash
pnpm gen:env-example
pnpm check
```
