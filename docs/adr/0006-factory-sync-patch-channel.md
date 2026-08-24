# ADR 0006: factory:sync — a scoped three-way patch channel on top of the snapshot model

**Status:** accepted

## Context

ADR-0005 replaced template-clone distribution with a published npm installer: a scaffolded
repo is composed once, at publish time, into an atomic `npm pack` tarball and installed by
`npx fabulous-factory@latest install`. That's an intentional snapshot — the scaffolded
repo is born a product repo, with no live link back to the factory, no `factory:init`
promotion step, and (by ADR-0003) no hash-based freshness ledger nagging the adopter about
drift from upstream.

The snapshot model is right for the payload (`CLAUDE.md`, agents, skills, `LAUNCH.md`) —
that's meant to diverge immediately, edited by the adopter as their product's needs
depart from the factory's defaults. It's the wrong model for a narrow slice of the base:
`packages/core`'s kernel (`defineHandler`/`defineAction`, `safeFetch()`, the rate-limit
wrapper) and `eslint.factory-rules.mjs` (the lint rules that make the kernel's contracts
load-bearing rather than advisory) are infrastructure a scaffolded repo doesn't want to
fork on day one. A security fix or a new guard rail added to the kernel after a repo is
scaffolded currently has no way to reach that repo at all — the adopter would have to
notice the factory shipped a fix and hand-port it, with no tooling to help and no way to
tell which parts of their now-diverged `packages/core` are still upstream-identical.

## Decision

We will add `pnpm factory:sync`, a CLI that runs **inside a scaffolded repo** and pulls a
narrow, explicitly enumerated set of files forward from the factory version the repo was
scaffolded at to a newer one, via a three-way merge against whatever local edits exist.

**Provenance.** The installer (`packages/create/src/install.ts`) now stamps
`.factory/config.json` at install time — via `stampProvenance()`
(`packages/create/src/lib/provenance-stamp.ts`) — from the compose-time seed
`{ "stage": "prototype" }` to `{ stage, preset, factoryVersion }`, preserving whatever
`stage` was already there. `factoryVersion` is read from the installed CLI package's own
`package.json` at runtime, not `process.env`. The compose-time template output itself is
unchanged (`packages/create/test/compose.golden.test.ts` still pins
`.factory/config.json` to exactly `{"stage":"prototype"}` at compose time) — provenance is
an install-time fact, not a compose-time one.

**Manifest.** `payload/.factory/sync-manifest.json` (composed to
`.factory/sync-manifest.json`) declares the sync channel's scope as a flat list of
**path prefixes, not globs**: `["packages/core/", "eslint.factory-rules.mjs"]`. A
trailing `/` matches every file under that directory; no trailing `/` matches only that
exact file. `packages/config` is **deliberately excluded** from v1's scope — adopters are
expected to edit `ENV_REGISTRY` directly as their product grows its own env vars, and a
sync channel that tries to three-way-merge a registry adopters are meant to actively
extend would generate more conflicts than it resolves. Widening the manifest later is a
one-line change to `sync-manifest.json`, not a redesign.

**Mechanism.** `factory-sync.ts` (`packages/config/scripts/`) resolves `--from`/`--preset`
from `.factory/config.json` (overridable by flag, required as explicit flags when either
is missing — the fallback for pre-provenance 0.2.0 scaffolds, which predate this ADR and
have no stamped provenance at all), refuses to run on a dirty git tree unless
`--allow-dirty`, then runs `npm pack fabulous-factory@<version>` for both the from- and
to-version, extracts each tarball, and diffs their `templates/<preset>/` tree against the
manifest-scoped slice of the local working tree. Per file: identical base/target → skip;
missing locally → copy from target; deleted upstream with the local copy still matching
base → delete; deleted upstream with local diverged → left alone and reported (never
silently deleted out from under an edit); anything else → a three-way merge via
`git merge-file`, conflict markers left in place and reported when the merge isn't clean.
The decision logic (`packages/config/scripts/factory-sync-plan.ts`'s `planSyncActions`) is
pure — no fs, no exec, no git — mirroring the existing `factory-stage.ts`/
`launch-checklist.ts` split; `factory-sync.ts` is the fs/exec/git side that builds the
three file snapshots and executes the plan. Exit code is 1 when any conflict remains
(including a "kept, upstream wanted to delete it" report), 0 otherwise.

**Version bump on any non-dry-run apply.** Every non-`--dry-run` run unconditionally
updates `.factory/config.json`'s `factoryVersion` to the resolved target version —
whether files were applied, some were left with conflict markers, or the manifest's
scope had nothing to change at all (a clean no-op) — so the stored base always tracks
the last version this repo was actually diffed against, and a conflict or a no-op never
leaves the next sync re-diffing against a stale base. The alternative (only bump on a
fully clean sync) would leave the stored base pointed at an old version forever if even
one file needs a hand-resolved conflict; the next sync would then re-diff against that
stale base and reopen every already-resolved conflict again. Bumping unconditionally
means a conflict is a one-time cost — the adopter resolves it once, and the _next_ sync
treats the now-hand-merged file as the new local baseline, same as it would with
`git rebase --continue`.

**Self-update limitation.** `factory-sync.ts` itself ships with every scaffold (it's how
`pnpm factory:sync` exists at all) but is **not** in the manifest — a bug fix to the sync
script itself has no channel back to a repo that already scaffolded an older copy of it.
This is a known, accepted gap for v1, not an oversight: putting the sync tool in its own
sync scope raises awkward self-modification questions (merging a running process's own
source under it) for marginal benefit, since sync-tool bugs are expected to be rare and
low-severity compared to kernel bugs.

## Consequences

Scaffolded repos gain a real, if narrow, path to receive fixes to the parts of the base
that are infrastructure rather than starting points — without reintroducing a live
upstream link or a freshness gate. `pnpm check` gates nothing about sync currency, exactly
as ADR-0003 requires for `LAUNCH.md`: `factory:sync` is a tool an adopter runs
deliberately, never a CI check, and this ADR does not create a hash-based freshness
mechanism of the kind ADR-0003 retired — there is no ledger, no "stale" flag, no gate
tied to whether a repo has synced recently.

The trade-off is real scope: three-way merging arbitrary source files is genuinely harder
to get right than a snapshot copy, and `packages/core`/`eslint.factory-rules.mjs` are a
deliberately small starting scope specifically because merge conflicts on a wider surface
(e.g. `packages/db` migrations, or `apps/web` itself) would be common and costly. A
pre-provenance (0.2.0) scaffold has no way to auto-detect its own version or preset and
must supply both explicitly — an acceptable one-time friction cost for the handful of
repos scaffolded before this ADR landed, not something worth building version-sniffing
heuristics for.

**Rejected: a subscribed upstream git remote, pulled/rebased like a fork.** This is
exactly the "live link back to the factory" ADR-0005 deliberately cut when it moved to
compose-at-publish-time — reintroducing it here for a subset of files would resurrect the
same promotion-happens-at-the-adopter's-desk failure mode ADR-0005's Decision section
describes, just scoped narrower. Rejected for the same reasons ADR-0005 gives.

**Rejected: keep `packages/config` in the v1 manifest.** Considered because
`packages/config` is also shared infrastructure with the same "adopters shouldn't have to
fork it" argument as `packages/core`. Rejected because `ENV_REGISTRY` is exactly the file
adopters are expected to actively grow (new env vars for new integrations) rather than
leave upstream-identical — syncing it would manufacture merge conflicts on every sync run
for nearly every real adopter, the opposite of what this channel is for.
